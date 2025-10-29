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

export class SocrataConnector implements Connector {
  private rateLimiter: RateLimiter;

  constructor(requestsPerMinute: number = 10) {
    this.rateLimiter = new RateLimiter(requestsPerMinute);
  }

  async validate(config: ConnectorConfig): Promise<void> {
    if (!config.endpoint_url) {
      throw new Error('Socrata endpoint_url is required');
    }
    if (!config.dataset_id) {
      throw new Error('Socrata dataset_id is required');
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
      const url = this.buildSocrataUrl(config, { limit: batchLimit, offset });

      const rows = await exponentialBackoff(() => this.fetchSocrata(url, config.app_token));

      if (rows.length === 0) break;

      for (const row of rows) {
        yield this.normalize(sourceId, sourceName, config, row);
      }

      fetched += rows.length;
      offset += batchLimit;

      if (rows.length < batchLimit) break;
    }
  }

  async *incremental(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    // Use last_max_timestamp or last_issue_date for incremental
    const whereClause = state.last_max_timestamp
      ? `data_loaded_at > '${state.last_max_timestamp}'`
      : state.last_issue_date
      ? `issue_date > '${state.last_issue_date}'`
      : null;

    let offset = 0;
    const limit = 1000;
    let fetched = 0;

    while (fetched < maxRows) {
      await this.rateLimiter.waitIfNeeded();

      const batchLimit = Math.min(limit, maxRows - fetched);
      const url = this.buildSocrataUrl(config, {
        limit: batchLimit,
        offset,
        where: whereClause,
      });

      const rows = await exponentialBackoff(() => this.fetchSocrata(url, config.app_token));

      if (rows.length === 0) break;

      for (const row of rows) {
        yield this.normalize(sourceId, sourceName, config, row);
      }

      fetched += rows.length;
      offset += batchLimit;

      if (rows.length < batchLimit) break;
    }
  }

  private buildSocrataUrl(
    config: ConnectorConfig,
    params: { limit: number; offset: number; where?: string | null }
  ): string {
    const base = `${config.endpoint_url}/resource/${config.dataset_id}.json`;
    const queryParams = new URLSearchParams();

    queryParams.set('$limit', String(params.limit));
    queryParams.set('$offset', String(params.offset));

    // Simplified approach - fetch all building permits, filter in normalize()
    // Many Socrata datasets have different field names, so we can't rely on a specific query
    if (params.where) {
      queryParams.set('$where', params.where);
    }

    return `${base}?${queryParams.toString()}`;
  }

  private async fetchSocrata(url: string, appToken?: string): Promise<RawRow[]> {
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };

    if (appToken) {
      headers['X-App-Token'] = appToken;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Socrata API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private normalize(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    raw: RawRow
  ): NormalizedPermit {
    // Common Socrata field mappings (adjust based on dataset)
    const permitType = raw.permit_type || raw.permittype || raw.type || null;
    const workDescription =
      raw.work_description || raw.description || raw.work_desc || null;
    const permitStatus = raw.status || raw.permit_status || null;
    const issueDate = raw.issue_date || raw.issued_date || raw.date || null;
    
    // Handle address - might be a string, object, or JSON string
    let addressRaw: string | null = null;
    let lat: number | null = null;
    let lon: number | null = null;
    
    const addressField = raw.address || raw.full_address || raw.site_address || raw.location || null;
    if (addressField) {
      if (typeof addressField === 'string') {
        // Try to parse if it looks like JSON
        try {
          const parsed = JSON.parse(addressField);
          if (parsed.human_address) {
            const humanAddr = typeof parsed.human_address === 'string' 
              ? JSON.parse(parsed.human_address) 
              : parsed.human_address;
            addressRaw = [
              humanAddr.address,
              humanAddr.city,
              humanAddr.state,
              humanAddr.zip
            ].filter(Boolean).join(', ') || null;
          }
          if (parsed.latitude) lat = parseFloat(parsed.latitude);
          if (parsed.longitude) lon = parseFloat(parsed.longitude);
        } catch {
          // Not JSON, use as-is
          addressRaw = addressField;
        }
      } else if (typeof addressField === 'object') {
        // Already an object
        if (addressField.human_address) {
          const humanAddr = typeof addressField.human_address === 'string'
            ? JSON.parse(addressField.human_address)
            : addressField.human_address;
          addressRaw = [
            humanAddr.address,
            humanAddr.city,
            humanAddr.state,
            humanAddr.zip
          ].filter(Boolean).join(', ') || null;
        }
        if (addressField.latitude) lat = parseFloat(addressField.latitude);
        if (addressField.longitude) lon = parseFloat(addressField.longitude);
      }
    }
    
    const parcelId = raw.parcel_id || raw.parcel || raw.apn || null;
    const ownerName = raw.owner || raw.owner_name || null;
    const contractorName = raw.contractor || raw.contractor_name || null;
    const permitValue = raw.value || raw.permit_value || raw.valuation || null;
    
    // Override with direct lat/lon fields if available
    if (!lat) lat = raw.latitude || raw.lat || null;
    if (!lon) lon = raw.longitude || raw.lon || raw.lng || null;

    // Parse address
    const addressParsed = this.parseAddress(addressRaw);

    // Generate fingerprint
    const fingerprint = generateFingerprint({
      street: addressParsed.street,
      city: addressParsed.city,
      state: addressParsed.state,
      parcelId: parcelId,
      issueDate: issueDate,
      permitType: permitType,
    });

    // Classify as roofing
    const isRoofing = classifyAsRoofing(permitType, workDescription) ? 1 : 0;

    return {
      source_id: sourceId,
      source_name: sourceName,
      source_platform: 'socrata',
      source_record_id: raw.id || raw._id || String(Math.random()),
      permit_type: permitType,
      work_description: workDescription,
      permit_status: permitStatus,
      issue_date: issueDate,
      address_raw: addressRaw,
      address_parsed: addressParsed,
      parcel_id: parcelId,
      owner_name: ownerName,
      contractor_name: contractorName,
      permit_value: permitValue ? parseFloat(String(permitValue)) : null,
      lat: lat ? parseFloat(String(lat)) : null,
      lon: lon ? parseFloat(String(lon)) : null,
      geom_geojson: null,
      fingerprint,
      is_roofing: isRoofing,
      provenance: {
        platform: 'socrata',
        url: `${config.endpoint_url}/d/${config.dataset_id}`,
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

  private parseAddress(address: string | null | any): {
    house_number?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  } {
    if (!address) return {};
    
    // Convert to string if it's an object or other type
    const addressStr = typeof address === 'string' ? address : String(address);

    // Simple address parsing (can be enhanced with a proper library)
    const parts = addressStr.split(',').map((p) => p.trim());

    if (parts.length >= 2) {
      const streetPart = parts[0];
      const cityStateZip = parts.slice(1).join(', ');

      // Try to extract city, state, zip from the second part
      const stateMatch = cityStateZip.match(/\b([A-Z]{2})\b/);
      const zipMatch = cityStateZip.match(/\b(\d{5}(?:-\d{4})?)\b/);

      return {
        street: streetPart,
        city: parts[1] || undefined,
        state: stateMatch?.[1] || undefined,
        zip: zipMatch?.[1] || undefined,
      };
    }

    return { street: addressStr };
  }
}
