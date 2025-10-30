# Accela Connector Architecture Guide

## Overview

The Accela connector provides a foundation for ingesting building permit data from Accela Citizen Access portals used by hundreds of municipalities across the United States. This guide documents the architecture, implementation patterns, and extension strategies for integrating additional Accela-based jurisdictions.

## Proof of Concept Status

**Current Implementation**: The Accela connector (server/connectors/accela.ts) is a **proof-of-concept** demonstrating the architecture and integration pattern. It includes:

✅ Connector interface implementation (Connector base class)  
✅ Configuration schema for Accela-specific parameters  
✅ Rate limiting and exponential backoff  
✅ Address parsing and normalization logic  
✅ Roofing classification integration  
✅ Fingerprint-based deduplication  
✅ Geocoding placeholder (ready for service integration)

⚠️ **Not Yet Implemented** (required for production):
- Browser automation with Playwright for ASP.NET WebForms interaction
- Session management and cookie handling
- Search form submission and result pagination
- Detail page scraping for complete permit metadata
- Actual geocoding service integration (Nominatim/Google/Mapbox)

## Architecture

### Connector Pattern

The Accela connector follows the same pattern as Socrata and ArcGIS connectors:

```typescript
interface Connector {
  validate(config: ConnectorConfig): Promise<void>;
  backfill(...): AsyncIterableIterator<NormalizedPermit>;
  incremental(...): AsyncIterableIterator<NormalizedPermit>;
}
```

### Configuration Schema

```typescript
interface AccelaConfig {
  agency_name: string;      // "Sacramento County"
  base_url: string;         // "https://aca-prod.accela.com/SACRAMENTO"
  endpoint_url: string;     // Portal URL (required by base interface)
  module: string;           // "Building", "Planning", etc.
  search_keywords?: string[]; // ["roof", "reroof", "re-roof"]
  date_field?: string;      // "issue_date"
}
```

### Data Flow

```
Accela Portal
  ↓ (Playwright automation)
Search Form Submission
  ↓
Results Table Parsing (Cheerio)
  ↓
Detail Page Scraping
  ↓
Address Extraction → Geocoding Service → Coordinates
  ↓
Normalization (fingerprint, roofing classification)
  ↓
PostgreSQL Database (permits table)
```

## Production Implementation Roadmap

### Phase 1: Browser Automation Setup

**Install Dependencies:**
```bash
npm install playwright @playwright/test
npx playwright install chromium
```

**Basic Playwright Pattern:**
```typescript
import { chromium } from 'playwright';

async function searchAccelaPortal(config: AccelaConfig, keywords: string[]) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to search page
  await page.goto(`${config.base_url}/Cap/CapHome.aspx?module=${config.module}`);
  
  // Fill search form
  await page.fill('#ctl00_PlaceHolderMain_txtGSPermitNumber', '');
  await page.fill('#ctl00_PlaceHolderMain_txtGSStreetName', keywords[0]);
  await page.selectOption('#ctl00_PlaceHolderMain_ddlGSRecordType', 'Re-Roof');
  
  // Submit and wait for results
  await page.click('#ctl00_PlaceHolderMain_btnNewSearch');
  await page.waitForSelector('table.ACA_GridView');
  
  // Extract results table
  const html = await page.content();
  await browser.close();
  
  return html;
}
```

### Phase 2: Result Parsing

**Cheerio HTML Parsing:**
```typescript
import { load } from 'cheerio';

function parseResultsTable(html: string): AccelaSearchResult[] {
  const $ = load(html);
  const results: AccelaSearchResult[] = [];
  
  // Accela typically uses GridView tables
  $('table.ACA_GridView tr').each((_, row) => {
    const cols = $(row).find('td');
    if (cols.length < 4) return;
    
    results.push({
      permit_number: $(cols[0]).text().trim(),
      permit_type: $(cols[1]).text().trim(),
      status: $(cols[2]).text().trim(),
      address: $(cols[3]).text().trim(),
      issue_date: $(cols[4]).text().trim(),
      detail_url: $(cols[0]).find('a').attr('href'),
    });
  });
  
  return results;
}
```

