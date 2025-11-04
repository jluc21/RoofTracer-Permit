# RoofTracer - US Roofing Permits Map

## Overview

RoofTracer is a production-ready mapping platform that ingests and visualizes roofing permit data from public open data portals across the United States. It pulls data from various APIs, normalizes it to a BLDS-style schema, and presents it on an interactive map with advanced filtering capabilities. The platform aims to provide transparency and insights into roofing construction activity by aggregating publicly available building permit data in a unified, searchable interface. Key capabilities include automated ingestion, intelligent roofing classification, interactive map visualization with clustering, and an administrative interface for data source management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React 18 and TypeScript using Vite. It utilizes Shadcn UI with Tailwind CSS, following Material Design 3 principles. TanStack Query manages server state and API interactions. MapLibre GL JS provides interactive map visualization with OpenStreetMap tiles and client-side clustering. All filters, map bounds, and selected permits are synchronized with URL query parameters for shareability. The design prioritizes a map-centric layout, URL as the source of truth, optimistic UI updates, and a responsive, mobile-first approach.

### Backend Architecture

The backend is an Express.js application with TypeScript on Node.js. It uses Drizzle ORM with PostgreSQL (Neon serverless driver) for type-safe database queries. The API is RESTful, organized by resources like `/api/sources`, `/api/permits`, and `/api/status`. A pluggable connector architecture supports Socrata, ArcGIS, and Accela platforms, with an interface for `validate()`, `backfill()`, `incremental()`, and `normalize()` operations. The system includes rate limiting with exponential backoff and data normalization with fingerprinting for deduplication, YAML-based roofing classification rules, and structured address parsing. Centralized error handling provides consistent API responses.

**Universal ArcGIS Deduplication:** The ArcGIS connector implements automatic database-aware OBJECTID tracking to prevent duplicate ingestion. Before each backfill or incremental run, the system queries the database for the actual maximum OBJECTID using `storage.getMaxSourceRecordId()`, which casts `source_record_id` to INTEGER before taking MAX (avoiding lexicographic sorting issues). The connector then uses `Math.max(state.last_max_objectid, dbMaxObjectId)` as the starting point for the WHERE clause (`OBJECTID > {startingObjectId}`). This ensures that even if state tracking becomes outdated (e.g., from old permits ingested before provenance tracking), the system automatically resumes from the true latest permit. This universal solution works automatically for all ArcGIS sources (Sacramento, Placer, and any future counties) without manual intervention. November 2025: Successfully increased Sacramento County from 7,765 to 8,088+ permits by detecting the actual database maximum (OBJECTID 6621) versus stale state (3547).

### Data Storage

The primary database is PostgreSQL (Neon serverless), chosen for its JSON/JSONB support, potential for spatial extensions, and scalability. The schema is BLDS-inspired, featuring `permits` (with provenance, classification, and geographic data), `sources` (configuration and budget controls), and `source_state` tables (tracking sync status and errors). Indexing is applied to `fingerprint`, `(lat, lon)`, `issue_date`, `is_roofing`, and `source_id` for optimized querying. Drizzle Kit manages schema migrations.

### Authentication & Authorization

Currently, no authentication is required as all data is publicly sourced and viewable.

## External Dependencies

**Open Data APIs:**
- Socrata SODA API
- ArcGIS Feature Services
- Accela Civic Platform (requires Playwright for scraping)

**Mapping Services:**
- OpenStreetMap Tiles
- MapLibre GL JS

**Infrastructure:**
- Neon PostgreSQL
- Railway (Production deployment platform)
- Playwright (Headless browser automation for Accela scraping)

**Development Tools:**
- Vite
- TypeScript
- Drizzle Kit
- esbuild