# RoofTracer Infrastructure Scripts

## Seed Scripts

### seed_sources.ts

Seeds the database with sample data sources for permit ingestion.

**Usage:**
```bash
npm run tsx infra/seed_sources.ts
```

This will create:
- Austin, TX - Building Permits (Socrata)
- San Francisco, CA - Building Permits (Socrata)  
- Sample ArcGIS source (disabled by default)

### Triggering Ingestion

After seeding, trigger backfill for a source:

**Option 1: Via API**
```bash
curl -X POST http://localhost:5000/api/sources/1/ingest?mode=backfill
curl -X POST http://localhost:5000/api/sources/1/ingest?mode=incremental
```

**Option 2: Via Application**
Navigate to `/sources` in the web app and click "Backfill" or "Sync" buttons.

## Environment Variables

Optional environment variables:

```bash
# Socrata App Token (optional but recommended for higher rate limits)
SOCRATA_APP_TOKEN=your_token_here

# Database connection (automatically provided by Replit)
DATABASE_URL=postgresql://...
```

## Adding New Sources

To add a new data source:

1. **Via Seed Script** - Add to `infra/seed_sources.ts`
2. **Via API** - POST to `/api/sources`
3. **Via UI** - Use the "Add Source" button in `/sources` (when implemented)

### Socrata Source Example

```json
{
  "name": "City Name - Building Permits",
  "platform": "socrata",
  "endpoint_url": "https://data.cityname.gov",
  "config": {
    "dataset_id": "xxxx-yyyy",
    "app_token": "optional_token"
  },
  "enabled": 1,
  "max_rows_per_run": 5000,
  "max_requests_per_minute": 10
}
```

### ArcGIS Source Example

```json
{
  "name": "County Name - Permits",
  "platform": "arcgis",
  "endpoint_url": "https://services.arcgis.com/...",
  "config": {
    "layer_id": "0"
  },
  "enabled": 1,
  "max_rows_per_run": 5000,
  "max_requests_per_minute": 10
}
```

## Data Ethics & Rate Limiting

All connectors implement:
- Exponential backoff on errors
- Configurable rate limiting (default: 10 requests/minute)
- Jittered delays to avoid thundering herd
- Respect for robots.txt and ToS (manual verification required)

See `server/connectors/` for implementation details.
