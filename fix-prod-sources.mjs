#!/usr/bin/env node

// Fix Production Sources - Disable non-Sacramento sources via API

const PROD_URL = process.env.PROD_URL || "https://rooftracer-permit-production.up.railway.app";

async function updateSource(id, data) {
  const url = `${PROD_URL}/api/sources/${id}`;
  console.log(`Updating source ${id}...`);
  
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
  const sources = await response.json();
  return sources;
}

async function main() {
  console.log(`\n🔧 Fixing production sources on: ${PROD_URL}\n`);
  
  // Get current sources
  console.log("📋 Current sources:");
  const sources = await getSources();
  sources.forEach(s => {
    console.log(`  ID ${s.id}: ${s.name} (${s.platform}) - Enabled: ${s.enabled === 1 ? 'YES' : 'NO'}`);
  });
  
  console.log("\n❌ Disabling non-Sacramento sources...\n");
  
  // Disable unwanted sources based on name
  const toDisable = sources.filter(s => 
    s.name.includes('San Francisco') || 
    s.name.includes('Austin') ||
    s.name.includes('Boston') ||
    s.name.includes('Seattle')
  );
  
  for (const source of toDisable) {
    console.log(`  Disabling: ${source.name} (ID ${source.id})`);
    await updateSource(source.id, { enabled: 0 });
  }
  
  console.log("\n✅ Enabling Sacramento area sources...\n");
  
  // Enable Sacramento area sources
  const toEnable = sources.filter(s => 
    s.enabled === 0 && (
      s.name.includes('Sacramento') ||
      s.name.includes('Placer') ||
      s.name.includes('Lincoln') ||
      s.name.includes('Roseville') ||
      s.name.includes('Folsom') ||
      s.name.includes('Rocklin') ||
      s.name.includes('El Dorado')
    )
  );
  
  for (const source of toEnable) {
    console.log(`  Enabling: ${source.name} (ID ${source.id})`);
    await updateSource(source.id, { enabled: 1 });
  }
  
  // Show final state
  console.log("\n📊 Final state:");
  const finalSources = await getSources();
  const enabled = finalSources.filter(s => s.enabled === 1);
  
  console.log(`\n✓ ${enabled.length} sources enabled:`);
  enabled.forEach(s => {
    console.log(`  • ${s.name} (${s.platform})`);
  });
  
  console.log("\n✅ Done! Production will now ingest Sacramento area permits only.\n");
}

main().catch(console.error);
