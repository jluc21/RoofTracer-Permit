# RoofTracer - US Roofing Permits Map

A production-ready mapping platform that ingests roofing permits from open data portals (Socrata, ArcGIS) and visualizes them on an interactive map with advanced filtering and real-time updates.

## Features

### Data Ingestion
- **Socrata SODA API** connector with SoQL filtering and pagination
- **ArcGIS Feature Services** connector with geometry support
- **BLDS-style normalized schema** with fingerprint-based deduplication
- **Intelligent roofing classification** using configurable rules
- **Incremental sync** with state tracking per source
- **Rate limiting** with exponential backoff and jitter
- **Provenance tracking** for data lineage and audit

### Interactive Map
- **MapLibre GL** with OpenStreetMap tiles
- **Client-side clustering** with zoom-based markers
- **Permit popups** showing address, type, date, value, contractor
- **Bbox-driven queries** for viewport-based filtering
- **Side drawer** with paginated permit table
- **URL sync** for filters, bbox, and zoom state

### Admin & Monitoring
- **Source management** UI for CRUD operations
- **Manual ingestion triggers** (backfill/incremental)
- **Health & status endpoints** with freshness metrics
- **Per-source budgets** for rate limits and row caps

## Tech Stack

**Backend:**
- Express + TypeScript
- PostgreSQL with Drizzle ORM
- HTTPx for API calls
- APScheduler placeholders (jobs can be added)

**Frontend:**
- React + Vite
- MapLibre GL JS
- TanStack Query for state management
- Shadcn UI + Tailwind CSS

**Testing:**
- Playwright (via run_test tool)
- Coverage target: 85%+

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
```bash
# Database (auto-configured in Replit)
DATABASE_URL=postgresql://...

# Optional: Socrata App Token for higher rate limits
SOCRATA_APP_TOKEN=your_token_here
```

### 3. Initialize Database
```bash
npm run db:push
```

### 4. Seed Sample Sources
```bash
npm run tsx infra/seed_sources.ts
```

This creates:
- Austin, TX - Building Permits (Socrata)
- San Francisco, CA - Building Permits (Socrata)

### 5. Start Application
```bash
npm run dev
```

Navigate to `http://localhost:5000`

### 6. Trigger Backfill
**Option A: Via API**
```bash
curl -X POST http://localhost:5000/api/sources/1/ingest?mode=backfill
```

**Option B: Via UI**
1. Navigate to `/sources`
2. Click "Backfill" on a source card

## API Reference

### Health & Status
```
GET /api/health          # System health check
GET /api/version         # Application version
GET /api/status          # Per-source freshness metrics
```

### Sources
```
GET    /api/sources           # List all sources
GET    /api/sources/:id       # Get source by ID
PATCH  /api/sources/:id       # Update source (enable/disable)
POST   /api/sources/:id/ingest?mode=backfill|incremental  # Trigger ingestion
```

### Permits
```
GET /api/permits?bbox=&city=&state=&type=&date_from=&date_to=&roofing_only=true&limit=&offset=
GET /api/permits/:id
```

**Bbox Format:** `west,south,east,north` (e.g., `-98.5,30.2,-97.7,30.5`)

## Data Model (BLDS-style)

### permits
- `id` (uuid, PK)
- `source_id`, `source_name`, `source_platform`
- `source_record_id`
- `permit_type`, `work_description`, `permit_status`
- `issue_date`
- `address_raw`, `address_parsed` (JSONB)
- `parcel_id`, `owner_name`, `contractor_name`
- `permit_value`, `lat`, `lon`, `geom_geojson`
- `fingerprint` (unique, for deduplication)
- `is_roofing` (1=roofing, 0=not)
- `ingest_ts`, `provenance` (JSONB), `raw_blob_path`

**Fingerprint:** `sha256(lower(street)+city+state+parcel+date+upper(type))`

### sources
- `id`, `name`, `platform`, `endpoint_url`, `config` (JSONB)
- `enabled`, `schedule_cron`
- `max_rows_per_run`, `max_runtime_minutes`, `max_requests_per_minute`

### source_state
- `source_id`, `last_max_timestamp`, `last_max_objectid`, `last_issue_date`
- `rows_fetched`, `rows_upserted`, `errors`, `freshness_seconds`

## Roofing Classification

