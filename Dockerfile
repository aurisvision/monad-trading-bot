# Optimized Dockerfile for Area51 Bot - Coolify Deployment
# Single-stage build for faster deployment

FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    tini \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S area51bot -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=area51bot:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/backups /app/temp && \
    chown -R area51bot:nodejs /app/logs /app/backups /app/temp

# Set environment variables
ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3000
ENV HEALTH_CHECK_PORT=3000

# Expose ports (Coolify will map these to external ports)
EXPOSE 3000

# Health check - works with both HTTP (local) and HTTPS (Coolify)
# Uses internal port for health check since it's within the container
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

# Switch to non-root user
USER area51bot

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["npm", "start"]
