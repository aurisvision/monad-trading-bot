# 🚀 Production Deployment Guide - Area51 Modular Bot

## 📋 Pre-Deployment Checklist

### ✅ Prerequisites
- [ ] All tests passing (100% success rate)
- [ ] Database backup completed
- [ ] Redis cache backup completed
- [ ] Environment variables configured
- [ ] Monitoring systems ready
- [ ] Rollback plan prepared
- [ ] Team notification sent

### ✅ Environment Verification
```bash
# Verify Node.js version
node --version  # Should be >= 16.x

# Verify dependencies
npm audit --audit-level=high

# Check environment variables
echo $NODE_ENV
echo $DATABASE_URL
echo $REDIS_URL
```

## 🔄 Migration Strategy

### Phase 1: Preparation (5 minutes)
1. **Stop current bot gracefully**
   ```bash
   # Send SIGTERM for graceful shutdown
   pkill -TERM -f "node.*index"
   
   # Wait for graceful shutdown (max 30 seconds)
   sleep 30
   
   # Force kill if still running
   pkill -KILL -f "node.*index"
   ```

2. **Backup current state**
   ```bash
   # Database backup
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
   
   # Redis backup
   redis-cli BGSAVE
   cp /var/lib/redis/dump.rdb backup_redis_$(date +%Y%m%d_%H%M%S).rdb
   ```

3. **Deploy new code**
   ```bash
   git pull origin main
   npm install --production
   ```

### Phase 2: Migration Testing (10 minutes)
1. **Start in test mode**
   ```bash
   NODE_ENV=production npm run start:modular
   ```

2. **Verify health endpoints**
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/metrics
   ```

3. **Test with limited users**
   - Enable migration for test users only
   - Monitor error rates
   - Verify functionality

### Phase 3: Gradual Rollout (30 minutes)
1. **5% rollout**
   ```javascript
   // Enable phase2 in migration config
   const migrationConfig = new MigrationConfig();
   migrationConfig.enablePhase('phase2');
   ```

2. **Monitor metrics**
   - Error rate < 5%
   - Response time < 2s
   - Memory usage stable

3. **25% rollout** (if 5% successful)
   ```javascript
   migrationConfig.enablePhase('phase3');
   ```

4. **75% rollout** (if 25% successful)
   ```javascript
   migrationConfig.enablePhase('phase4');
   ```

5. **100% rollout** (if 75% successful)
   ```javascript
   migrationConfig.enablePhase('phase5');
   ```

## 🚨 Emergency Procedures

### Immediate Rollback
```bash
# Stop new bot
pkill -TERM -f "node.*index-modular"

# Restore database
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql

# Restore Redis
redis-cli FLUSHALL
redis-cli --rdb backup_redis_YYYYMMDD_HHMMSS.rdb

# Start old bot
NODE_ENV=production npm start
```

### Partial Rollback
```javascript
// Disable specific handlers
const migrationConfig = new MigrationConfig();
migrationConfig.disableHandler('trading');
migrationConfig.disableHandler('wallet');

// Or rollback to previous phase
migrationConfig.disablePhase('phase4');
migrationConfig.enablePhase('phase3');
```

## 📊 Monitoring Checklist

### Key Metrics to Watch
- **Error Rate**: < 5%
- **Response Time**: < 2 seconds
- **Memory Usage**: < 512MB
- **CPU Usage**: < 80%
- **Active Users**: Stable
- **Transaction Success Rate**: > 95%

### Health Endpoints
```bash
# Basic health check
curl http://localhost:3000/health

# Detailed metrics
curl http://localhost:3000/metrics

# Migration status
curl http://localhost:3000/migration/status
```

### Log Monitoring
```bash
# Monitor application logs
tail -f logs/app.log | grep ERROR

# Monitor migration logs
tail -f logs/migration.log

# Monitor system resources
htop
```

## 🔧 Configuration Management

### Environment Variables
```bash
# Production settings
export NODE_ENV=production
export LOG_LEVEL=info
export MIGRATION_ENABLED=true
export MIGRATION_TEST_MODE=false

# Database settings
export DATABASE_URL="postgresql://..."
export REDIS_URL="redis://..."

# Bot settings
export BOT_TOKEN="your_bot_token"
export WEBHOOK_URL="https://your-domain.com/webhook"
```

### Migration Configuration
```javascript
// Enable gradual migration
const config = {
    enabled: true,
    testMode: false,
    rollbackOnError: true,
    maxErrorRate: 0.05,
    phases: {
        phase2: { enabled: true, percentage: 5 },
        phase3: { enabled: false, percentage: 25 },
        phase4: { enabled: false, percentage: 75 },
        phase5: { enabled: false, percentage: 100 }
    }
};
```

## 🛡️ Safety Measures

### Automated Safeguards
- **Error rate monitoring**: Auto-rollback if error rate > 5%
- **Memory monitoring**: Alert if memory > 512MB
- **Response time monitoring**: Alert if response > 2s
- **Database connection monitoring**: Auto-reconnect on failure

### Manual Verification Points
1. **After 5% rollout**: Verify core functionality
2. **After 25% rollout**: Check trading operations
3. **After 75% rollout**: Validate all features
4. **After 100% rollout**: Full system verification

## 📝 Deployment Commands

### Start Modular Bot
```bash
# Development
npm run dev:modular

# Production
npm run start:modular

# With PM2 (recommended)
pm2 start ecosystem.config.js --env production
```

### Migration Commands
```bash
# Check migration status
node -e "
const MigrationConfig = require('./src/config/MigrationConfig');
const config = new MigrationConfig();
console.log(config.getStats());
"

# Enable next phase
node -e "
const MigrationConfig = require('./src/config/MigrationConfig');
const config = new MigrationConfig();
config.enablePhase('phase2');
console.log('Phase 2 enabled');
"

# Emergency rollback
node -e "
const MigrationConfig = require('./src/config/MigrationConfig');
const config = new MigrationConfig();
config.resetToDefaults();
console.log('Migration reset to defaults');
"
```

## 🔍 Post-Deployment Verification

### Functional Tests
```bash
# Run comprehensive tests
node comprehensive-functionality-test.js

# Test specific functionality
node test-trading-functionality.js
node test-wallet-functionality.js
```

### Performance Tests
```bash
# Load test
npm run test:load

# Memory leak test
npm run test:memory

# Stress test
npm run test:stress
```

## 📞 Support Contacts

### Emergency Contacts
- **Primary**: Development Team Lead
- **Secondary**: DevOps Engineer
- **Escalation**: Technical Director

### Communication Channels
- **Slack**: #area51-alerts
- **Email**: alerts@area51.com
- **Phone**: Emergency hotline

## 📚 Additional Resources

- [Modular Architecture Documentation](./MODULAR_ARCHITECTURE.md)
- [Migration System Guide](./MIGRATION_GUIDE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Performance Optimization](./PERFORMANCE.md)

---

## ⚠️ Important Notes

1. **Never deploy directly to 100%** - Always use gradual rollout
2. **Monitor continuously** during migration
3. **Keep rollback plan ready** at all times
4. **Test thoroughly** in staging environment first
5. **Communicate with team** throughout the process

## 🎯 Success Criteria

✅ **Deployment is successful when:**
- All health checks pass
- Error rate < 1%
- All core functionality working
- Performance metrics stable
- No user complaints
- Migration completed without rollbacks

---

*Last updated: $(date)*
*Version: 1.0*