### Phase 3: Detail Page Scraping

Many Accela portals require clicking through to detail pages for full permit information:

```typescript
async function scrapePermitDetail(detailUrl: string): Promise<PermitDetails> {
  const page = await browser.newPage();
  await page.goto(detailUrl);
  
  const details = {
    description: await page.textContent('#ctl00_PlaceHolderMain_txtWorkDescription'),
    parcel: await page.textContent('#ctl00_PlaceHolderMain_txtParcel'),
    owner: await page.textContent('#ctl00_PlaceHolderMain_txtOwnerName'),
    contractor: await page.textContent('#ctl00_PlaceHolderMain_txtContractorName'),
    value: await page.textContent('#ctl00_PlaceHolderMain_txtPermitValue'),
  };
  
  await page.close();
  return details;
}
```

### Phase 4: Geocoding Integration

**Nominatim (OpenStreetMap - Free):**
```typescript
async function geocodeWithNominatim(addressParsed: AddressParsed): Promise<Coords> {
  const query = [
    addressParsed.house_number,
    addressParsed.street,
    addressParsed.city,
    addressParsed.state,
    addressParsed.zip
  ].filter(Boolean).join(', ');
  
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
    {
      headers: {
        'User-Agent': 'RoofTracer/1.0 (contact@example.com)',
      },
    }
  );
  
  const results = await response.json();
  if (results.length === 0) return { lat: null, lon: null };
  
  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
  };
}
```

**Rate Limiting:**
- Nominatim: 1 request per second
- Google Geocoding: 50 requests per second (with API key)
- Mapbox: 600 requests per minute (generous free tier)

### Phase 5: Pagination

Accela portals often paginate results. Handle pagination in the backfill method:

```typescript
async *backfill(/* params */) {
  let pageNumber = 1;
  let hasMorePages = true;
  
  while (hasMorePages && rowCount < maxRows) {
    const html = await this.searchAccelaPage(config, keywords, pageNumber);
    const results = this.parseResultsTable(html);
    
    if (results.length === 0) {
      hasMorePages = false;
      break;
    }
    
    for (const result of results) {
      yield await this.normalizePermit(result, sourceId, sourceName, config);
    }
    
    pageNumber++;
  }
}
```

## Sacramento County Example Configuration

### Database Source Entry

```sql
INSERT INTO sources (name, platform, endpoint_url, enabled, config, max_rows_per_run, max_requests_per_minute)
VALUES (
  'Sacramento County - Building Permits (Roofing)',
  'accela',
  'https://aca-prod.accela.com/SACRAMENTO/Cap/CapHome.aspx?module=Building',
  1,
  '{
    "agency_name": "Sacramento County",
    "base_url": "https://aca-prod.accela.com/SACRAMENTO",
    "module": "Building",
    "search_keywords": ["roof", "reroof", "re-roof"],
    "date_field": "issue_date"
  }',
  1000,
  6
);
```

### Trigger Ingestion

```bash
curl -X POST "http://localhost:5000/api/sources/{source_id}/ingest?mode=backfill"
```

## Extension Guide for Other Accela Jurisdictions

### Step 1: Identify Portal URL

Most Accela portals follow patterns:
- `https://aca-prod.accela.com/{AGENCY}/`
- `https://permits.{city}.gov/CitizenAccess/`
- `https://{city}.accela.com/`

Examples:
- **Lincoln, CA**: `https://aca-prod.accela.com/LINCOLN/`
- **Auburn, CA**: `https://aca-prod.accela.com/AUBURN/` (if using Accela)
- **Folsom, CA**: Uses eTRAKiT, not Accela

### Step 2: Test Public Access

Visit the portal and verify:
1. No login required for search
2. Search supports keyword filtering
3. Results include addresses and dates
4. Detail pages are publicly accessible

### Step 3: Identify HTML Structure

