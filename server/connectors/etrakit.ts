import crypto from 'crypto';
import { load } from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
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

interface eTRAKiTConfig extends ConnectorConfig {
  agency_name: string; // e.g., "City of Folsom"
  base_url: string; // e.g., "https://etrakit.folsom.ca.us/etrakit/"
  search_url?: string; // e.g., "/Search/permit.aspx"
  module?: string; // e.g., "Building"
}

interface eTRAKiTSearchResult {
  permit_number: string;
  permit_type: string | null;
  status: string | null;
  issue_date: string | null;
  address: string | null;
  description: string | null;
  detail_url: string | null;
}

export class eTRAKiTConnector implements Connector {
  private rateLimiter: RateLimiter;

  constructor(requestsPerMinute: number = 10) {
    this.rateLimiter = new RateLimiter(requestsPerMinute);
  }

  async validate(config: ConnectorConfig): Promise<void> {
    const etrakitConfig = config as eTRAKiTConfig;
    
    if (!etrakitConfig.base_url) {
      throw new Error('Missing base_url in eTRAKiT config');
    }
    
    if (!etrakitConfig.agency_name) {
      throw new Error('Missing agency_name in eTRAKiT config');
    }

    // Test connectivity
    await this.rateLimiter.waitIfNeeded();
    const response = await exponentialBackoff(() =>
      fetch(etrakitConfig.base_url)
    );

    if (!response.ok) {
      throw new Error(`eTRAKiT portal unreachable: ${response.status} ${response.statusText}`);
    }
  }

  async *backfill(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    const etrakitConfig = config as eTRAKiTConfig;
    
    // Check if Playwright live scraping is enabled
    const useLiveScraping = process.env.ACCELA_USE_PLAYWRIGHT === 'true';
    
    if (useLiveScraping) {
      // PRODUCTION MODE: Use Playwright to scrape live permits
      yield* this.backfillLive(sourceId, sourceName, etrakitConfig, state, maxRows);
    } else {
      // DEMO MODE: Use fixture data
      yield* this.backfillFixture(sourceId, sourceName, etrakitConfig, maxRows);
    }
  }

  private async *backfillFixture(
    sourceId: number,
    sourceName: string,
    config: eTRAKiTConfig,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    console.log(`[eTRAKiT] Starting FIXTURE backfill for ${sourceName}`);
    console.log(`[eTRAKiT] Portal: ${config.base_url}`);
    console.log(`[eTRAKiT] Using demo data (set ACCELA_USE_PLAYWRIGHT=true for live scraping)`);
    
    // Demo data - real addresses from the target cities
    const fixturePermits: eTRAKiTSearchResult[] = [
      {
        permit_number: 'BLD2024-1001',
        permit_type: 'Building Permit - Residential Reroof',
        status: 'Issued',
        issue_date: '2024-10-20',
        address: '100 Blue Ravine Road, Folsom, CA 95630',
        description: 'Residential reroof - composition shingles',
        detail_url: null,
      },
      {
        permit_number: 'BLD2024-1002',
        permit_type: 'Building Permit - Commercial Reroof',
        status: 'Approved',
        issue_date: '2024-09-15',
        address: '5100 Rocklin Road, Rocklin, CA 95677',
        description: 'Commercial reroof - TPO membrane system',
        detail_url: null,
      },
    ];
    
    console.log(`[eTRAKiT] Processing ${fixturePermits.length} fixture permits`);
    
    for (const result of fixturePermits.slice(0, maxRows)) {
      const normalized = await this.normalizeSearchResult(sourceId, sourceName, config, result);
      if (normalized) {
        yield normalized;
      }
    }
  }

  private async *backfillLive(
    sourceId: number,
    sourceName: string,
    config: eTRAKiTConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    console.log(`[eTRAKiT] Starting LIVE backfill for ${sourceName}`);
    console.log(`[eTRAKiT] Portal: ${config.base_url}`);
    
    let browser: Browser | null = null;
    let page: Page | null = null;
    
    try {
      // Launch browser
      console.log('[eTRAKiT] Launching browser...');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      
      page = await browser.newPage();
      
      // Navigate to search page
      const searchUrl = config.search_url || '/Search/permit.aspx';
      const fullUrl = config.base_url.replace(/\/$/, '') + searchUrl;
      
      console.log(`[eTRAKiT] Navigating to ${fullUrl}...`);
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 60000 });
      
