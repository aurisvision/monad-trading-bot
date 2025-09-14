# Redis Implementation Prompt for Area51 Telegram Trading Bot - FINAL VERSION

## Project Overview
You are tasked with implementing a robust, high-performance Redis caching system for the Area51 Telegram trading bot. This system must handle high-frequency trading operations with zero data inconsistency and maximum performance optimization.

**CRITICAL**: This bot serves users making split-second financial decisions. Any performance improvement directly impacts user satisfaction and trading success.

## Core Requirements

### 1. Cache Architecture Design

#### Primary Cache Keys Structure:
```javascript
// User Data (Static - NO TTL)
user:${telegramId}              // User basic info, wallet_address, created_at

// Financial Data (Dynamic - Short TTL)
wallet_balance:${walletAddress} // MON balance - 30s TTL
portfolio:${telegramId}         // Token holdings - 30min TTL (FORCE REFRESH on transactions)
main_menu:${telegramId}         // Main interface data - 1min TTL

// Settings & State (Medium TTL)
user_settings:${telegramId}     // User preferences - 6h TTL
user_state:${telegramId}        // Interaction state - 10min TTL

// Shared Data (Global)
token_info:${tokenAddress}      // Token metadata - 5min TTL
mon_price_usd                   // MON price in USD - 2min TTL
temp_sell_data:${telegramId}:${sellId} // Temporary sell data - 10min TTL
```

#### TTL Strategy Implementation:
```javascript
const TTL_CONFIG = {
    // User data - NO TTL (persistent until manual deletion)
    USER_DATA: null,                // No expiration - only deleted manually
    
    // Financial data - Short TTL with FORCE REFRESH on transactions
    WALLET_BALANCE: 30,             // 30 seconds
    PORTFOLIO: 1800,                // 30 minutes (but FORCE REFRESH on all transactions)
    MAIN_MENU: 60,                  // 1 minute
    
    // Settings & state
    USER_SETTINGS: 21600,           // 6 hours
    USER_STATE: 600,                // 10 minutes
    
    // Shared data
    TOKEN_INFO: 300,                // 5 minutes
    MON_PRICE: 120,                 // 2 minutes
    TEMP_SELL_DATA: 600             // 10 minutes
};

// Cache setting with proper TTL handling
async function setCacheWithTTL(key, data, ttl) {
    if (ttl === null) {
        // No TTL - set without expiration (for user data)
        await redis.set(key, JSON.stringify(data));
    } else {
        // Set with TTL
        await redis.setex(key, ttl, JSON.stringify(data));
    }
}

// CRITICAL: Portfolio MUST be force refreshed on ALL transactions
// Even though TTL is 30 minutes, portfolio cache is DELETED immediately after:
// - Buy transactions (regular & auto)
// - Sell transactions  
// - Transfer operations
// - Manual refresh requests
```

### 2. Critical Cache Invalidation Rules - IMMEDIATE IMPLEMENTATION REQUIRED

#### **Buy Transaction (Regular & Auto Buy):**
```javascript
// MUST delete these keys IMMEDIATELY after successful buy:
async function invalidateBuyCache(telegramId, walletAddress) {
    const pipeline = redis.pipeline();
    pipeline.del(`wallet_balance:${walletAddress}`);
    pipeline.del(`portfolio:${telegramId}`); // FORCE REFRESH portfolio
    pipeline.del(`main_menu:${telegramId}`);
    pipeline.del(`user_state:${telegramId}`);
    await pipeline.exec();
}
```

#### **Sell Transaction:**
```javascript
// MUST delete these keys IMMEDIATELY after successful sell:
async function invalidateSellCache(telegramId, walletAddress, sellId = null) {
    const pipeline = redis.pipeline();
    pipeline.del(`wallet_balance:${walletAddress}`);
    pipeline.del(`portfolio:${telegramId}`); // FORCE REFRESH portfolio
    pipeline.del(`main_menu:${telegramId}`);
    pipeline.del(`user_state:${telegramId}`);
    if (sellId) {
        pipeline.del(`temp_sell_data:${telegramId}:${sellId}`);
    }
    await pipeline.exec();
}
```

