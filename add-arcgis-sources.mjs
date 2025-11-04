#!/usr/bin/env node

/**
 * Add Sacramento County ArcGIS and Placer County ArcGIS sources to production
 * 
 * Usage:
 *   DATABASE_PUBLIC_URL="postgres://..." node add-arcgis-sources.mjs
 * 
 * Get DATABASE_PUBLIC_URL from Railway:
 *   1. Click on your Postgres service
 *   2. Go to "Variables" tab
 *   3. Copy the DATABASE_PUBLIC_URL value
 */

import pg from 'pg';
const { Client } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_PUBLIC_URL;
  
  if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_PUBLIC_URL environment variable not set");
    console.error("\nGet it from Railway:");
    console.error("  1. Open your Railway Postgres service");
    console.error("  2. Click 'Variables' tab");
    console.error("  3. Copy DATABASE_PUBLIC_URL");
    console.error("\nThen run:");
    console.error('  DATABASE_PUBLIC_URL="postgres://..." node add-arcgis-sources.mjs');
    process.exit(1);
  }

  console.log("\n🔧 Connecting to production database...\n");
  
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Check current sources
    console.log("📋 Current sources:");
    const currentSources = await client.query(
      'SELECT id, name, platform, enabled FROM sources ORDER BY id'
    );
    currentSources.rows.forEach(s => {
      console.log(`  ID ${s.id}: ${s.name} (${s.platform}) - Enabled: ${s.enabled === 1 ? 'Yes' : 'No'}`);
    });

    // Check if ArcGIS sources already exist
    const existingArcGIS = await client.query(
      "SELECT id FROM sources WHERE platform = 'arcgis' AND name LIKE '%Sacramento%'"
    );
    
    if (existingArcGIS.rows.length > 0) {
      console.log("\n⚠️  Sacramento County ArcGIS source already exists! Skipping insert.\n");
    } else {
      console.log("\n✅ Adding Sacramento County ArcGIS (127k+ permits)...");
      
      await client.query(`
        INSERT INTO sources (name, platform, endpoint_url, config, enabled, max_rows_per_run, max_runtime_minutes)
        VALUES (
          'Sacramento County - All Building Permits (ArcGIS)',
          'arcgis',
          'https://services5.arcgis.com/54falWtcpty3V47Z/arcgis/rest/services/Building_Permit_Data_pub/FeatureServer/0',
          '{"where_clause": "1=1"}'::jsonb,
          1,
          50000,
          60
        )
      `);
      console.log("  ✓ Added Sacramento County ArcGIS");
    }

    // Check Placer County
    const existingPlacer = await client.query(
      "SELECT id FROM sources WHERE platform = 'arcgis' AND name LIKE '%Placer%'"
    );
    
    if (existingPlacer.rows.length > 0) {
      console.log("⚠️  Placer County ArcGIS source already exists! Skipping insert.\n");
    } else {
      console.log("✅ Adding Placer County ArcGIS (6k+ permits)...");
      
      await client.query(`
        INSERT INTO sources (name, platform, endpoint_url, config, enabled, max_rows_per_run, max_runtime_minutes)
        VALUES (
          'Placer County, CA - Active Building Permits (ArcGIS)',
          'arcgis',
          'https://services1.arcgis.com/gqsWuDm3XrqZRdD1/arcgis/rest/services/BuildingPermits/FeatureServer/1',
          '{"where_clause": "PermitStatus = ''Active''"}'::jsonb,
          1,
          50000,
          60
        )
      `);
      console.log("  ✓ Added Placer County ArcGIS\n");
    }

    // Show final sources
    console.log("📊 Final sources:");
    const finalSources = await client.query(
      'SELECT id, name, platform, enabled, max_rows_per_run FROM sources ORDER BY id'
    );
    finalSources.rows.forEach(s => {
      const enabledText = s.enabled === 1 ? '✅ Enabled' : '❌ Disabled';
      console.log(`  ID ${s.id}: ${s.name} (${s.platform})`);
      console.log(`          ${enabledText} - ${s.max_rows_per_run || 1000} permits/batch\n`);
    });

    console.log("✅ Done! Now restart your Railway deployment to start continuous ingestion.\n");
    console.log("💡 The system will automatically start processing Sacramento's 127k+ permits!");

  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error("\n❌ Failed:", error);
  process.exit(1);
});
