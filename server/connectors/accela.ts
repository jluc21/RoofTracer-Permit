import crypto from 'crypto';
import { load } from 'cheerio';
import {
  Connector,
  ConnectorConfig,
  ConnectorState,
  NormalizedPermit,
  RateLimiter,
  exponentialBackoff,
} from './base';
import { classifyAsRoofing } from '../normalization/classifier';
import { geocodingService } from '../storage';

interface AccelaConfig extends ConnectorConfig {
  agency_name: string; // e.g., "Sacramento County"
  base_url: string; // e.g., "https://aca-prod.accela.com/SACRAMENTO"
  module: string; // e.g., "Building"
  search_keywords?: string[]; // e.g., ["roof", "reroof", "re-roof"]
  date_field?: string; // e.g., "issue_date"
}

interface AccelaSearchResult {
  permit_number: string;
  permit_type?: string;
  status?: string;
  issue_date?: string;
  address?: string;
  description?: string;
  detail_url?: string;
}

export class AccelaConnector implements Connector {
  private rateLimiter: RateLimiter;

  constructor(requestsPerMinute: number = 10) {
    this.rateLimiter = new RateLimiter(requestsPerMinute);
  }

  async validate(config: ConnectorConfig): Promise<void> {
    const accelaConfig = config as AccelaConfig;
    
    if (!accelaConfig.base_url) {
      throw new Error('Missing base_url in Accela config');
    }
    
    if (!accelaConfig.agency_name) {
      throw new Error('Missing agency_name in Accela config');
    }

    // Test connectivity
    await this.rateLimiter.waitIfNeeded();
    const response = await exponentialBackoff(() =>
      fetch(`${accelaConfig.base_url}/Default.aspx`)
    );

    if (!response.ok) {
      throw new Error(`Accela portal unreachable: ${response.status} ${response.statusText}`);
    }
  }

  async *backfill(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    const accelaConfig = config as AccelaConfig;
    
    // NOTE: This is a simplified implementation that demonstrates the pattern.
    // Full production implementation would require:
    // 1. Browser automation (Playwright) to handle ASP.NET ViewState and AJAX
    // 2. Session management and cookie handling
    // 3. Pagination through search results
    // 4. Geocoding service integration for addresses
    
    console.log(`[Accela] Starting backfill for ${sourceName}`);
    console.log(`[Accela] Config: ${JSON.stringify(accelaConfig, null, 2)}`);
    
    // PROOF-OF-CONCEPT: Sample fixture data demonstrating the pattern
    // In production, this would use Playwright to:
    // 1. Navigate to the search page
    // 2. Fill in search form with date ranges and keywords
    // 3. Submit search and parse results table
    // 4. Click through to detail pages for full permit info
    // 5. Extract addresses and other metadata
    
    console.log(`[Accela] Proof-of-concept connector - using sample fixture data`);
    console.log(`[Accela] Production implementation requires:`);
    console.log(`[Accela]   1. Playwright browser automation`);
    console.log(`[Accela]   2. HTML parsing with Cheerio`);
    console.log(`[Accela]   3. Geocoding service (Nominatim recommended)`);
    console.log(`[Accela] See docs/accela-connector-guide.md for full implementation`);
    
    // Sample results representing typical Accela portal data
    // These demonstrate the normalization pipeline without requiring browser automation
    const mockResults: AccelaSearchResult[] = [
      {
        permit_number: 'BLD2024-00123',
        permit_type: 'Re-Roof',
        status: 'Issued',
        issue_date: '2024-10-15',
        address: '700 H Street, Sacramento, CA 95814',
        description: 'Residential re-roof - remove existing composition shingles and install new GAF Timberline HDZ shingles',
        detail_url: `${accelaConfig.base_url}/Cap/CapDetail.aspx?id=BLD2024-00123`,
      },
      {
        permit_number: 'BLD2024-00456',
        permit_type: 'Re-Roof',
        status: 'Finaled',
        issue_date: '2024-09-22',
        address: '9283 Greenback Lane, Orangevale, CA 95662',
        description: 'Commercial re-roof - TPO membrane installation on flat roof, 5000 sq ft',
        detail_url: `${accelaConfig.base_url}/Cap/CapDetail.aspx?id=BLD2024-00456`,
      },
      {
        permit_number: 'BLD2024-00789',
        permit_type: 'Roof Repair',
        status: 'Issued',
        issue_date: '2024-10-28',
        address: '100 Main Street, Roseville, CA 95678',
        description: 'Emergency roof repair - replace damaged section after tree damage, approximately 200 sq ft',
        detail_url: `${accelaConfig.base_url}/Cap/CapDetail.aspx?id=BLD2024-00789`,
      },
    ];
    
    console.log(`[Accela] Portal: ${accelaConfig.base_url}`);
    console.log(`[Accela] Module: ${accelaConfig.module || 'Building'}`);
    console.log(`[Accela] Sample data: ${mockResults.length} fixture permits`);
    
    // Transform mock results to normalized permits
    let count = 0;
    for (const result of mockResults) {
      if (count >= maxRows) break;
      
      const normalized = await this.normalizePermit(
        result,
        sourceId,
        sourceName,
        accelaConfig
      );
      
      yield normalized;
      count++;
    }
    
    console.log(`[Accela] Backfill complete: ${count} permits processed`);
  }