#### **Transfer Operation:**
```javascript
// For sender and receiver:
async function invalidateTransferCache(senderTelegramId, senderWallet, receiverTelegramId = null, receiverWallet = null) {
    const pipeline = redis.pipeline();
    
    // Sender cache invalidation
    pipeline.del(`wallet_balance:${senderWallet}`);
    pipeline.del(`portfolio:${senderTelegramId}`); // FORCE REFRESH portfolio
    pipeline.del(`main_menu:${senderTelegramId}`);
    
    // Receiver cache invalidation (if bot user)
    if (receiverTelegramId && receiverWallet) {
        pipeline.del(`wallet_balance:${receiverWallet}`);
        pipeline.del(`main_menu:${receiverTelegramId}`);
    }
    
    await pipeline.exec();
}
```

#### **Manual Refresh (User-triggered) - NEW REQUIREMENT:**
```javascript
// Add refresh button to main menu and implement handler:
async function handleManualRefresh(telegramId, walletAddress) {
    const pipeline = redis.pipeline();
    pipeline.del(`wallet_balance:${walletAddress}`);
    pipeline.del(`portfolio:${telegramId}`); // FORCE REFRESH portfolio
    pipeline.del(`main_menu:${telegramId}`);
    pipeline.del(`mon_price_usd`);  // Force fresh price fetch
    await pipeline.exec();
    
    // Show success message
    await ctx.reply('🔄 Data refreshed successfully!');
}
```

#### **Settings Changes:**
```javascript
// Cache keys to delete when settings change:
async function invalidateSettingsCache(telegramId) {
    const pipeline = redis.pipeline();
    pipeline.del(`user_settings:${telegramId}`);
    pipeline.del(`main_menu:${telegramId}`);  // Menu displays current settings
    await pipeline.exec();
}
```

#### **Wallet Deletion - COMPLETE CLEANUP:**
```javascript
// Complete user data cleanup when wallet is deleted:
async function invalidateWalletDeletionCache(telegramId, walletAddress) {
    const pipeline = redis.pipeline();
    pipeline.del(`user:${telegramId}`);
    pipeline.del(`user_settings:${telegramId}`);
    pipeline.del(`wallet_balance:${walletAddress}`);
    pipeline.del(`portfolio:${telegramId}`);
    pipeline.del(`main_menu:${telegramId}`);
    pipeline.del(`user_state:${telegramId}`);
    
    // Pattern-based cleanup for temp data
    const tempKeys = await redis.keys(`temp_sell_data:${telegramId}:*`);
    if (tempKeys.length > 0) {
        tempKeys.forEach(key => pipeline.del(key));
    }
    
    await pipeline.exec();
}
```

### 3. Performance Optimization Requirements

#### Pipeline Operations (MANDATORY):
```javascript
// NEVER do this (slow):
await redis.del(key1);
await redis.del(key2);
await redis.del(key3);

// ALWAYS do this (3x faster):
const pipeline = redis.pipeline();
pipeline.del(key1);
pipeline.del(key2);
pipeline.del(key3);
await pipeline.exec();
```

#### Cache-First Strategy with Proper TTL:
```javascript
// Standard implementation pattern:
async function getCachedData(key, fetchFunction, ttl) {
    try {
        // 1. Check Redis first
        const cached = await redis.get(key);
        if (cached) return JSON.parse(cached);
        
        // 2. Fetch from source
        const fresh = await fetchFunction();
        
        // 3. Cache with proper TTL
        await setCacheWithTTL(key, fresh, ttl);
        
        // 4. Return data
        return fresh;
    } catch (redisError) {
        // Graceful fallback - continue without cache
        console.error('Redis error:', redisError);
        return await fetchFunction();
    }
}
```