      // eTRAKiT typically has a search form - look for permit search inputs
      // This is a generic approach that may need customization per city
      await page.waitForSelector('input, table', { timeout: 10000 });
      
      // Try to search for all building permits
      // Different eTRAKiT instances have different forms, so we'll try multiple approaches
      const hasSearchButton = await page.locator('input[type="submit"], button[type="submit"]').count() > 0;
      
      if (hasSearchButton) {
        // If there's a search button, try to click it to get all results
        await page.locator('input[type="submit"], button[type="submit"]').first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      
      // Extract permits from the results table
      const permits: eTRAKiTSearchResult[] = [];
      
      // Look for data table - common patterns in eTRAKiT
      const tables = await page.locator('table').all();
      
      for (const table of tables) {
        const rows = await table.locator('tr').all();
        
        // Skip if too few rows (likely not the data table)
        if (rows.length < 2) continue;
        
        // Try to extract permit data from rows
        for (let i = 1; i < Math.min(rows.length, maxRows + 1); i++) {
          const row = rows[i];
          const cells = await row.locator('td').all();
          
          if (cells.length < 2) continue;
          
          // Extract text from cells (structure varies by eTRAKiT instance)
          const cellTexts = await Promise.all(cells.map(cell => cell.innerText()));
          
          // Try to identify permit number, address, etc.
          const permit: eTRAKiTSearchResult = {
            permit_number: cellTexts[0] || '',
            permit_type: cellTexts.length > 1 ? cellTexts[1] : null,
            status: cellTexts.length > 2 ? cellTexts[2] : null,
            address: cellTexts.find(t => t.match(/\d+\s+\w+/)) || null,
            issue_date: cellTexts.find(t => t.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)) || null,
            description: null,
            detail_url: null,
          };
          
          if (permit.permit_number) {
            permits.push(permit);
          }
        }
        
        // If we found permits in this table, stop looking
        if (permits.length > 0) break;
      }
      
      console.log(`[eTRAKiT] Found ${permits.length} permits`);
      
      // Normalize and yield permits
      for (const result of permits.slice(0, maxRows)) {
        const normalized = await this.normalizeSearchResult(sourceId, sourceName, config, result);
        if (normalized) {
          yield normalized;
        }
      }
      
    } catch (error) {
      console.error(`[eTRAKiT] Error during live scraping:`, error);
      throw error;
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  async *incremental(
    sourceId: number,
    sourceName: string,
    config: ConnectorConfig,
    state: ConnectorState,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    // For now, incremental is the same as backfill
    yield* this.backfill(sourceId, sourceName, config, state, maxRows);
  }

  private async normalizeSearchResult(
    sourceId: number,
    sourceName: string,
    config: eTRAKiTConfig,
    result: eTRAKiTSearchResult
  ): Promise<NormalizedPermit | null> {
    // Geocode address if available
    let lat: number | null = null;
    let lon: number | null = null;
    
    if (result.address) {
      try {
        const geocoded = await geocodingService.geocode(result.address);
        if (geocoded) {
          lat = geocoded.lat;
          lon = geocoded.lon;
        }
      } catch (error) {
        console.error(`[eTRAKiT] Geocoding error for ${result.address}:`, error);
      }
    }
    
    // Parse address
    const addressParsed = this.parseAddress(result.address || '');
    
    // Generate fingerprint
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${result.permit_number}-${result.address || ''}-${config.agency_name}`)
      .digest('hex');
    
    // Classify as roofing
    const isRoofing = classifyAsRoofing(result.permit_type, result.description) ? 1 : 0;
    
    return {
      source_id: sourceId,
      source_name: sourceName,
      source_platform: 'etrakit',
      source_record_id: result.permit_number,
      permit_type: result.permit_type || null,
      work_description: result.description || null,
      permit_status: result.status || null,
      issue_date: result.issue_date ? this.parseDate(result.issue_date) : null,
      address_raw: result.address || null,
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
        platform: 'etrakit',
        url: result.detail_url || config.base_url,
        fetched_at: new Date().toISOString(),
        fields_map: {},
      },
      raw_blob_path: null,
    };
  }

  private parseAddress(addressRaw: string): any {
    if (!addressRaw) return {};
    
    const parts = addressRaw.split(',').map(p => p.trim());
    
    return {
      street: parts[0] || null,
      city: parts[1] || null,
      state: parts[2]?.split(' ')[0] || null,
      zip: parts[2]?.split(' ')[1] || null,
    };
  }

  private parseDate(dateStr: string): string | null {
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }
}
