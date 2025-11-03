#!/bin/bash
# Railway build script - builds both frontend and backend

set -e  # Exit on any error

echo "======================================"
echo "RoofTracer Build Process"
echo "======================================"

# Clear any existing build artifacts and caches
echo "Cleaning previous builds and caches..."
rm -rf dist node_modules/.vite .vite

# Build frontend with Vite (force fresh build)
echo ""
echo "Building frontend with Vite..."
npx vite build

# Verify frontend build output
if [ ! -d "dist/public" ]; then
  echo "ERROR: Frontend build failed - dist/public directory not found!"
  exit 1
fi

echo "✓ Frontend build successful ($(du -sh dist/public | cut -f1))"

# Build backend with esbuild
echo ""
echo "Building backend with esbuild..."
npm run build

# Verify backend build output
if [ ! -f "dist/index.js" ]; then
  echo "ERROR: Backend build failed - dist/index.js not found!"
  exit 1
fi

echo "✓ Backend build successful ($(du -sh dist/index.js | cut -f1))"

echo ""
echo "======================================"
echo "Build complete! ✓"
echo "======================================"
