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
    
    // Check if Playwright live scraping is enabled
    const useLiveScraping = process.env.ACCELA_USE_PLAYWRIGHT === 'true';
    
    if (useLiveScraping) {
      // PRODUCTION MODE: Use Playwright to scrape live permits
      yield* this.backfillLive(sourceId, sourceName, accelaConfig, maxRows);
    } else {
      // DEMO MODE: Use fixture data with real Sacramento-area addresses
      yield* this.backfillFixture(sourceId, sourceName, accelaConfig, maxRows);
    }
  }

  private async *backfillFixture(
    sourceId: number,
    sourceName: string,
    config: AccelaConfig,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    console.log(`[Accela] Starting FIXTURE backfill for ${sourceName}`);
    console.log(`[Accela] Portal: ${config.base_url}`);
    console.log(`[Accela] Module: ${config.module || 'Building'}`);
    console.log(`[Accela] Using real Sacramento-area addresses with Nominatim geocoding`);
    
    // Real Sacramento-area roofing permits with actual addresses
    const fixturePermits: AccelaSearchResult[] = [
      {
        permit_number: 'BLD2024-00123',
        permit_type: 'Re-Roof',
        status: 'Issued',
        issue_date: '2024-10-15',
        address: '700 H Street, Sacramento, CA 95814',
        description: 'Residential re-roof - remove existing composition shingles and install new GAF Timberline HDZ shingles',
        detail_url: `${config.base_url}/Cap/CapDetail.aspx?id=BLD2024-00123`,
      },
      {
        permit_number: 'BLD2024-00456',
        permit_type: 'Re-Roof',
        status: 'Finaled',
        issue_date: '2024-09-22',
        address: '9283 Greenback Lane, Orangevale, CA 95662',
        description: 'Commercial re-roof - TPO membrane installation on flat roof, 5000 sq ft',
        detail_url: `${config.base_url}/Cap/CapDetail.aspx?id=BLD2024-00456`,
      },
      {
        permit_number: 'BLD2024-00789',
        permit_type: 'Roof Repair',
        status: 'Issued',
        issue_date: '2024-10-28',
        address: '100 Main Street, Roseville, CA 95678',
        description: 'Emergency roof repair - replace damaged section after tree damage, approximately 200 sq ft',
        detail_url: `${config.base_url}/Cap/CapDetail.aspx?id=BLD2024-00789`,
      },
    ];
    
    console.log(`[Accela] Processing ${fixturePermits.length} fixture permits with real addresses`);
    
    let count = 0;
    for (const result of fixturePermits) {
      if (count >= maxRows) break;
      
      const normalized = await this.normalizePermit(
        result,
        sourceId,
        sourceName,
        config
      );
      
      yield normalized;
      count++;
    }
    
    console.log(`[Accela] Fixture backfill complete: ${count} permits processed with Nominatim geocoding`);
  }

  private async *backfillLive(
    sourceId: number,
    sourceName: string,
    config: AccelaConfig,
    maxRows: number
  ): AsyncIterableIterator<NormalizedPermit> {
    const { storage } = await import('../storage');
    
    console.log(`[Accela] Starting LIVE backfill for ${sourceName}`);
    console.log(`[Accela] Portal: ${config.base_url}`);
    console.log(`[Accela] Module: ${config.module || 'Building'}`);
    console.log(`[Accela] Strategy: Scrape ALL building permits, then classify roofing using rules`);
    console.log(`[Accela] Max permits: ${maxRows.toLocaleString()}`);
    
    let browser: Browser | null = null;
    try {
      // Launch Playwright browser
      console.log('[Accela] Launching browser...');
      await storage.upsertSourceState({
        source_id: sourceId,
        is_running: 1,
        status_message: 'Launching browser...',
      });
      
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      
      // Navigate to the Accela portal
      const searchUrl = `${config.base_url}/Cap/CapHome.aspx?module=${config.module || 'Building'}`;
      console.log(`[Accela] Navigating to: ${searchUrl}`);
      await storage.upsertSourceState({
        source_id: sourceId,
        is_running: 1,
        status_message: 'Navigating to Accela portal...',
      });
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Try to find and perform search
      const results = await this.performSearch(page, config, sourceId);
      console.log(`[Accela] Found ${results.length} permit results from live portal`);
      
      // Yield normalized permits
      let count = 0;
      for (const result of results) {
        if (count >= maxRows) break;
        
        const normalized = await this.normalizePermit(
          result,
          sourceId,
          sourceName,
          config
        );
        
        yield normalized;
        count++;
      }
      
      console.log(`[Accela] Backfill complete: ${count} LIVE permits processed`);
      
    } catch (error) {
      console.error('[Accela] Browser automation error:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
        console.log('[Accela] Browser closed');
      }
    }
  }

  private async performSearch(
    page: Page,
    config: AccelaConfig,
    sourceId: number
  ): Promise<AccelaSearchResult[]> {
    const { storage } = await import('../storage');
    const allResults: AccelaSearchResult[] = [];
    const MAX_PAGES = 100; // Safety limit to prevent infinite loops
    const MAX_PERMITS_PER_PAGE = 1000; // Increased from 50
    
    try {
      // Wait for page to be ready
      await page.waitForLoadState('networkidle');
      
      // Update status: Searching
      await storage.upsertSourceState({
        source_id: sourceId,
        is_running: 1,
        status_message: `Searching for all building permits...`,
      });
      
      console.log('[Accela] Searching for ALL building permits (no keyword filter)');
      
      // Look for search form - try to submit without keywords to get ALL permits
      // Accela portals typically have a search button that can be clicked without entering keywords
      
      // Try to find and click search/submit button directly (without entering keywords)
      const searchButton = page.locator('input[type="submit"], button[type="submit"]').first();
      if (await searchButton.isVisible({ timeout: 5000 })) {
        console.log('[Accela] Clicking search button to get all building permits');
        await searchButton.click();
        
        // Wait for results to load
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      } else {
        // Fallback: Try to find search input and leave it empty, then search
        const searchInput = await page.locator('input[type="text"]').first();
        if (await searchInput.isVisible({ timeout: 5000 })) {
          console.log('[Accela] Found search input - leaving empty to get all permits');
          // Leave input empty - this should return all permits
          
          const submitBtn = page.locator('input[type="submit"], button[type="submit"]').first();
          if (await submitBtn.isVisible({ timeout: 2000 })) {
            await submitBtn.click();
            console.log('[Accela] Clicked search button');
            
            // Wait for results to load
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000);
          }
        }
      }
      
      // Scrape all pages of results
      let currentPage = 1;
      let hasMore = true;
      
      while (hasMore && currentPage <= MAX_PAGES) {
        console.log(`[Accela] Scraping page ${currentPage}...`);
        
        // Update status with current page
        await storage.upsertSourceState({
          source_id: sourceId,
          is_running: 1,
          status_message: `Scraping page ${currentPage}... (${allResults.length} permits found so far)`,
          current_page: currentPage,
        });
        
        // Parse current page results
        const pageResults = await this.parseResultsTable(page, config, MAX_PERMITS_PER_PAGE);
        console.log(`[Accela] Page ${currentPage}: Found ${pageResults.length} permits`);
        
        allResults.push(...pageResults);
        
        // Try to find and click "Next" button for pagination
        const nextButton = page.locator('a:has-text("Next"), input[value="Next"], button:has-text("Next")').first();
        const hasNextButton = await nextButton.isVisible({ timeout: 2000 }).catch(() => false);
        
        if (hasNextButton) {
          await nextButton.click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1500);
          currentPage++;
        } else {
          hasMore = false;
          console.log('[Accela] No more pages found');
        }
        
        // Safety: Stop if we're not finding new permits
        if (pageResults.length === 0) {
          hasMore = false;
        }
      }
      
      console.log(`[Accela] Scraped ${currentPage} pages, total ${allResults.length} permits`);
      
    } catch (error) {
      console.error('[Accela] Search error:', error);
      // If search fails, return what we have so far
    }
    
    return allResults;
  }

  private async parseResultsTable(
    page: Page,
    config: AccelaConfig,
    maxRows: number
  ): Promise<AccelaSearchResult[]> {
    const results: AccelaSearchResult[] = [];
    
    try {
      const tableHtml = await page.content();
      const $ = load(tableHtml);
      
      // Look for results table (common Accela patterns)
      // Increased limit significantly to get all rows
      const rows = $('table tr').slice(1, maxRows + 1); // Skip header, get up to maxRows
      
      rows.each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length < 2) return;
        
        // Extract data from cells (structure varies by agency)
        // Typical columns: Record#, Type, Status, Date, Address, Description
        const permitNumber = $(cells[0]).text().trim();
        const permitType = cells.length > 1 ? $(cells[1]).text().trim() : '';
        const status = cells.length > 2 ? $(cells[2]).text().trim() : '';
        const issueDate = cells.length > 3 ? $(cells[3]).text().trim() : '';
        const address = cells.length > 4 ? $(cells[4]).text().trim() : '';
        const description = cells.length > 5 ? $(cells[5]).text().trim() : '';
        
        // Only include if we have a permit number
        if (permitNumber && permitNumber.length > 3) {
          results.push({
            permit_number: permitNumber,
            permit_type: permitType || undefined,
            status: status || undefined,
            issue_date: this.parseDate(issueDate) || undefined,
            address: address || undefined,
            description: description || undefined,
            detail_url: `${config.base_url}/Cap/CapDetail.aspx?id=${encodeURIComponent(permitNumber)}`,
          });
        }
      });
    } catch (error) {
      console.error('[Accela] Table parsing error:', error);
    }
    
    return results;
  }

  private parseDate(dateStr: string): string | null {
    if (!dateStr || dateStr.trim() === '') return null;
    
    try {
      // Try to parse common date formats: MM/DD/YYYY, YYYY-MM-DD, etc.
      const cleaned = dateStr.trim();
      
      // If already in ISO format
      if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
        return cleaned.split('T')[0];
      }
      
      // Try MM/DD/YYYY
      const match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      return null;
    } catch {
      return null;
    }
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
