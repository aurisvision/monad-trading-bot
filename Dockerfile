# Multi-stage Dockerfile for Area51 Bot Production Deployment
# Optimized for PostgreSQL 17 and Coolify deployment

# Stage 1: Builder
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql17-client \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production
FROM node:18-alpine AS production

# Install runtime dependencies including PostgreSQL 17 client
RUN apk add --no-cache \
    postgresql17-client \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S area51bot -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=area51bot:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=area51bot:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/backups /app/temp && \
    chown -R area51bot:nodejs /app/logs /app/backups /app/temp

# Set environment variables
ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3000
ENV HEALTH_CHECK_PORT=3001

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Switch to non-root user
USER area51bot

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "src/index-modular-simple.js"]
