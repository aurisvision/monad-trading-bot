const EventEmitter = require('events');

class CacheMonitor extends EventEmitter {
    constructor(redis, monitoring = null) {
        super();
        this.redis = redis;
        this.monitoring = monitoring;
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            apiCalls: 0,
            responseTimeSum: 0,
            startTime: Date.now()
        };
        
        this.categoryStats = new Map();
        this.userStats = new Map();
        
        // Log stats every 30 seconds
        this.statsInterval = setInterval(() => {
            this.logPerformanceStats();
        }, 30000);
    }

    // Track cache hit
    trackCacheHit(type, identifier, responseTime = 0) {
        this.stats.totalRequests++;
        this.stats.cacheHits++;
        this.stats.responseTimeSum += responseTime;
        
        console.log(`🚀 CACHE HIT: ${type}:${identifier} - ${responseTime}ms - Lightning Fast!`);
        
        // Track by type
        if (!this.categoryStats.has(type)) {
            this.categoryStats.set(type, { hits: 0, misses: 0, totalTime: 0 });
        }
        const typeStats = this.categoryStats.get(type);
        typeStats.hits++;
        typeStats.totalTime += responseTime;
        
        this.emit('cacheHit', { type, identifier, responseTime });
    }

    // Track cache miss
    trackCacheMiss(type, identifier, responseTime = 0) {
        this.stats.totalRequests++;
        this.stats.cacheMisses++;
        this.stats.responseTimeSum += responseTime;
        
        console.log(`❌ CACHE MISS: ${type}:${identifier} - ${responseTime}ms - Fetching from source...`);
        
        // Track by type
        if (!this.categoryStats.has(type)) {
            this.categoryStats.set(type, { hits: 0, misses: 0, totalTime: 0 });
        }
        const typeStats = this.categoryStats.get(type);
        typeStats.misses++;
        typeStats.totalTime += responseTime;
        
        this.emit('cacheMiss', { type, identifier, responseTime });
    }

    // Auto-track from console logs
    interceptConsoleLogs() {
        const originalLog = console.log;
        const self = this;
        
        console.log = (...args) => {
            // Call original log first to prevent recursion
            originalLog.apply(console, args);
            
            const message = args.join(' ');
            
            // Track cache hits (avoid recursion by checking if message is from trackCacheHit)
            if (message.includes('🚀 CACHE HIT:') && !message.includes('Lightning Fast!')) {
                const match = message.match(/🚀 CACHE HIT: ([^:]+):([^\s]+)/);
                if (match) {
                    const [, type, identifier] = match;
                    self.stats.totalRequests++;
                    self.stats.cacheHits++;
                    self.stats.responseTimeSum += 1;
                    
                    if (!self.categoryStats.has(type)) {
                        self.categoryStats.set(type, { hits: 0, misses: 0, totalTime: 0 });
                    }
                    const typeStats = self.categoryStats.get(type);
                    typeStats.hits++;
                    typeStats.totalTime += 1;
                }
            }
            
            // Track cache misses (avoid recursion)
            if (message.includes('❌ CACHE MISS:') && !message.includes('Fetching from source...')) {
                const match = message.match(/❌ CACHE MISS: ([^:]+):([^\s]+)/);
                if (match) {
                    const [, type, identifier] = match;
                    self.stats.totalRequests++;
                    self.stats.cacheMisses++;
                    self.stats.responseTimeSum += 50;
                    
                    if (!self.categoryStats.has(type)) {
                        self.categoryStats.set(type, { hits: 0, misses: 0, totalTime: 0 });
                    }
                    const typeStats = self.categoryStats.get(type);
                    typeStats.misses++;
                    typeStats.totalTime += 50;
                }
            }
            
            // Track category cache events
            if (message.includes('Category cache HIT for')) {
                const match = message.match(/Category cache HIT for (\w+)/);
                if (match) {
                    self.stats.totalRequests++;
                    self.stats.cacheHits++;
                    self.stats.responseTimeSum += 5;
                    
                    if (!self.categoryStats.has('category')) {
                        self.categoryStats.set('category', { hits: 0, misses: 0, totalTime: 0 });
                    }
                    const typeStats = self.categoryStats.get('category');
                    typeStats.hits++;
                    typeStats.totalTime += 5;
                }
            }
            
            if (message.includes('Category cache MISS for')) {
                const match = message.match(/Category cache MISS for (\w+)/);
                if (match) {
                    self.stats.totalRequests++;
                    self.stats.cacheMisses++;
                    self.stats.responseTimeSum += 800;
                    
                    if (!self.categoryStats.has('category')) {
                        self.categoryStats.set('category', { hits: 0, misses: 0, totalTime: 0 });
                    }
                    const typeStats = self.categoryStats.get('category');
                    typeStats.misses++;
                    typeStats.totalTime += 800;
                }
            }
        };
    }

    // Track API call
    trackApiCall(endpoint, responseTime = 0) {
        this.stats.apiCalls++;
        console.log(`🌐 API CALL: ${endpoint} - ${responseTime}ms`);
        
        this.emit('apiCall', { endpoint, responseTime });
    }

    // Get cache hit ratio
    getCacheHitRatio() {
        if (this.stats.totalRequests === 0) return 0;
        return (this.stats.cacheHits / this.stats.totalRequests * 100).toFixed(2);
    }

    // Get average response time
    getAverageResponseTime() {
        if (this.stats.totalRequests === 0) return 0;
        return (this.stats.responseTimeSum / this.stats.totalRequests).toFixed(2);
    }

    // Get performance summary
    getPerformanceSummary() {
        const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
        const hitRatio = this.getCacheHitRatio();
        const avgResponseTime = this.getAverageResponseTime();
        
        return {
            uptime: `${Math.floor(uptime / 60)}m ${uptime % 60}s`,
            totalRequests: this.stats.totalRequests,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            apiCalls: this.stats.apiCalls,
            hitRatio: `${hitRatio}%`,
            avgResponseTime: `${avgResponseTime}ms`,
            categoryBreakdown: this.getCategoryBreakdown()
        };
    }

    // Get category breakdown
    getCategoryBreakdown() {
        const breakdown = {};
        
        for (const [type, stats] of this.categoryStats.entries()) {
            const total = stats.hits + stats.misses;
            const hitRatio = total > 0 ? (stats.hits / total * 100).toFixed(1) : '0';
            const avgTime = total > 0 ? (stats.totalTime / total).toFixed(1) : '0';
            
            breakdown[type] = {
                hits: stats.hits,
                misses: stats.misses,
                total,
                hitRatio: `${hitRatio}%`,
                avgResponseTime: `${avgTime}ms`
            };
        }
        
        return breakdown;
    }

    // Log performance stats
    logPerformanceStats() {
        const summary = this.getPerformanceSummary();
        
        console.log('\n📊 ===== CACHE PERFORMANCE REPORT =====');
        console.log(`⏱️  Uptime: ${summary.uptime}`);
        console.log(`📈 Total Requests: ${summary.totalRequests}`);
        console.log(`🚀 Cache Hits: ${summary.cacheHits}`);
        console.log(`❌ Cache Misses: ${summary.cacheMisses}`);
        console.log(`🌐 API Calls: ${summary.apiCalls}`);
        console.log(`🎯 Hit Ratio: ${summary.hitRatio}`);
        console.log(`⚡ Avg Response Time: ${summary.avgResponseTime}`);
        
        console.log('\n📋 Category Breakdown:');
        for (const [type, stats] of Object.entries(summary.categoryBreakdown)) {
            console.log(`  ${type}: ${stats.hits}H/${stats.misses}M (${stats.hitRatio}) - ${stats.avgResponseTime}`);
        }
        
        // Alert if hit ratio is too low
        const hitRatio = parseFloat(summary.hitRatio);
        if (hitRatio < 50 && summary.totalRequests > 10) {
            console.log(`\n⚠️  WARNING: Cache hit ratio is low (${summary.hitRatio})`);
            console.log('   Consider increasing cache TTL or pre-warming cache');
        }
        
        console.log('=====================================\n');
    }

    // Get Redis memory usage
    async getRedisMemoryUsage() {
        try {
            const info = await this.redis.info('memory');
            const lines = info.split('\r\n');
            const memoryInfo = {};
            
            lines.forEach(line => {
                if (line.includes(':')) {
                    const [key, value] = line.split(':');
                    if (key.startsWith('used_memory')) {
                        memoryInfo[key] = value;
                    }
                }
            });
            
            return memoryInfo;
        } catch (error) {
            console.warn('Failed to get Redis memory info:', error);
            return null;
        }
    }

    // Reset stats
    resetStats() {
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            apiCalls: 0,
            responseTimeSum: 0,
            startTime: Date.now()
        };
        
        this.categoryStats.clear();
        this.userStats.clear();
        
        console.log('📊 Cache monitor stats reset');
    }

    // Cleanup
    destroy() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
        this.removeAllListeners();
    }
}

module.exports = CacheMonitor;
