# ==============================================================================
# Multi-Stage Dockerfile for ContinuityBridge Customer Deployments
# Optimized for single-tenant, on-premise installations
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Dependencies
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build client (Vite) and server (esbuild)
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Install production dependencies only
RUN apk add --no-cache \
    dumb-init \
    postgresql-client \
    curl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Copy necessary runtime files
COPY server ./server
COPY shared ./shared
COPY scripts/run-sql-migration.js ./scripts/
COPY drizzle.config.ts ./

# Create data directories for persistence
RUN mkdir -p /app/data/licenses \
    /app/data/plugins \
    /app/data/update-packages \
    /app/data/logs \
    /app/keys

# Set proper permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["npm", "start"]
