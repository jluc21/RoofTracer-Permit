#!/bin/bash
# Railway build script - builds both frontend and backend

# Build frontend with Vite
echo "Building frontend..."
npx vite build

# Build backend with esbuild
echo "Building backend..."
npm run build

echo "Build complete!"
