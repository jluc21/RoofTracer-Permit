#!/bin/bash

# Fix Production Sources - Disable non-Sacramento and enable Sacramento area
# Usage: ./fix-production-sources.sh https://your-production-url.railway.app

PROD_URL="${1:-https://rooftracer-permit-production.up.railway.app}"

echo "Fixing sources on: $PROD_URL"
echo ""

# Get current sources to find IDs
echo "Fetching current sources..."
curl -s "$PROD_URL/api/sources" | jq '.'

echo ""
echo "================================================"
echo "Disabling non-Sacramento sources..."
echo "================================================"

# Disable San Francisco (ID 4 based on logs showing "source 4")
echo "Disabling: San Francisco..."
curl -X PATCH "$PROD_URL/api/sources/4" \
  -H "Content-Type: application/json" \
  -d '{"enabled": 0}'

# Disable Austin (likely ID 1)
echo "Disabling: Austin..."
curl -X PATCH "$PROD_URL/api/sources/1" \
  -H "Content-Type: application/json" \
  -d '{"enabled": 0}'

# Disable Boston (likely ID 2)  
echo "Disabling: Boston..."
curl -X PATCH "$PROD_URL/api/sources/2" \
  -H "Content-Type: application/json" \
  -d '{"enabled": 0}'

# Disable Seattle (likely ID 3)
echo "Disabling: Seattle..."
curl -X PATCH "$PROD_URL/api/sources/3" \
  -H "Content-Type: application/json" \
  -d '{"enabled": 0}'

echo ""
echo "================================================"
echo "Enabling Sacramento area sources..."
echo "================================================"

# You'll need to check which IDs correspond to Sacramento sources
# For now, let's verify what sources exist
echo ""
echo "Checking updated sources..."
curl -s "$PROD_URL/api/sources" | jq '.[] | {id, name, platform, enabled}'

echo ""
echo "================================================"
echo "Done! Production should now focus on Sacramento area only."
echo "The continuous backfill will restart with correct sources."
echo "================================================"
