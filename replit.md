# RoofTracer - US Roofing Permits Map

## Overview

RoofTracer is a production-ready mapping platform that ingests and visualizes roofing permit data from public open data portals across the United States. The application pulls data from Socrata SODA APIs and ArcGIS Feature Services, normalizes it to a BLDS-style schema, and presents it on an interactive map with advanced filtering capabilities.

**Core Purpose:** Provide transparency and insights into roofing construction activity by aggregating publicly available building permit data in a unified, searchable interface.

**Key Capabilities:**
- Automated ingestion from open data portals (Socrata, ArcGIS)
- Intelligent roofing classification using configurable rules
- Interactive map visualization with clustering and popups
- Administrative interface for managing data sources
- Real-time filtering by location, date range, and permit type

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (November 2, 2025)

### Full Pipeline Demonstration - COMPLETE ✅

**End-to-End Validation:**
- **3 Sacramento-area test permits** successfully processed through complete pipeline:
  1. `700 H Street, Sacramento, CA 95814` → Geocoded (38.5816, -121.5015)
  2. `9283 Greenback Lane, Orangevale, CA 95662` → Geocoded (38.6835, -121.2226)
  3. `100 Main Street, Roseville, CA 95678` → Geocoded (38.7521, -121.2883)
- All permits stored in database with `is_roofing=1`, valid coordinates, and complete provenance metadata
- **Map display verified:** Permits accessible at `http://localhost:5000/?bbox=-122,38,-121,39&roofing=1`
- **Geocoding caching confirmed:** Nominatim results cached in both memory and `geocode_cache` table

**Production Deployment Guide - COMPLETE ✅**
- Created comprehensive 800+ line deployment guide (`docs/production-deployment-guide.md`)
- **4 hosting options documented:**
  1. Railway (easiest, auto-scaling)
  2. Fly.io (best performance, edge deployment)
  3. Render (free tier available)
  4. VPS (full control, cheapest at scale)
- **Playwright Docker setup:** Recommends official Playwright Docker images (mcr.microsoft.com/playwright) to avoid dependency management
- **Scheduled ingestion:** Fixed Railway cron configuration (uses public HTTPS URL instead of localhost), documented node-cron alternative
- **Complete sections:**
  - System requirements (Playwright browser dependencies)
  - Environment variables and secrets management
  - Database migration and source seeding
  - Ingestion runners (manual, cron, scheduled jobs)
  - Rate limiting strategies (Nominatim 1 req/sec, Accela anti-ban)
  - Security best practices (SSL, CORS, secret rotation)
  - Monitoring and logging (platform-native + Sentry)
  - Performance optimization (indexing, connection pooling, CDN)
  - Cost estimates for each platform
  - Troubleshooting guide

**Technical Decisions:**
- **Official Docker images preferred:** Using `mcr.microsoft.com/playwright:v1.48.0-jammy` eliminates dependency management complexity
- **Accela connector ready for production:** Playwright automation code complete, requires non-Replit hosting
- **Geocoding not cached on failure:** Transient errors (rate limits, network) are NOT cached to allow retry on next run
- **Cron jobs use HTTPS:** Railway/Render cron must call public URLs (not localhost) as they run in separate containers

### Earlier Work (October 30, 2025)

**Sacramento-Area Integration Project - Session 2**

