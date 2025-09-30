#!/bin/bash

# 🚀 Area51 Bot - Safe Production Deployment Script
# This script handles the complete deployment process with safety checks

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
LOG_FILE="./logs/deployment_$(date +%Y%m%d_%H%M%S).log"
HEALTH_CHECK_URL="http://localhost:3000/health"
MAX_WAIT_TIME=300  # 5 minutes
CHECK_INTERVAL=10  # 10 seconds

# Create necessary directories
mkdir -p logs backups

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "🔍 Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        error "Node.js version must be >= 16.x (current: $(node --version))"
        exit 1
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        error "PM2 is not installed. Install with: npm install -g pm2"
        exit 1
    fi
    
    # Check environment variables
    if [ -z "$BOT_TOKEN" ]; then
        error "BOT_TOKEN environment variable is not set"
        exit 1
    fi
    
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL environment variable is not set"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Create backup
create_backup() {
    log "💾 Creating backup..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup database
    if [ -n "$DATABASE_URL" ]; then
        log "Backing up database..."
        pg_dump "$DATABASE_URL" > "$BACKUP_DIR/database.sql" || {
            error "Database backup failed"
            exit 1
        }
    fi
    
    # Backup Redis if available
    if command -v redis-cli &> /dev/null; then
        log "Backing up Redis..."
        redis-cli BGSAVE
        sleep 5
        cp /var/lib/redis/dump.rdb "$BACKUP_DIR/redis.rdb" 2>/dev/null || warning "Redis backup failed (non-critical)"
    fi
    
    # Backup current code
    log "Backing up current code..."
    tar -czf "$BACKUP_DIR/code.tar.gz" --exclude=node_modules --exclude=logs --exclude=backups . || {
        error "Code backup failed"
        exit 1
    }
    
    success "Backup created at $BACKUP_DIR"
}

# Stop current bot
stop_current_bot() {
    log "🛑 Stopping current bot..."
    
    # Try graceful shutdown first
    pm2 stop area51-bot-modular 2>/dev/null || true
    pm2 stop area51-bot-legacy 2>/dev/null || true
    
    # Wait for graceful shutdown
    sleep 10
    
    # Force kill if still running
    pkill -f "node.*index" 2>/dev/null || true
    
    success "Current bot stopped"
}

# Install dependencies
install_dependencies() {
    log "📦 Installing dependencies..."
    
    npm ci --production || {
        error "Dependency installation failed"
        exit 1
    }
    
    # Security audit
    npm audit --audit-level=high || {
        warning "Security vulnerabilities found, but continuing..."
    }
    
    success "Dependencies installed"
}

# Run tests
run_tests() {
    log "🧪 Running tests..."
    
    # Run modular functionality test
    node test-modular-functionality.js || {
        error "Modular functionality tests failed"
        exit 1
    }
    
    # Run comprehensive functionality test
    node comprehensive-functionality-test.js || {
        error "Comprehensive functionality tests failed"
        exit 1
    }
    
    success "All tests passed"
}

# Start new bot
start_new_bot() {
    log "🚀 Starting new modular bot..."
    
    # Start with PM2
    pm2 start ecosystem.config.js --env production || {
        error "Failed to start new bot"
        exit 1
    }
    
    success "New bot started"
}

# Health check
health_check() {
    log "🏥 Performing health check..."
    
    local wait_time=0
    while [ $wait_time -lt $MAX_WAIT_TIME ]; do
        if curl -f -s "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            success "Health check passed"
            return 0
        fi
        
        log "Waiting for bot to be ready... ($wait_time/$MAX_WAIT_TIME seconds)"
        sleep $CHECK_INTERVAL
        wait_time=$((wait_time + CHECK_INTERVAL))
    done
    
    error "Health check failed after $MAX_WAIT_TIME seconds"
    return 1
}

# Monitor deployment
monitor_deployment() {
    log "📊 Monitoring deployment for 5 minutes..."
    
    local monitor_time=0
    local max_monitor_time=300  # 5 minutes
    
    while [ $monitor_time -lt $max_monitor_time ]; do
        # Check if bot is still running
        if ! pm2 list | grep -q "area51-bot-modular.*online"; then
            error "Bot stopped unexpectedly"
            return 1
        fi
        
        # Check health endpoint
        if ! curl -f -s "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            error "Health check failed during monitoring"
            return 1
        fi
        
        # Check memory usage
        local memory_usage=$(pm2 show area51-bot-modular | grep "memory usage" | awk '{print $4}' | sed 's/M//')
        if [ -n "$memory_usage" ] && [ "$memory_usage" -gt 512 ]; then
            warning "High memory usage: ${memory_usage}MB"
        fi
        
        log "Monitoring... ($monitor_time/$max_monitor_time seconds) - Memory: ${memory_usage:-N/A}MB"
        sleep 30
        monitor_time=$((monitor_time + 30))
    done
    
    success "Monitoring completed successfully"
    return 0
}

# Rollback function
rollback() {
    error "🔄 Initiating rollback..."
    
    # Stop new bot
    pm2 stop area51-bot-modular 2>/dev/null || true
    
    # Restore database
    if [ -f "$BACKUP_DIR/database.sql" ]; then
        log "Restoring database..."
        psql "$DATABASE_URL" < "$BACKUP_DIR/database.sql" || warning "Database restore failed"
    fi
    
    # Restore Redis
    if [ -f "$BACKUP_DIR/redis.rdb" ]; then
        log "Restoring Redis..."
        redis-cli FLUSHALL 2>/dev/null || true
        cp "$BACKUP_DIR/redis.rdb" /var/lib/redis/dump.rdb 2>/dev/null || warning "Redis restore failed"
        redis-cli DEBUG RESTART 2>/dev/null || true
    fi
    
    # Start legacy bot
    log "Starting legacy bot..."
    pm2 start area51-bot-legacy --env production || {
        error "Failed to start legacy bot"
        exit 1
    }
    
    error "Rollback completed. Legacy bot is running."
    exit 1
}

# Main deployment function
deploy() {
    log "🚀 Starting Area51 Bot Production Deployment"
    log "Deployment ID: $(date +%Y%m%d_%H%M%S)"
    
    # Pre-deployment checks
    check_prerequisites
    create_backup
    
    # Deployment process
    stop_current_bot
    install_dependencies
    run_tests
    start_new_bot
    
    # Post-deployment verification
    if ! health_check; then
        rollback
    fi
    
    if ! monitor_deployment; then
        rollback
    fi
    
    success "🎉 Deployment completed successfully!"
    log "Bot is running in production mode"
    log "Health check: $HEALTH_CHECK_URL"
    log "Logs: pm2 logs area51-bot-modular"
    log "Status: pm2 status"
}

# Trap errors and rollback
trap rollback ERR

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "rollback")
        rollback
        ;;
    "health")
        health_check
        ;;
    "monitor")
        monitor_deployment
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|monitor}"
        exit 1
        ;;
esac