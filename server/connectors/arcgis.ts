import type {
  Connector,
  ConnectorConfig,
  ConnectorState,
  NormalizedPermit,
  RawRow,
} from './base';
import { RateLimiter, exponentialBackoff } from './base';
import { classifyAsRoofing } from '../normalization/classifier';
import { generateFingerprint } from '../normalization/fingerprint';

export class ArcGISConnector implements Connector {
  private rateLimiter: RateLimiter;

  constructor(requestsPerMinute: number = 10) {
    this.rateLimiter = new RateLimiter(requestsPerMinute);
  }

  async validate(config: ConnectorConfig): Promise<void> {
    if (!config.endpoint_url) {
      throw new Error('ArcGIS endpoint_url is required');
    }
    if (!config.layer_id) {
      throw new Error('ArcGIS layer_id is required');
    }
  }

  async *backfill(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    let offset = 0;
    const limit = 1000;
    let fetched = 0;

    while (fetched < maxRows) {
      await this.rateLimiter.waitIfNeeded();

      const batchLimit = Math.min(limit, maxRows - fetched);
      const url = this.buildArcGISUrl(config, { offset, limit: batchLimit });

      const response = await exponentialBackoff(() => this.fetchArcGIS(url));

      if (!response.features || response.features.length === 0) break;

      for (const feature of response.features) {
        yield this.normalize(sourceId, sourceName, config, feature);
      }

      fetched += response.features.length;
      offset += batchLimit;

      if (response.features.length < batchLimit) break;
    }
  }

  async *incremental(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    // Use last_max_objectid or last_max_timestamp for incremental
    const whereClause = state.last_max_objectid
      ? `OBJECTID > ${state.last_max_objectid}`
      : state.last_max_timestamp
      ? `lastEditDate > timestamp '${state.last_max_timestamp}'`
      : null;

    let offset = 0;
    const limit = 1000;
    let fetched = 0;

    while (fetched < maxRows) {
      await this.rateLimiter.waitIfNeeded();

      const batchLimit = Math.min(limit, maxRows - fetched);
      const url = this.buildArcGISUrl(config, {
        offset,
        limit: batchLimit,
        where: whereClause,
      });

      const response = await exponentialBackoff(() => this.fetchArcGIS(url));

      if (!response.features || response.features.length === 0) break;

      for (const feature of response.features) {
        yield this.normalize(sourceId, sourceName, config, feature);
      }

      fetched += response.features.length;
      offset += batchLimit;

      if (response.features.length < batchLimit) break;
    }
  }

  private buildArcGISUrl(
    config: ConnectorConfig,
    params: { offset: number; limit: number; where?: string | null }
  ): string {
    const base = `${config.endpoint_url}/FeatureServer/${config.layer_id}/query`;
    const queryParams = new URLSearchParams();

    queryParams.set('outFields', '*');
    queryParams.set('f', 'json');
    queryParams.set('outSR', '4326');
    queryParams.set('resultOffset', String(params.offset));
    queryParams.set('resultRecordCount', String(params.limit));
    queryParams.set('orderByFields', 'OBJECTID');

    // Add roofing filter
    const roofingFilter =
      "(UPPER(PermitType) LIKE '%ROOF%' OR UPPER(Description) LIKE '%ROOF%')";

    if (params.where) {
      queryParams.set('where', `(${params.where}) AND ${roofingFilter}`);
    } else {
      queryParams.set('where', roofingFilter);
    }

    return `${base}?${queryParams.toString()}`;
  }

  private async fetchArcGIS(url: string): Promise<{ features: any[] }> {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ArcGIS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`ArcGIS API error: ${data.error.message}`);
    }

    return data;
  }

  private normalize(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    feature: any
  ): NormalizedPermit {
    const attrs = feature.attributes || {};

    // Common ArcGIS field mappings
    const permitType = attrs.PermitType || attrs.PERMIT_TYPE || attrs.TYPE || null;
    const workDescription =
      attrs.Description || attrs.DESCRIPTION || attrs.WorkDescription || null;
    const permitStatus = attrs.Status || attrs.STATUS || attrs.PermitStatus || null;
    const issueDate = attrs.IssueDate || attrs.ISSUE_DATE || attrs.IssuedDate || null;
    const addressRaw =
      attrs.Address || attrs.ADDRESS || attrs.SiteAddress || attrs.FullAddress || null;
    const parcelId = attrs.ParcelID || attrs.PARCEL_ID || attrs.APN || null;
    const ownerName = attrs.Owner || attrs.OWNER || attrs.OwnerName || null;
    const contractorName =
      attrs.Contractor || attrs.CONTRACTOR || attrs.ContractorName || null;
    const permitValue = attrs.Value || attrs.VALUE || attrs.Valuation || null;

    // Extract geometry
    let lat: number | null = null;
    let lon: number | null = null;
    let geomGeojson: any = null;

    if (feature.geometry) {
      if (feature.geometry.x !== undefined && feature.geometry.y !== undefined) {
        lon = feature.geometry.x;
        lat = feature.geometry.y;
      } else if (feature.geometry.coordinates) {
        [lon, lat] = feature.geometry.coordinates;
      }

      geomGeojson = feature.geometry;
    }

    // Parse address
    const addressParsed = this.parseAddress(addressRaw);

    // Generate fingerprint
    const fingerprint = generateFingerprint({
      street: addressParsed.street,
      city: addressParsed.city,
      state: addressParsed.state,
      parcelId: parcelId,
      issueDate: issueDate ? String(issueDate) : undefined,
      permitType: permitType,
    });

    // Classify as roofing
    const isRoofing = classifyAsRoofing(permitType, workDescription) ? 1 : 0;

    return {
      source_id: sourceId,
      source_name: sourceName,
      source_platform: 'arcgis',
      source_record_id: String(attrs.OBJECTID || attrs.ObjectID || Math.random()),
      permit_type: permitType,
      work_description: workDescription,
      permit_status: permitStatus,
      issue_date: issueDate ? this.formatArcGISDate(issueDate) : null,
      address_raw: addressRaw,
      address_parsed: addressParsed,
      parcel_id: parcelId,
      owner_name: ownerName,
      contractor_name: contractorName,
      permit_value: permitValue ? parseFloat(String(permitValue)) : null,
      lat,
      lon,
      geom_geojson: geomGeojson,
      fingerprint,
      is_roofing: isRoofing,
      provenance: {
        platform: 'arcgis',
        url: `${config.endpoint_url}/FeatureServer/${config.layer_id}`,
        fetched_at: new Date().toISOString(),
        fields_map: {
          permit_type: String(permitType || 'null'),
          work_description: String(workDescription || 'null'),
          address: String(addressRaw || 'null'),
        },
      },
      raw_blob_path: null,
    };
  }

  private formatArcGISDate(timestamp: number | string): string {
    if (typeof timestamp === 'string') return timestamp;
    // ArcGIS timestamps are in milliseconds
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
  }

  private parseAddress(address: string | null): {
    house_number?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  } {
    if (!address) return {};

    const parts = address.split(',').map((p) => p.trim());

    if (parts.length >= 2) {
      const streetPart = parts[0];
      const cityStateZip = parts.slice(1).join(', ');

      const stateMatch = cityStateZip.match(/\b([A-Z]{2})\b/);
      const zipMatch = cityStateZip.match(/\b(\d{5}(?:-\d{4})?)\b/);

      return {
        street: streetPart,
        city: parts[1] || undefined,
        state: stateMatch?.[1] || undefined,
        zip: zipMatch?.[1] || undefined,
      };
    }

    return { street: address };
  }
}
