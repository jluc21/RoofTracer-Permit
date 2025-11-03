# Use official Playwright image with Node.js 20 and all browser dependencies
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including Playwright)
RUN npm ci

# Copy source code
COPY . .

# Make build script executable and run it
RUN chmod +x build.sh && ./build.sh

# Expose port
EXPOSE 8080

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Start the application
CMD ["node", "dist/index.js"]
