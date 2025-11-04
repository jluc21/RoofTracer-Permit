-- Fix Production Sources: Disable non-Sacramento sources and enable Sacramento area sources
-- Run this against your PRODUCTION database (not development)

-- Step 1: Disable non-Sacramento test sources
UPDATE sources 
SET enabled = 0 
WHERE name IN (
  'Austin, TX - Building Permits',
  'San Francisco, CA - Building Permits', 
  'Boston, MA - Building Permits',
  'Seattle, WA - Building Permits'
);

-- Step 2: Check if Sacramento sources exist, if not create them
-- Note: This assumes your production might not have these sources yet

-- Sacramento County ArcGIS (MAIN SOURCE - 127k+ permits available)
INSERT INTO sources (name, platform, endpoint_url, config, enabled, max_rows_per_run, max_runtime_minutes)
VALUES (
  'Sacramento County - All Building Permits (ArcGIS)',
  'arcgis',
  'https://services5.arcgis.com/54falWtcpty3V47Z/arcgis/rest/services/Building_Permit_Data_pub/FeatureServer/0',
  '{"where_clause": "1=1"}'::jsonb,
  1,  -- enabled
  50000,  -- 50k batch size
  60
)
ON CONFLICT DO NOTHING;

-- Placer County ArcGIS
INSERT INTO sources (name, platform, endpoint_url, config, enabled, max_rows_per_run, max_runtime_minutes)
VALUES (
  'Placer County, CA - Active Building Permits (ArcGIS)',
  'arcgis',
  'https://services1.arcgis.com/gqsWuDm3XrqZRdD1/arcgis/rest/services/BuildingPermits/FeatureServer/1',
  '{"where_clause": "PermitStatus = ''Active''"}'::jsonb,
  1,  -- enabled
  50000,
  60
)
ON CONFLICT DO NOTHING;

-- Verify the changes
SELECT id, name, platform, enabled, max_rows_per_run 
FROM sources 
ORDER BY id;