  async *incremental(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    // Incremental sync would use last_issue_date from state
    // to only fetch permits newer than last sync
    yield* this.backfill(sourceId, sourceName, config, state, maxRows);
  }

  private async normalizePermit(
    raw: AccelaSearchResult,
    sourceId: number,
    sourceName: string,
    config: AccelaConfig
  ): Promise<NormalizedPermit> {
    // Parse address components
    const addressParsed = this.parseAddress(raw.address || '');
    
    // Generate fingerprint
    const fingerprintInput = [
      addressParsed.street || '',
      addressParsed.city || '',
      addressParsed.state || 'CA',
      raw.permit_number,
      raw.issue_date || '',
    ].join('|');
    
    const fingerprint = crypto
      .createHash('sha256')
      .update(fingerprintInput)
      .digest('hex');

    // Classify roofing
    const isRoofing = classifyAsRoofing(
      raw.permit_type || null,
      raw.description || null
    ) ? 1 : 0;

    // Note: In production, we would geocode the address here
    // using a service like Nominatim, Google Geocoding, or Mapbox
    const { lat, lon } = await this.geocodeAddress(addressParsed);

    return {
      source_id: sourceId,
      source_name: sourceName,
      source_platform: 'accela',
      source_record_id: raw.permit_number,
      permit_type: raw.permit_type || null,
      work_description: raw.description || null,
      permit_status: raw.status || null,
      issue_date: raw.issue_date || null,
      address_raw: raw.address || null,
      address_parsed: addressParsed,
      parcel_id: null,
      owner_name: null,
      contractor_name: null,
      permit_value: null,
      lat,
      lon,
      geom_geojson: null,
      fingerprint,
      is_roofing: isRoofing,
      provenance: {
        platform: 'accela',
        url: raw.detail_url || `${config.base_url}/Cap/CapHome.aspx`,
        fetched_at: new Date().toISOString(),
        fields_map: {
          permit_number: 'permit_number',
          permit_type: 'permit_type',
          status: 'status',
          issue_date: 'issue_date',
          address: 'address',
          description: 'description',
        },
      },
      raw_blob_path: null,
    };
  }

  private parseAddress(addressRaw: string): {
    house_number?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  } {
    // Simple address parsing - in production, use a proper address parser
    const parts = addressRaw.split(',').map(p => p.trim());
    
    if (parts.length === 0) return {};
    
    const streetPart = parts[0];
    const cityPart = parts[1] || '';
    const stateZipPart = parts[2] || '';
    
    // Extract house number from street
    const streetMatch = streetPart.match(/^(\d+)\s+(.+)$/);
    const houseNumber = streetMatch ? streetMatch[1] : undefined;
    const street = streetMatch ? streetMatch[2] : streetPart;
    
    // Extract state and zip
    const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s*(\d{5})?/);
    const state = stateZipMatch ? stateZipMatch[1] : 'CA';
    const zip = stateZipMatch && stateZipMatch[2] ? stateZipMatch[2] : undefined;
    
    return {
      house_number: houseNumber,
      street,
      city: cityPart,
      state,
      zip,
    };
  }

  private async geocodeAddress(addressParsed: {
    house_number?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  }): Promise<{ lat: number | null; lon: number | null }> {
    try {
      // Build full address string for geocoding
      const addressParts = [];
      if (addressParsed.house_number) addressParts.push(addressParsed.house_number);
      if (addressParsed.street) addressParts.push(addressParsed.street);
      if (addressParsed.city) addressParts.push(addressParsed.city);
      if (addressParsed.state) addressParts.push(addressParsed.state);
      if (addressParsed.zip) addressParts.push(addressParsed.zip);
      
      const fullAddress = addressParts.join(' ');
      
      if (!fullAddress.trim()) {
        console.log('[Accela] Empty address, skipping geocoding');
        return { lat: null, lon: null };
      }
      
      console.log(`[Accela] Geocoding address: ${fullAddress}`);
      
      // Use Nominatim geocoding service with caching and rate limiting
      const result = await geocodingService.geocode(fullAddress);
      console.log(`[Accela] Geocoded result: lat=${result.lat}, lon=${result.lon}`);
      return { lat: result.lat, lon: result.lon };
    } catch (error) {
      console.error('[Accela] Geocoding error:', error);
      return { lat: null, lon: null };
    }
  }

  private async fetchAccelaPage(url: string): Promise<string> {
    await this.rateLimiter.waitIfNeeded();
    
    const response = await exponentialBackoff(() =>
      fetch(url, {
        headers: {
          'User-Agent': 'RoofTracer/1.0 (Public Building Permit Data Aggregator)',
        },
      })
    );

    if (!response.ok) {
      throw new Error(`Accela HTTP error: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }
}
