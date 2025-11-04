import { db } from "./db";
import { sql } from "drizzle-orm";
import { sources, permits, sourceState, sourcePlatformEnum } from "../shared/schema";
import { storage } from "./storage";

/**
 * Initialize database schema and seed initial data sources
 * Safe to run multiple times - checks for existing data
 */
export async function initializeDatabase() {
  console.log("[db-init] Starting database initialization...");

  try {
    // Create enum types if they don't exist
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE source_platform AS ENUM (
          'socrata',
          'arcgis',
          'bulk',
          'etrakit',
          'citizenserve',
          'bsa',
          'mgo',
          'accela',
          'energov',
          'opengov',
          'smartgov',
          'cityview',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create sources table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL,
        platform source_platform NOT NULL,
        endpoint_url TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        enabled INTEGER NOT NULL DEFAULT 1,
        schedule_cron TEXT,
        max_rows_per_run INTEGER DEFAULT 1000,
        max_runtime_minutes INTEGER DEFAULT 30,
        max_requests_per_minute INTEGER DEFAULT 10,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create source_state table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS source_state (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        last_max_timestamp TIMESTAMP,
        last_max_objectid INTEGER,
        last_issue_date DATE,
        etag TEXT,
        checksum TEXT,
        last_sync_at TIMESTAMP,
        rows_fetched INTEGER DEFAULT 0,
        rows_upserted INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        freshness_seconds INTEGER,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add missing columns for live progress tracking (safe - won't fail if columns exist)
    await db.execute(sql`
      ALTER TABLE source_state 
      ADD COLUMN IF NOT EXISTS is_running INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status_message TEXT,
      ADD COLUMN IF NOT EXISTS current_page INTEGER DEFAULT 0
    `);

    // Create permits table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS permits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        source_name TEXT NOT NULL,
        source_platform source_platform NOT NULL,
        source_record_id TEXT NOT NULL,
        permit_type TEXT,
        work_description TEXT,
        permit_status TEXT,
        issue_date DATE,
        address_raw TEXT,
        address_parsed JSONB,
        parcel_id TEXT,
        owner_name TEXT,
        contractor_name TEXT,
        permit_value NUMERIC(12, 2),
        lat NUMERIC(10, 7),
        lon NUMERIC(10, 7),
        geom_geojson JSONB,
        fingerprint TEXT NOT NULL UNIQUE,
        is_roofing INTEGER NOT NULL DEFAULT 0,
        ingest_ts TIMESTAMP NOT NULL DEFAULT NOW(),
        provenance JSONB NOT NULL,
        raw_blob_path TEXT
      )
    `);

    // Create geocode_cache table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS geocode_cache (
        id SERIAL PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        lat NUMERIC(10, 7) NOT NULL,
        lon NUMERIC(10, 7) NOT NULL,
        cached_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_permits_fingerprint ON permits(fingerprint)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_permits_coords ON permits(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_permits_issue_date ON permits(issue_date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_permits_roofing ON permits(is_roofing) WHERE is_roofing = 1`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_permits_source_id ON permits(source_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_geocode_address ON geocode_cache(address)`);

    console.log("[db-init] Schema created successfully");

    // Seed initial data sources if database is empty
    await seedDataSources();

    console.log("[db-init] Database initialization complete!");
  } catch (error) {
    console.error("[db-init] Failed to initialize database:", error);
    throw error;
  }
}

async function seedDataSources() {
  try {
    const existingSources = await storage.getSources();
    
    if (existingSources.length > 0) {
      console.log(`[db-init] Found ${existingSources.length} existing sources. Skipping seed.`);
      return;
    }

    console.log("[db-init] Seeding initial data sources...");

    // Sacramento County - Accela (Source ID 5)
    await storage.createSource({
      name: "Sacramento County - Building Permits",
      platform: "accela",
      endpoint_url: "https://aca-prod.accela.com/sacramento",
      config: {
        module: "Building",
        record_type: null,
        keywords: ["roof", "reroof", "re-roof"],
      },
      enabled: 1, // Enabled - Playwright available on Railway
      schedule_cron: "0 2 * * *",
      max_rows_per_run: 100,
      max_runtime_minutes: 45,
      max_requests_per_minute: 5,
    });

    // City of Lincoln - Accela (Source ID 6)
    await storage.createSource({
      name: "City of Lincoln - Building Permits",
      platform: "accela",
      endpoint_url: "https://aca-prod.accela.com/lincolnca",
      config: {
        module: "Building",
        record_type: null,
        keywords: ["roof", "reroof", "re-roof"],
      },
      enabled: 1, // Enabled - Playwright available on Railway
      schedule_cron: "0 3 * * *",
      max_rows_per_run: 100,
      max_runtime_minutes: 45,
      max_requests_per_minute: 5,
    });

    // Austin, TX - Socrata
    await storage.createSource({
      name: "Austin, TX - Building Permits",
      platform: "socrata",
      endpoint_url: "https://data.austintexas.gov",
      config: {
        dataset_id: "3syk-w9eu",
        app_token: null,
      },
      enabled: 1,
      schedule_cron: "0 4 * * *",
      max_rows_per_run: 5000,
      max_runtime_minutes: 30,
      max_requests_per_minute: 10,
    });

    // San Francisco - Socrata
    await storage.createSource({
      name: "San Francisco, CA - Building Permits",
      platform: "socrata",
      endpoint_url: "https://data.sfgov.org",
      config: {
        dataset_id: "i98e-djp9",
        app_token: null,
      },
      enabled: 1,
      schedule_cron: "0 5 * * *",
      max_rows_per_run: 5000,
      max_runtime_minutes: 30,
      max_requests_per_minute: 10,
    });

    // Boston, MA - Socrata
    await storage.createSource({
      name: "Boston, MA - Building Permits",
      platform: "socrata",
      endpoint_url: "https://data.boston.gov",
      config: {
        dataset_id: "msk6-43c6",
        app_token: null,
      },
      enabled: 1,
      schedule_cron: "0 6 * * *",
      max_rows_per_run: 5000,
      max_runtime_minutes: 30,
      max_requests_per_minute: 10,
    });

    // Seattle, WA - Socrata
    await storage.createSource({
      name: "Seattle, WA - Building Permits",
      platform: "socrata",
      endpoint_url: "https://data.seattle.gov",
      config: {
        dataset_id: "76t5-zqzr",
        app_token: null,
      },
      enabled: 1,
      schedule_cron: "0 7 * * *",
      max_rows_per_run: 5000,
      max_runtime_minutes: 30,
      max_requests_per_minute: 10,
    });

    console.log("[db-init] ✓ Seeded 6 data sources (all enabled for Sacramento area focus)");
    console.log("[db-init] Auto-backfill will ingest permits from enabled sources on startup");
  } catch (error) {
    console.error("[db-init] Failed to seed data sources:", error);
    throw error;
  }
}
