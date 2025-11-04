#!/usr/bin/env node

// FORCE disable all Accela sources in production - they have Playwright version issues

const PROD_URL = process.env.PROD_URL || "https://rooftracer-permit-production.up.railway.app";

async function main() {
  console.log(`\n🔧 Force disabling ALL Accela sources in production...\n`);
  
  // Get sources
  const response = await fetch(`${PROD_URL}/api/sources`);
  const sources = await response.json();
  
  console.log("📋 Current sources:");
  sources.forEach(s => {
    console.log(`  ID ${s.id}: ${s.name} (${s.platform}) - Enabled: ${s.enabled}`);
  });
  
  // Disable EVERY Accela source by platform
  console.log("\n❌ Disabling ALL Accela sources:\n");
  
  for (const source of sources) {
    if (source.platform === 'accela' && source.enabled === 1) {
      console.log(`  Disabling ID ${source.id}: ${source.name}`);
      const updateResponse = await fetch(`${PROD_URL}/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 0 })
      });
      
      if (updateResponse.ok) {
        console.log(`  ✓ Disabled`);
      } else {
        console.error(`  ✗ Failed: ${updateResponse.status}`);
      }
    }
  }
  
  // Enable ArcGIS Sacramento sources
  console.log("\n✅ Ensuring ArcGIS sources are enabled:\n");
  
  for (const source of sources) {
    if (source.platform === 'arcgis' && 
        (source.name.includes('Sacramento') || source.name.includes('Placer')) &&
        source.enabled === 0) {
      console.log(`  Enabling ID ${source.id}: ${source.name}`);
      const updateResponse = await fetch(`${PROD_URL}/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 1, max_rows_per_run: 50000 })
      });
      
      if (updateResponse.ok) {
        console.log(`  ✓ Enabled with 50k batch size`);
      } else {
        console.error(`  ✗ Failed: ${updateResponse.status}`);
      }
    }
  }
  
  // Show final enabled sources
  console.log("\n📊 Final enabled sources:");
  const finalResponse = await fetch(`${PROD_URL}/api/sources`);
  const finalSources = await finalResponse.json();
  const enabled = finalSources.filter(s => s.enabled === 1);
  
  if (enabled.length === 0) {
    console.log("  ⚠️  WARNING: NO SOURCES ENABLED!");
  } else {
    enabled.forEach(s => {
      console.log(`  • ${s.name} (${s.platform}) - ${s.max_rows_per_run || 1000} permits/batch`);
    });
  }
  
  console.log("\n✅ Done!\n");
}

main().catch(console.error);
