#!/usr/bin/env node

// Disable Accela sources (Playwright broken) and enable working ArcGIS sources

const PROD_URL = process.env.PROD_URL || "https://rooftracer-permit-production.up.railway.app";

async function updateSource(id, data) {
  const url = `${PROD_URL}/api/sources/${id}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    console.error(`Failed to update source ${id}: ${response.status}`);
  } else {
    console.log(`✓ Updated source ${id}`);
  }
}

async function getSources() {
  const response = await fetch(`${PROD_URL}/api/sources`);
  return await response.json();
}

async function main() {
  console.log(`\n🔧 Disabling broken Accela sources, enabling ArcGIS sources...\n`);
  
  const sources = await getSources();
  
  // Disable ALL Accela sources (Playwright broken in production)
  console.log("❌ Disabling Accela sources (Playwright version mismatch):\n");
  const accelaSources = sources.filter(s => s.platform === 'accela');
  for (const source of accelaSources) {
    console.log(`  Disabling: ${source.name} (ID ${source.id})`);
    await updateSource(source.id, { enabled: 0 });
  }
  
  // Enable Sacramento County ArcGIS (the main source with 127k+ permits!)
  console.log("\n✅ Enabling ArcGIS sources:\n");
  const arcgisSources = sources.filter(s => 
    s.platform === 'arcgis' && 
    (s.name.includes('Sacramento') || s.name.includes('Placer'))
  );
  
  for (const source of arcgisSources) {
    console.log(`  Enabling: ${source.name} (ID ${source.id})`);
    await updateSource(source.id, { enabled: 1 });
  }
  
  // Show final enabled sources
  console.log("\n📊 Final enabled sources:");
  const finalSources = await getSources();
  const enabled = finalSources.filter(s => s.enabled === 1);
  
  enabled.forEach(s => {
    console.log(`  • ${s.name} (${s.platform}) - ${s.max_rows_per_run} permits/batch`);
  });
  
  console.log("\n✅ Done! Production will now focus on working ArcGIS sources.\n");
  console.log("💡 Sacramento County ArcGIS has 127,000+ permits ready to ingest!\n");
}

main().catch(console.error);