#### Background Refresh for Active Users:
```javascript
// Implement background refresh service:
setInterval(async () => {
    const activeUsers = await getActiveUsers(); // Users active in last 5 minutes
    
    for (const user of activeUsers) {
        try {
            // Pre-load critical data
            await getCachedData(`wallet_balance:${user.wallet_address}`, 
                () => monorailAPI.getMONBalance(user.wallet_address), 
                TTL_CONFIG.WALLET_BALANCE);
                
            await getCachedData(`portfolio:${user.telegram_id}`, 
                () => portfolioService.getPortfolio(user.telegram_id), 
                TTL_CONFIG.PORTFOLIO);
        } catch (error) {
            console.error('Background refresh failed for user:', user.telegram_id, error);
        }
    }
}, 25000); // Every 25 seconds

// Global price refresh
setInterval(async () => {
    await getCachedData('mon_price_usd', 
        () => monorailAPI.getMONPriceUSD(), 
        TTL_CONFIG.MON_PRICE);
}, 90000); // Every 90 seconds
```

### 4. Error Handling & Fallback Strategy

#### Redis Connection Failure:
```javascript
// Comprehensive fallback implementation:
class RedisFallbackManager {
    constructor() {
        this.redisAvailable = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }
    
    async handleRedisError(error) {
        console.error('Redis error:', error);
        this.redisAvailable = false;
        
        // Alert developer if failure persists
        if (this.reconnectAttempts > 5) {
            await this.alertDeveloper('Redis failure persists > 5 minutes');
        }
        
        // Attempt reconnection
        this.scheduleReconnect();
    }
    
    scheduleReconnect() {
        setTimeout(async () => {
            try {
                await redis.ping();
                this.redisAvailable = true;
                this.reconnectAttempts = 0;
                console.log('Redis reconnected successfully');
            } catch (error) {
                this.reconnectAttempts++;
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.scheduleReconnect();
                }
            }
        }, 30000); // Every 30 seconds
    }
}
```

#### Database Failure with Redis Available:
```javascript
// Cache-only fallback strategy:
async function handleDatabaseFailure(cacheKey, errorMessage) {
    try {
        // Return cached data even if expired
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            console.warn('Using expired cache due to DB failure:', cacheKey);
            return {
                data: JSON.parse(cachedData),
                warning: 'Data may be outdated - database temporarily unavailable'
            };
        }
    } catch (cacheError) {
        console.error('Both Redis and DB failed:', cacheError);
    }
    
    throw new Error('Service temporarily unavailable');
}
```

### 5. Implementation Specifications

#### Redis Configuration:
```javascript
const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
    keyPrefix: 'area51:',
    db: 0,
    // Memory management
    maxMemoryPolicy: 'allkeys-lru',
    // Connection pool
    connectTimeout: 5000,
    commandTimeout: 5000,
    retryDelayOnClusterDown: 300,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
};
```

#### Memory Management:
```javascript
// Redis memory configuration:
// maxmemory-policy: allkeys-lru
// maxmemory: 2gb  (adjust based on server capacity)

// Cleanup routine
setInterval(async () => {
    const info = await redis.info('memory');
    const usedMemory = parseInt(info.match(/used_memory:(\d+)/)[1]);
    const maxMemory = parseInt(info.match(/maxmemory:(\d+)/)[1]);
    
    if (usedMemory / maxMemory > 0.8) {
        console.warn('Redis memory usage high:', (usedMemory / maxMemory * 100).toFixed(2) + '%');
        // Trigger cleanup if needed
    }
}, 300000); // Every 5 minutes
```

### 6. Monitoring & Performance Metrics