Each Accela installation may have slightly different HTML:
- Inspect element IDs for form inputs
- Check table classes for results
- Note pagination control selectors

### Step 4: Create Source Configuration

```json
{
  "agency_name": "City of Lincoln",
  "base_url": "https://aca-prod.accela.com/LINCOLN",
  "module": "Building",
  "search_keywords": ["roof", "reroof"],
  "permit_type_filter": "BLD-RES-REROOF"
}
```

### Step 5: Test and Iterate

1. Run backfill with `max_rows_per_run: 10` for testing
2. Verify permits appear in database with coordinates
3. Check roofing classification accuracy
4. Adjust keyword filters and field mappings as needed

## Alternative: Accela Construct API

Some agencies provide API access via Accela Construct API v4:

**Advantages:**
- No web scraping needed
- Structured JSON responses
- Official support

**Requirements:**
- Agency must enable public API access
- Register for API credentials at https://developer.accela.com
- OAuth authentication required

**Implementation:**
Create separate `AccelaAPIConnector` for agencies with API access.

## Maintenance Considerations

### Portal Changes

Accela portals are updated periodically. Monitor for:
- HTML structure changes (update selectors)
- New CAPTCHA implementations
- Authentication requirements added
- Rate limiting enforcement

### Error Handling

```typescript
try {
  const html = await page.content();
} catch (error) {
  if (error.message.includes('timeout')) {
    // Retry with exponential backoff
  } else if (error.message.includes('403')) {
    // Possible rate limiting or blocking
    throw new Error('Portal access denied - check User-Agent or rate limits');
  }
}
```

### Logging

Log detailed information for debugging:
```typescript
console.log(`[Accela:${config.agency_name}] Searching for: ${keywords.join(', ')}`);
console.log(`[Accela:${config.agency_name}] Found ${results.length} results on page ${page}`);
console.log(`[Accela:${config.agency_name}] Geocoded: ${successRate}% success rate`);
```

## Performance Optimization

### Parallel Geocoding

```typescript
const geocodePromises = permits.map(p => this.geocodeAddress(p.address_parsed));
const coordinates = await Promise.allSettled(geocodePromises);
```

### Caching

Cache geocoding results to avoid redundant API calls:
```typescript
const geocodeCache = new Map<string, Coords>();

async function getCachedGeocode(address: string): Promise<Coords> {
  if (geocodeCache.has(address)) {
    return geocodeCache.get(address)!;
  }
  
  const coords = await geocodeAddress(address);
  geocodeCache.set(address, coords);
  return coords;
}
```

## Testing

### Unit Tests

Test address parsing and normalization:
```typescript
test('parseAddress handles Sacramento County format', () => {
  const result = connector.parseAddress('1234 Main St, Sacramento, CA 95814');
  expect(result.house_number).toBe('1234');
  expect(result.street).toBe('Main St');
  expect(result.city).toBe('Sacramento');
});
```

### Integration Tests

Use Playwright in test mode:
```typescript
test('Accela search returns results', async () => {
  const results = await connector.searchPortal(testConfig, ['roof']);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].permit_number).toBeDefined();
});
```

## Resources

- **Accela Developer Portal**: https://developer.accela.com
- **Playwright Documentation**: https://playwright.dev
- **Nominatim Usage Policy**: https://operations.osmfoundation.org/policies/nominatim/
- **Sacramento County Portal**: https://aca-prod.accela.com/SACRAMENTO/

## Next Steps for Production

1. **Install Playwright** and test Sacramento County portal automation
2. **Implement geocoding** with Nominatim (free tier sufficient for testing)
3. **Test full backfill** with 100-1000 permits
4. **Monitor success rates** for geocoding and classification
5. **Document agency-specific quirks** for future maintenance
6. **Extend to Lincoln, Auburn** once Sacramento pattern is proven

## Contributing

When extending to new jurisdictions:
1. Document portal URL and access requirements
2. Provide sample search results HTML
3. Note any authentication or CAPTCHA challenges
4. Test with at least 100 permits before production use
5. Update this guide with lessons learned
