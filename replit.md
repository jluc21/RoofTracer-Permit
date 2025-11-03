# RoofTracer - US Roofing Permits Map

## Overview

RoofTracer is a production-ready mapping platform that ingests and visualizes roofing permit data from public open data portals across the United States. The application pulls data from Socrata SODA APIs and ArcGIS Feature Services, normalizes it to a BLDS-style schema, and presents it on an interactive map with advanced filtering capabilities. Its core purpose is to provide transparency and insights into roofing construction activity by aggregating publicly available building permit data in a unified, searchable interface.

Key capabilities include automated ingestion, intelligent roofing classification, interactive map visualization with clustering, and an administrative interface for data source management.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Critical Fixes (November 3, 2025)

### Data Display Issue - RESOLVED ✅

**Problem:** Permits never appeared on the map despite successful data ingestion and API responses.

**Root Causes:**
1. **WebGL Initialization Failure** - MapLibre GL JS couldn't initialize in containerized/headless environments (Railway, Playwright)
2. **No Bounds Set** - Failed map initialization prevented `onBoundsChange` from firing, leaving `bounds` as `null`
3. **Disabled Query** - Permit query had `enabled: bounds !== null`, so it never fetched
4. **Query Key Format Bug** - Query used array format `['/api/permits', 'bbox=...']` but default query function joins with `/`, creating invalid URLs like `/api/permits/bbox=...` instead of `/api/permits?bbox=...`

**Solutions Implemented:**
1. **Auto-Backfill on Startup** (`server/index.ts`) - Server automatically ingests data from enabled sources on startup
2. **WebGL Fallback** (`client/src/components/PermitMap.tsx`) - Added `failIfMajorPerformanceCaveat: false` and error handling that sets default US bounds even when map fails
3. **Query Key Fix** (`client/src/pages/MapView.tsx`) - Changed to single string format: `['/api/permits?bbox=...']`

**Result:** ✅ Map now displays **2,063+ permits** successfully. App works even without WebGL visualization - permits appear in drawer and filters work correctly.

## System Architecture

### Frontend Architecture

The frontend is built with React 18 and TypeScript using Vite. It utilizes Shadcn UI with Tailwind CSS, following Material Design 3 principles. TanStack Query manages server state and API interactions. MapLibre GL JS provides interactive map visualization with OpenStreetMap tiles and client-side clustering. All filters, map bounds, and selected permits are synchronized with URL query parameters for shareability. The design prioritizes a map-centric layout, URL as the source of truth, optimistic UI updates, and a responsive, mobile-first approach.

### Backend Architecture

The backend is an Express.js application with TypeScript on Node.js. It uses Drizzle ORM with PostgreSQL (Neon serverless driver) for type-safe database queries. The API is RESTful, organized by resources like `/api/sources`, `/api/permits`, and `/api/status`. A pluggable connector architecture supports Socrata, ArcGIS, and Accela platforms, with an interface for `validate()`, `backfill()`, `incremental()`, and `normalize()` operations. The system includes rate limiting with exponential backoff and data normalization with fingerprinting for deduplication, YAML-based roofing classification rules, and structured address parsing. Centralized error handling provides consistent API responses.

### Data Storage

The primary database is PostgreSQL (Neon serverless), chosen for its JSON/JSONB support, potential for spatial extensions, and scalability. The schema is BLDS-inspired, featuring `permits` (with provenance, classification, and geographic data), `sources` (configuration and budget controls), and `source_state` tables (tracking sync status and errors). Indexing is applied to `fingerprint`, `(lat, lon)`, `issue_date`, `is_roofing`, and `source_id` for optimized querying. Drizzle Kit manages schema migrations.

### Authentication & Authorization

Currently, no authentication is required as all data is publicly sourced and viewable. Future considerations for user accounts would involve NextAuth.js and row-level security.

## External Dependencies

**Open Data APIs:**
- **Socrata SODA API:** For city/county building permits.
- **ArcGIS Feature Services:** For municipality data.
- **Accela Civic Platform:** Web-based permit portals (requires Playwright for scraping).

**Mapping Services:**
- **OpenStreetMap Tiles:** Free map tiles.
- **MapLibre GL JS:** Open-source map renderer.