#### Required Metrics Implementation:
```javascript
class RedisMetrics {
    constructor() {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            totalOperations: 0,
            errorCount: 0,
            responseTimeSum: 0,
            responseTimeCount: 0
        };
    }
    
    recordCacheHit() {
        this.metrics.cacheHits++;
        this.metrics.totalOperations++;
    }
    
    recordCacheMiss() {
        this.metrics.cacheMisses++;
        this.metrics.totalOperations++;
    }
    
    recordResponseTime(ms) {
        this.metrics.responseTimeSum += ms;
        this.metrics.responseTimeCount++;
    }
    
    getCacheHitRatio() {
        return this.metrics.totalOperations > 0 
            ? (this.metrics.cacheHits / this.metrics.totalOperations * 100).toFixed(2)
            : 0;
    }
    
    getAverageResponseTime() {
        return this.metrics.responseTimeCount > 0
            ? (this.metrics.responseTimeSum / this.metrics.responseTimeCount).toFixed(2)
            : 0;
    }
    
    // Alert if performance degrades
    checkPerformance() {
        const hitRatio = this.getCacheHitRatio();
        const avgResponseTime = this.getAverageResponseTime();
        
        if (hitRatio < 80) {
            console.warn(`Cache hit ratio low: ${hitRatio}%`);
        }
        
        if (avgResponseTime > 100) {
            console.warn(`Response time high: ${avgResponseTime}ms`);
        }
    }
}
```

#### Alerting System:
```javascript
// Performance monitoring and alerts
setInterval(async () => {
    const metrics = redisMetrics.getMetrics();
    
    // Check thresholds
    if (metrics.cacheHitRatio < 80) {
        await alertDeveloper(`Cache hit ratio dropped to ${metrics.cacheHitRatio}%`);
    }
    
    if (metrics.averageResponseTime > 100) {
        await alertDeveloper(`Response time increased to ${metrics.averageResponseTime}ms`);
    }
    
    // Log metrics
    console.log('Redis Performance:', {
        cacheHitRatio: metrics.cacheHitRatio + '%',
        averageResponseTime: metrics.averageResponseTime + 'ms',
        totalOperations: metrics.totalOperations,
        errorCount: metrics.errorCount
    });
}, 60000); // Every minute
```

### 7. Testing & Validation Requirements

#### Load Testing Scenarios:
```javascript
// Required test scenarios:
const testScenarios = [
    {
        name: 'Concurrent Buy Operations',
        users: 100,
        operations: 'simultaneous buy transactions',
        expectedResponseTime: '<500ms'
    },
    {
        name: 'Portfolio Refresh Load',
        requests: 1000,
        operation: 'portfolio refresh per minute',
        expectedResponseTime: '<50ms'
    },
    {
        name: 'Auto-Buy Triggers',
        triggers: 500,
        operation: 'simultaneous auto-buy triggers',
        expectedResponseTime: '<100ms'
    },
    {
        name: 'Redis Failover',
        scenario: 'Redis failure during peak trading',
        expectedBehavior: 'graceful fallback to direct DB'
    },
    {
        name: 'Database Failure',
        scenario: 'DB connection loss with Redis available',
        expectedBehavior: 'serve cached data with warnings'
    }
];
```

#### Performance Benchmarks:
```javascript
// Before/after performance targets:
const performanceTargets = {
    portfolioLoadTime: {
        current: '200-500ms',
        target: '<50ms',
        improvement: '90%+'
    },
    mainMenuResponse: {
        current: '300ms',
        target: '<30ms',
        improvement: '90%+'
    },
    buyTransactionFlow: {
        current: '1-2s',
        target: '<500ms',
        improvement: '75%+'
    },
    autoBuyTriggerSpeed: {
        current: '500ms+',
        target: '<100ms',
        improvement: '80%+'
    }
};
```

### 8. Deployment & Migration Strategy

#### Zero-Downtime Implementation Plan:
```javascript
// Phase 1: Setup (Day 1)
// - Install Redis server
// - Configure connection with fallback
// - Deploy cache-aside pattern for reads only

// Phase 2: Cache Invalidation (Day 2-3)
// - Implement all cache invalidation handlers
// - Test with small user group
// - Monitor performance metrics

// Phase 3: Optimization (Day 4-5)
// - Enable pipeline operations
// - Implement background refresh
// - Full performance testing

// Phase 4: Production (Day 6-7)
// - Gradual rollout to all users
// - 24/7 monitoring
// - Performance validation
```

