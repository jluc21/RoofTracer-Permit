# Use official Playwright image with Node.js 20 and all browser dependencies
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including Playwright)
# Use --no-cache to ensure fresh installs without cached modules
RUN npm ci --no-cache

# Copy source code
COPY . .

# Clear any build artifacts that might have been copied
# This ensures we always build fresh on Railway
RUN rm -rf dist node_modules/.vite .vite

# Make build script executable and run it
# The build script will verify both frontend and backend build successfully
RUN chmod +x build.sh && ./build.sh

# Verify critical files exist after build
RUN ls -lh dist/public/index.html dist/index.js || \
    (echo "ERROR: Build verification failed!" && exit 1)

# Expose port
EXPOSE 8080

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Start the application
CMD ["node", "dist/index.js"]