**Geocoding Service - COMPLETED ✅**
- Implemented production-ready Nominatim geocoding service (`server/services/geocoding.ts`)
- **Rate limiting:** 1.1 seconds between requests (respects Nominatim's 1 req/sec policy)
- **Dual caching strategy:**
  - In-memory cache for fast lookups within single ingestion run
  - Database cache (`geocode_cache` table) for persistence across runs
- **Error handling:** Exponential backoff with retries, graceful null handling
- **Integration:** Fully integrated into Accela connector, ready for other connectors
- **Validation:** Tested with 3 real Sacramento-area addresses - all geocoded successfully

**Enhanced Roofing Classification - COMPLETED ✅**
- Added exclusion filter system to prevent false positives
- **20+ exclusion terms:** solar panels, photovoltaic, HVAC, heating, cooling, furnace, etc.
- **Smart logic:** Exclusions checked FIRST before classification to avoid misclassification
- **Updated classifier:** Modified `server/normalization/classifier.ts` to use exclusion rules
- **Rules file:** Enhanced `server/normalization/roofing_rules.yaml` with exclusions section

**Lincoln Integration - COMPLETED ✅**
- Added City of Lincoln as Source ID 6 (Accela platform)
- **Portal URL:** https://aca-prod.accela.com/lincolnca
- **Connector:** Reuses existing AccelaConnector (agency-agnostic architecture)
- **Configuration:** Building module with roof/reroof/re-roof keyword search

**Active Data Sources:**
1. Sacramento County (Accela) - Source ID 5
2. City of Lincoln (Accela) - Source ID 6
3. _Future:_ Folsom, Rocklin, El Dorado County (eTRAKiT), Auburn (Tyler EnerGov), Citrus Heights

### Earlier Work (October 30, 2025) - Session 1

**Accela Connector Proof-of-Concept:**
- Built foundation for Accela Citizen Access portal integration (`server/connectors/accela.ts`)
- Demonstrated architecture for proprietary platform connectors (browser automation pattern)
- Created comprehensive extension guide (`docs/accela-connector-guide.md`)
- Registered Accela platform in connector factory (`server/routes.ts`)

**Architecture Documented:**
- Playwright-based web scraping pattern for ASP.NET WebForms portals
- Geocoding service integration strategy (Nominatim selected for free tier)
- Address parsing and normalization for varied municipal formats
- Pagination handling and rate limiting for portal scraping

**Production Requirements for Full Accela Automation:**
1. Playwright browser installation (`npx playwright install chromium`)
2. Agency-specific HTML selectors and field mappings (Sacramento County, Lincoln)
3. Session management and error recovery strategies
4. Testing with 100-1000 permit sample for accuracy validation

## System Architecture

### Frontend Architecture

**Framework:** React 18 with TypeScript, built using Vite for fast development and optimized production builds.

**UI Components:** Shadcn UI component library (based on Radix UI primitives) with Tailwind CSS for styling. Design follows Material Design 3 principles with emphasis on data clarity and professional aesthetics.

**State Management:** TanStack Query (React Query) handles all server state, caching, and API interactions. No global state library needed - component state and URL parameters drive the UI.

**Mapping:** MapLibre GL JS provides the interactive map visualization, using OpenStreetMap tiles. Client-side clustering improves performance with large datasets. Custom popups display permit details.

**URL Synchronization:** All filters, map bounds, and selected permits are synced to URL query parameters, enabling shareable links and browser back/forward navigation.

**Key Design Decisions:**
- **Map-centric layout:** Fullscreen map canvas with overlay panels (filter bar, side drawer) to maximize spatial context
- **URL as source of truth:** All UI state persists in URL for shareability and bookmark-ability
- **Optimistic UI updates:** TanStack Query's mutation system provides instant feedback while background operations complete
- **Responsive design:** Mobile-first approach with breakpoint at 768px (useIsMobile hook)

### Backend Architecture

**Framework:** Express.js with TypeScript running on Node.js. Chosen for its maturity, extensive middleware ecosystem, and seamless integration with the Vite dev server.

**Database ORM:** Drizzle ORM with PostgreSQL (via Neon serverless driver). Drizzle provides type-safe database queries with minimal runtime overhead and excellent TypeScript inference.

**API Design:** RESTful endpoints organized by resource:
- `/api/sources` - CRUD operations for data sources
- `/api/sources/:id/ingest` - Trigger manual ingestion jobs
- `/api/permits` - Query permits with filtering/pagination
- `/api/health` - System health checks
- `/api/status` - Per-source freshness metrics

**Data Connectors:** Pluggable connector architecture implementing a common interface:
- **Socrata** (`server/connectors/socrata.ts`) - Production-ready for SODA API portals
- **ArcGIS** (`server/connectors/arcgis.ts`) - Production-ready for Feature Services  
- **Accela** (`server/connectors/accela.ts`) - Proof-of-concept for Citizen Access portals
- Connector Interface: `validate()`, `backfill()`, `incremental()`, `normalize()`
- See `docs/accela-connector-guide.md` for proprietary platform integration patterns

**Rate Limiting:** Built-in rate limiter with exponential backoff and jitter prevents overwhelming external APIs. Configurable per-source with `max_requests_per_minute` and retry logic.

**Data Normalization:**
- **Fingerprinting:** SHA-256 hash of (street + city + state + parcel + date + type) enables deduplication across ingestions
- **Roofing Classification:** YAML-based rules engine matches permit types and work descriptions against configurable tokens (roof, reroof, shingle, TPO, etc.)
- **Address Parsing:** Structured extraction into `address_parsed` JSONB field for consistent querying

**Error Handling:** Centralized error middleware captures and logs failures. API responses use consistent JSON structure with error codes and human-readable messages.

### Data Storage

**Primary Database:** PostgreSQL (hosted on Neon serverless platform). Chosen for:
- Strong JSON/JSONB support for flexible schema evolution
- Spatial extensions capability (PostGIS) for future geometric queries
- Mature ecosystem and tooling
- Serverless scaling matches variable workload

**Schema Design (BLDS-inspired):**

**permits table:**
- `id` (UUID) - Primary key
- `source_id`, `source_name`, `source_platform` - Provenance tracking
- `source_record_id` - Original ID from source system
- `permit_type`, `work_description`, `permit_status` - Core permit attributes
- `issue_date` - Date-based filtering and freshness
- `address_raw` (text), `address_parsed` (JSONB) - Flexible address handling
- `lat`, `lon`, `geom_geojson` - Geographic coordinates (currently lat/lon, GeoJSON reserved for future)
- `fingerprint` (indexed) - Deduplication key
- `is_roofing` (boolean) - Precomputed classification flag
- `provenance` (JSONB) - Metadata (platform, URL, fetch timestamp, field mappings)

**sources table:**
- Configuration for each data source (endpoint, credentials, schedules)
- Budget controls (`max_rows_per_run`, `max_runtime_minutes`, `max_requests_per_minute`)
- Enable/disable flag for operational control

**source_state table:**
- Tracks last successful sync timestamp per source
- Enables incremental ingestion (fetch only records newer than `last_max_timestamp`)
- Stores error counts and run statistics

**Indexing Strategy:**
- `fingerprint` - Uniqueness constraint and fast deduplication lookups
- `(lat, lon)` - Spatial queries (bounding box filters)
- `issue_date` - Date range filtering
- `is_roofing` - Roofing-only filter optimization
- `source_id` - Per-source queries

**Migration Management:** Drizzle Kit handles schema migrations with version control in `/migrations` directory.

### Authentication & Authorization

**Current State:** No authentication required - all data is publicly sourced and publicly viewable.

**Future Considerations:** If user accounts are added (saved searches, alerts), consider:
- NextAuth.js for OAuth providers
- Session storage in PostgreSQL (connect-pg-simple already configured)
- Row-level security for user-specific data

### External Dependencies

**Open Data APIs:**
- **Socrata SODA API:** Primary source for city/county building permits. Supports SoQL queries, pagination, and optional app tokens for higher rate limits.
- **ArcGIS Feature Services:** Alternative source format, common in municipalities. Supports geometry extraction and WHERE clause filtering.

**Mapping Services:**
- **OpenStreetMap Tiles:** Free, community-maintained map tiles served via standard tile servers (https://tile.openstreetmap.org)
- **MapLibre GL JS:** Open-source map renderer (fork of Mapbox GL JS before license change)

**Infrastructure:**
- **Neon PostgreSQL:** Serverless Postgres with automatic scaling, branching, and connection pooling
- **Replit Hosting:** Deployment platform with built-in environment variables and secrets management

**Development Tools:**
- **Vite:** Development server with HMR and production bundler
- **TypeScript:** Type safety across frontend and backend
- **Drizzle Kit:** Database migrations and introspection
- **esbuild:** Fast server-side bundling for production

**Optional Enhancements (not required):**
- **Socrata App Token:** Increases rate limits from 1,000 to 10,000 requests/day (free registration)
- **APScheduler (Python) / node-cron (Node):** For automated scheduled ingestion (currently manual trigger only)

**Rate Limit Compliance:**
- Configurable delays between requests (default 10 req/min)
- Exponential backoff with jitter on HTTP 429 (rate limit) errors
- Respect for robots.txt directives (manual verification before enabling sources)
- User-Agent headers identify the application

**Data Ethics:**
- Only ingest from publicly accessible portals with explicit data sharing permissions
- Maintain provenance metadata linking each record to its source URL
- No scraping of authentication-protected systems
- Full attribution to original data providers