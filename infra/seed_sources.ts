// Seed script to register sample data sources
import { storage } from "../server/storage";

async function seedSources() {
  console.log("Seeding data sources...");

  try {
    // Check if sources already exist
    const existing = await storage.getSources();
    if (existing.length > 0) {
      console.log(`Found ${existing.length} existing sources. Skipping seed.`);
      return;
    }

    // Add Austin, TX - Socrata source
    const austinSource = await storage.createSource({
      name: "Austin, TX - Building Permits",
      platform: "socrata",
      endpoint_url: "https://data.austintexas.gov",
      config: {
        dataset_id: "3syk-w9eu",
        app_token: process.env.SOCRATA_APP_TOKEN || null,
      },
      enabled: 1,
      schedule_cron: "0 2 * * *", // Daily at 2 AM
      max_rows_per_run: 5000,
      max_runtime_minutes: 30,
      max_requests_per_minute: 10,
    });
    console.log(`Created source: ${austinSource.name} (ID: ${austinSource.id})`);

    // Add San Francisco, CA - Socrata source
    const sfSource = await storage.createSource({
      name: "San Francisco, CA - Building Permits",
      platform: "socrata",
      endpoint_url: "https://data.sfgov.org",
      config: {
        dataset_id: "i98e-djp9",
        app_token: process.env.SOCRATA_APP_TOKEN || null,
      },
      enabled: 1,
      schedule_cron: "0 3 * * *", // Daily at 3 AM
      max_rows_per_run: 5000,
      max_runtime_minutes: 30,
      max_requests_per_minute: 10,
    });
    console.log(`Created source: ${sfSource.name} (ID: ${sfSource.id})`);

    // Add sample ArcGIS source (placeholder - replace with real endpoint)
    // Example: Los Angeles County permits
    const arcgisSource = await storage.createSource({
      name: "Sample County - ArcGIS Permits",
      platform: "arcgis",
      endpoint_url: "https://example.arcgis.com/arcgis/rest/services",
      config: {
        layer_id: "0",
      },
      enabled: 0, // Disabled by default - replace with real endpoint
      schedule_cron: "0 4 * * *", // Daily at 4 AM
      max_rows_per_run: 5000,
      max_runtime_minutes: 30,
      max_requests_per_minute: 10,
    });
    console.log(`Created source: ${arcgisSource.name} (ID: ${arcgisSource.id}) - DISABLED`);

    console.log("\n✓ Seeding complete!");
    console.log("\nTo trigger backfill for a source, run:");
    console.log(`  curl -X POST http://localhost:5000/api/sources/${austinSource.id}/ingest?mode=backfill`);
    console.log(`  curl -X POST http://localhost:5000/api/sources/${sfSource.id}/ingest?mode=backfill`);
  } catch (error) {
    console.error("Error seeding sources:", error);
    throw error;
  }
}

seedSources()
  .then(() => {
    console.log("Seed completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