**Infrastructure:**
- **Neon PostgreSQL:** Serverless Postgres database.
- **Railway:** Production deployment platform.
- **Playwright:** Headless browser automation for Accela scraping.

**Development Tools:**
- **Vite:** Development server and bundler.
- **TypeScript:** Type safety.
- **Drizzle Kit:** Database migrations.
- **esbuild:** Server-side bundling.

## Environment Variables

### Required for Production (Railway)

**`ACCELA_USE_PLAYWRIGHT`** - Set to `true` to enable live Playwright scraping for Accela sources
- **Default:** Not set (uses demo fixture data)
- **Production:** `true` (enables real permit scraping)
- **Location:** Railway Dashboard → Variables tab

**Database Variables** - Automatically set by Railway PostgreSQL addon
- `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

**Session Secret** - Auto-generated by Railway
- `SESSION_SECRET`

### Local Development

Create a `.env` file in the project root (already gitignored):

```env
ACCELA_USE_PLAYWRIGHT=true
```

## Railway Deployment Guide

### Prerequisites
- Railway account connected to GitHub
- PostgreSQL addon provisioned
- Environment variables configured

### Deployment Steps

1. **Configure Environment Variables**
   ```
   Railway Dashboard → Your Service → Variables
   Add: ACCELA_USE_PLAYWRIGHT = true
   ```

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "feat: Docker deployment with Playwright"
   git push
   ```

3. **Railway Auto-Deploy**
   - Railway detects `Dockerfile` and builds using Docker
   - Build time: ~5-10 minutes (includes Playwright browsers)
   - Automatic deployment on success

4. **Verify Deployment**
   - Visit Railway URL → Should show map
   - Navigate to `/sources` → See all 6 data sources
   - Click "Backfill" on any source → Starts ingestion

### Data Sources Available

1. **Austin, TX** (Socrata) - Building permits
2. **San Francisco, CA** (Socrata) - Building permits  
3. **Boston, MA** (Socrata) - Building permits
4. **Seattle, WA** (Socrata) - Building permits
5. **Sacramento County** (Accela) - Roofing permits via Playwright
6. **City of Lincoln** (Accela) - Roofing permits via Playwright

## Troubleshooting Railway Deployments

### Issue: Frontend Not Updating (Missing Buttons/Features)

**Symptoms:**
- New UI components don't appear on deployed site
- Buttons missing on data source cards
- Old version of frontend showing even after redeploy

**Root Cause:**
Railway/Docker may cache build artifacts, preventing fresh frontend builds.

**Solution:**

1. **Clear Railway Build Cache**
   - Railway Dashboard → Your Service → Settings
   - Scroll to "Danger Zone"
   - Click "Clear Build Cache"
   - Redeploy the service

2. **Force Fresh Build via Git**
   ```bash
   # Make a trivial change to force rebuild
   git commit --allow-empty -m "chore: force Railway rebuild"
   git push
   ```

3. **Verify Build Logs**
   - Check Railway Deployments tab
   - Look for successful Vite build: `✓ Frontend build successful (1.4M)`
   - Confirm backend build: `✓ Backend build successful (72K)`

4. **Clear Browser Cache**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Or use Incognito/Private browsing window

### Issue: Playwright Not Working

**Symptoms:**
- Accela sources using demo/fixture data instead of live scraping
- No real permits from Sacramento/Lincoln appearing on map

**Solution:**

1. **Verify Environment Variable**
   - Railway Dashboard → Variables tab
   - Ensure `ACCELA_USE_PLAYWRIGHT=true` is set
   - Redeploy after adding variable

2. **Check Build Image**
   - Verify Dockerfile uses Playwright image: `mcr.microsoft.com/playwright:v1.48.0-jammy`
   - This includes all browser dependencies needed for scraping

### Build Process Details

The build system now includes:
- **Cache clearing**: Removes all Vite caches before building
- **Build verification**: Confirms frontend and backend files exist
- **Error handling**: Fails fast if build steps don't complete

Build artifacts:
- Frontend: `dist/public/` (served by Express)
- Backend: `dist/index.js` (Node.js server)