#### Rollback Plan:
```javascript
// Emergency rollback procedure:
const rollbackPlan = {
    step1: 'Disable cache writes (keep reads for non-critical data)',
    step2: 'Revert to direct DB operations for all critical paths',
    step3: 'Monitor system stability for 30 minutes',
    step4: 'If stable, investigate issues in staging',
    step5: 'Fix issues and redeploy with additional testing'
};
```

### 9. Critical Success Factors

#### Zero Data Loss Guarantee:
- All cache invalidation MUST be synchronous with database operations
- Failed cache operations MUST NOT prevent database updates
- Transaction logs MUST be maintained for audit purposes
- Cache invalidation failures MUST be logged and monitored

#### Performance Validation:
- All changes MUST be tested under simulated trading load
- Performance MUST improve, never degrade
- User experience MUST be noticeably faster
- Cache hit ratio MUST exceed 85%

#### Operational Excellence:
- Complete monitoring and alerting setup required
- Detailed operational procedures documentation mandatory
- 24/7 monitoring capabilities for production environment
- Team training on monitoring and maintenance procedures

### 10. Implementation Checklist

#### Phase 1 - Foundation (Critical):
- [ ] Redis server installation and configuration
- [ ] Connection pooling with proper error handling
- [ ] Basic cache-aside pattern for read operations
- [ ] Monitoring and alerting infrastructure setup

#### Phase 2 - Cache Invalidation (Critical):
- [ ] Implement immediate cache invalidation for buy operations
- [ ] Implement immediate cache invalidation for sell operations  
- [ ] Implement immediate cache invalidation for transfer operations
- [ ] **NEW**: Implement manual refresh handler with button in main menu
- [ ] Implement cache invalidation for settings changes
- [ ] Implement complete cleanup for wallet deletion

#### Phase 3 - Performance Optimization (High Priority):
- [ ] Convert all cache operations to use Pipeline
- [ ] Implement background refresh for active users
- [ ] Add pre-loading strategies for predictable data access
- [ ] Implement memory optimization and cleanup routines

#### Phase 4 - Testing & Validation (High Priority):
- [ ] Load testing with 100+ concurrent users
- [ ] Failover testing (Redis and database failures)
- [ ] Performance benchmarking and validation
- [ ] User acceptance testing for speed improvements

#### Phase 5 - Production Deployment (Medium Priority):
- [ ] Staged rollout with comprehensive monitoring
- [ ] Performance validation in production environment
- [ ] Complete documentation and operational procedures
- [ ] Team training on monitoring and maintenance

## Expected Deliverables

1. **Complete Redis Implementation**: Working cache system with all specified features
2. **Cache Invalidation System**: Immediate cache updates for ALL critical operations
3. **Performance Monitoring**: Dashboards and alerting for all KPIs
4. **Documentation**: Complete operational and maintenance procedures
5. **Testing Results**: Load testing reports and performance benchmarks
6. **Deployment Guide**: Step-by-step production deployment procedures

## Success Criteria

- **Performance**: 95% improvement in response times for cached operations
- **Reliability**: 99.9% uptime with graceful fallback capabilities
- **Data Consistency**: Zero instances of stale data after critical operations
- **Scalability**: Support for 10,000+ concurrent users
- **Monitoring**: Complete visibility into cache performance and health
- **Cache Hit Ratio**: Minimum 85% for optimal performance

## CRITICAL NOTES FOR IMPLEMENTATION

1. **MANDATORY Pipeline Usage**: All multiple cache operations MUST use Redis Pipeline
2. **IMMEDIATE Cache Invalidation**: No delays allowed after critical operations
3. **Manual Refresh Button**: MUST be added to main menu for user control
4. **Complete Wallet Deletion**: MUST clean all user-related cache keys
5. **Background Refresh**: MUST be implemented for active users
6. **Performance Monitoring**: MUST be implemented from day one
7. **Graceful Fallback**: MUST work seamlessly when Redis fails

This implementation will provide the Area51 trading bot with enterprise-grade caching capabilities, ensuring lightning-fast responses for users making split-second trading decisions while maintaining absolute data integrity and system reliability.