Configured via `server/normalization/roofing_rules.yaml`:

**Permit Type Match:**
- Exact: "Roof", "Roofing", "Reroof", "Roof Replacement"
- Partial: "roof", "reroof"

**Work Description Tokens:**
- Primary: roof, reroof, shingle, tile roof, flat roof
- Materials: TPO, EPDM, torch down, modified bitumen
- Actions: replace roof, install roof, repair roof, overlay

**Classification:** Match ≥1 token in work_description OR exact/partial match in permit_type

## Connectors

### SocrataConnector
**Config:**
```json
{
  "endpoint_url": "https://data.city.gov",
  "dataset_id": "xxxx-yyyy",
  "app_token": "optional"
}
```

**Features:**
- SoQL `$where` filtering for roofing permits
- Pagination with `$limit`/`$offset`
- Incremental sync via `data_loaded_at` or `issue_date`
- Rate limiting: 10 req/min (configurable)

**Example Datasets:**
- Austin, TX: `3syk-w9eu` (data.austintexas.gov)
- San Francisco, CA: `i98e-djp9` (data.sfgov.org)
- Seattle, WA: `76t5-zqzr` (data.seattle.gov)

### ArcGISConnector
**Config:**
```json
{
  "endpoint_url": "https://services.arcgis.com/...",
  "layer_id": "0"
}
```

**Features:**
- FeatureServer `/query` with `outFields=*`
- Geometry extraction (Point, Polygon) to lat/lon + GeoJSON
- Incremental sync via `OBJECTID` or `lastEditDate`
- Spatial reference: `outSR=4326` (WGS84)

## Adding New Sources

### 1. Find a Data Source
Look for open data portals with building permits:
- Socrata: Search on [OpenDataNetwork](https://www.opendatanetwork.com/)
- ArcGIS: Check city/county GIS portals

### 2. Identify Roofing Permits
Look for fields like:
- `permit_type`, `work_description`, `description`
- Keywords: roof, reroof, shingle, etc.

### 3. Register Source
**Via API:**
```bash
curl -X POST http://localhost:5000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "City Name - Building Permits",
    "platform": "socrata",
    "endpoint_url": "https://data.cityname.gov",
    "config": {
      "dataset_id": "xxxx-yyyy"
    },
    "enabled": 1,
    "max_rows_per_run": 5000,
    "max_requests_per_minute": 10
  }'
```

**Via Seed Script:**
Add to `infra/seed_sources.ts` and run:
```bash
npm run tsx infra/seed_sources.ts
```

### 4. Trigger Backfill
```bash
curl -X POST http://localhost:5000/api/sources/:id/ingest?mode=backfill
```

## Data Ethics & Safeguards

**Rate Limiting:**
- Configurable per source (default: 10 req/min)
- Exponential backoff on errors (3 retries with jitter)
- Request caching to minimize redundant calls

**Provenance:**
- Every permit records: `platform`, `url`, `fetched_at`, `fields_map`
- Enables audit trails and data quality debugging

**Robots.txt & ToS:**
- Manual verification required before enabling sources
- Respect crawl delays and disallow directives
- See `POLICY.md` for opt-out process

**Fingerprint Deduplication:**
- Prevents duplicate permits from re-ingestion
- Upserts on unique fingerprint

## Acceptance Tests

Run via Playwright:
```bash
npm run test:e2e
```

**Critical Paths:**
1. Health endpoint returns `status: "healthy"`
2. Socrata backfill ingests ≥1 roofing permit
3. ArcGIS backfill ingests ≥1 permit (if configured)
4. Map displays markers and popups
5. Filters work (roofing_only, date range, city/state)
6. Drawer syncs with map viewport
7. Fingerprint deduplication prevents duplicates

## Future Enhancements

**Phase 2:**
- Proprietary connectors (eTRAKiT, Citizenserve, Accela, EnerGov)
- Bulk CSV/JSON file connector
- Server-side clustering for large datasets
- APScheduler cron jobs for automated sync

**Phase 3:**
- PostGIS for native geometry support
- Demographic choropleth layers (TIGER/ACS)
- Admin dashboard for metrics visualization
- FOIA request tracker for manual data acquisition

## License

MIT

## Contact

For data removal requests or source opt-outs, see `POLICY.md`.
# Force rebuild Mon Nov  3 05:56:17 PM UTC 2025
