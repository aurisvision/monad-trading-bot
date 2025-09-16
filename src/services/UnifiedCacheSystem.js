/**
 * Unified Cache System for Area51 Telegram Bot
 * Combines all cache functionalities into one high-performance system
 * Maintains speed while eliminating duplication and conflicts
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class UnifiedCacheSystem extends EventEmitter {
    constructor(redis, monitoring = null) {
        super();
        this.redis = redis;
        this.monitoring = monitoring;
        this.keyPrefix = 'area51:';
        
        // Performance-optimized TTL configurations (in seconds)
        this.ttlConfig = {
            // Critical data - No TTL (permanent until manual update)
            user: null,
            user_settings: null,
            gas_settings: null,
            user_buttons: null,
            
            // Frequently accessed data - Short TTL for freshness
            wallet_balance: 120,        // 2 minutes
            portfolio: 300,             // 5 minutes
            main_menu: 300,             // 5 minutes
            user_state: 600,            // 10 minutes
            
            // Semi-static data - Longer TTL
            token_info: 900,            // 15 minutes
            mon_price_usd: 3600,        // 1 hour
            temp_sell_data: 1200        // 20 minutes
        };
        
        // Performance metrics and statistics
        this.metrics = {
            hits: 0,
            misses: 0,
            errors: 0,
            totalRequests: 0,
            responseTimeSum: 0,
            avgResponseTime: 0,
            startTime: Date.now()
        };
        
        // Category and user statistics for monitoring
        this.categoryStats = new Map();
        this.userStats = new Map();
        this.recentErrors = [];
        
        // Health monitoring configuration
        this.healthConfig = {
            enabled: true,
            checkInterval: 30 * 60 * 1000,    // 30 minutes
            autoRecovery: true,
            maxErrors: 10,
            performanceThresholds: {
                maxResponseTime: 500,           // 500ms max for UI
                maxTradingTime: 2000,           // 2s max for trading
                minHitRatio: 0.85,              // 85% minimum hit ratio
                maxMemoryUsage: 80              // 80% max Redis memory
            }
        };
        
        // Performance analysis targets
        this.performanceTargets = {
            criticalPaths: [
                'user_settings',    // Most critical for trading speed
                'wallet_balance',   // Critical for transaction validation
                'portfolio',        // Important for UI responsiveness
                'user_state'        // Important for user experience
            ]
        };
        
        // Initialize system
        this.initialize();
    }

    // ==================== INITIALIZATION ====================
    
    async initialize() {
        try {
            // Start health monitoring
            if (this.healthConfig.enabled) {
                this.startHealthMonitoring();
            }
            
            // Start performance monitoring
            this.startPerformanceMonitoring();
            
            // Start cache warming for active users
            this.startCacheWarming();
            
            // Initialize metrics collection
            this.initializeMetricsCollection();
            
            this.monitoring?.logInfo('Unified Cache System initialized', {
                ttlConfig: this.ttlConfig,
                healthMonitoring: this.healthConfig.enabled,
                performanceTargets: this.performanceTargets
            });
            
        } catch (error) {
            this.monitoring?.logError('Failed to initialize Unified Cache System', error);
            throw error;
        }
    }

    // ==================== CORE CACHE OPERATIONS ====================
    
    /**
     * Get data from cache with intelligent fallback
     */
    async get(type, identifier, fallbackFn = null) {
        const startTime = Date.now();
        this.metrics.totalRequests++;
        
        try {
            const key = this.getKey(type, identifier);
            const cached = await this.redis.get(key);
            
            if (cached) {
                // Cache hit - update metrics and return
                this.recordCacheHit(type, identifier, startTime);
                return JSON.parse(cached);
            }
            
            // Cache miss - use fallback if provided
            this.recordCacheMiss(type, identifier, startTime);
            
            if (fallbackFn && typeof fallbackFn === 'function') {
                const data = await fallbackFn();
                if (data) {
                    await this.set(type, identifier, data);
                    return data;
                }
            }
            
            return null;
            
        } catch (error) {
            this.recordCacheError(error, 'get', { type, identifier });
            throw error;
        }
    }
    
    /**
     * Set data in cache with optimal TTL
     */
    async set(type, identifier, data, customTTL = null) {
        try {
            const key = this.getKey(type, identifier);
            const serializedData = JSON.stringify(data);
            const ttl = customTTL || this.ttlConfig[type];
            
            if (ttl) {
                await this.redis.setex(key, ttl, serializedData);
            } else {
                await this.redis.set(key, serializedData);
            }
            
            this.monitoring?.logInfo('Cache set', { 
                key, 
                type, 
                identifier, 
                ttl: ttl || 'permanent'
            });
            
            // Emit event for monitoring
            this.emit('cache_set', { type, identifier, ttl });
            
        } catch (error) {
            this.recordCacheError(error, 'set', { type, identifier });
            throw error;
        }
    }
    
    /**
     * Delete data from cache
     */
    async delete(type, identifier) {
        try {
            const key = this.getKey(type, identifier);
            const result = await this.redis.del(key);
            
            this.monitoring?.logInfo('Cache delete', { key, type, identifier, deleted: result > 0 });
            this.emit('cache_delete', { type, identifier, success: result > 0 });
            
            return result > 0;
            
        } catch (error) {
            this.recordCacheError(error, 'delete', { type, identifier });
            throw error;
        }
    }
    
    /**
     * Check if key exists in cache
     */
    async exists(type, identifier) {
        try {
            const key = this.getKey(type, identifier);
            return await this.redis.exists(key);
        } catch (error) {
            this.recordCacheError(error, 'exists', { type, identifier });
            return false;
        }
    }
    
    /**
     * Get cache key with prefix
     */
    getKey(type, identifier) {
        return `${this.keyPrefix}${type}:${identifier}`;
    }

    // ==================== BATCH OPERATIONS ====================
    
    /**
     * Batch get multiple keys for performance
     */
    async mget(requests) {
        const startTime = Date.now();
        try {
            const keys = requests.map(req => this.getKey(req.type, req.identifier));
            const values = await this.redis.mget(keys);
            
            const results = {};
            requests.forEach((req, index) => {
                const value = values[index];
                const cacheKey = `${req.type}:${req.identifier}`;
                
                if (value) {
                    results[cacheKey] = JSON.parse(value);
                    this.recordCacheHit(req.type, req.identifier, startTime);
                } else {
                    results[cacheKey] = null;
                    this.recordCacheMiss(req.type, req.identifier, startTime);
                }
            });
            
            return results;
            
        } catch (error) {
            this.recordCacheError(error, 'mget', { requests });
            throw error;
        }
    }
    
    /**
     * Batch set multiple keys using pipeline
     */
    async mset(data) {
        try {
            const pipeline = this.redis.pipeline();
            
            for (const [key, value] of Object.entries(data)) {
                const [type, identifier] = key.split(':');
                const cacheKey = this.getKey(type, identifier);
                const serializedData = JSON.stringify(value);
                const ttl = this.ttlConfig[type];
                
                if (ttl) {
                    pipeline.setex(cacheKey, ttl, serializedData);
                } else {
                    pipeline.set(cacheKey, serializedData);
                }
            }
            
            await pipeline.exec();
            this.monitoring?.logInfo('Batch cache set completed', { count: Object.keys(data).length });
            
        } catch (error) {
            this.recordCacheError(error, 'mset', { data });
            throw error;
        }
    }

    // ==================== SPECIALIZED CACHE OPERATIONS ====================
    
    /**
     * Clear user state from cache
     */
    async clearUserState(userId) {
        try {
            await this.delete('user_state', userId);
            this.monitoring?.logInfo('User state cleared', { userId });
        } catch (error) {
            this.recordCacheError(error, 'clearUserState', { userId });
        }
    }
    
    /**
     * Invalidate user settings cache
     */
    async invalidateUserSettings(userId) {
        try {
            await this.delete('user_settings', userId);
            await this.delete('main_menu', userId);
            this.monitoring?.logInfo('User settings invalidated', { userId });
        } catch (error) {
            this.recordCacheError(error, 'invalidateUserSettings', { userId });
        }
    }
    
    /**
     * Invalidate cache after trading operations
     */
    async invalidateAfterTrade(userId, walletAddress, operation = 'trade') {
        try {
            const invalidations = [
                this.delete('wallet_balance', walletAddress),
                this.delete('portfolio', userId),
                this.delete('main_menu', userId)
            ];
            
            await Promise.all(invalidations);
            
            this.monitoring?.logInfo('Post-trade cache invalidation completed', { 
                userId, 
                walletAddress, 
                operation 
            });
            
        } catch (error) {
            this.recordCacheError(error, 'invalidateAfterTrade', { userId, walletAddress, operation });
        }
    }
    
    /**
     * Warm cache for active users
     */
    async warmActiveUsersCache() {
        if (this.isWarming) {
            return;
        }
        
        this.isWarming = true;
        
        try {
            // Get active users from the last 24 hours
            const activeUsers = await this.getActiveUsers();
            
            this.monitoring?.logInfo('Starting cache warming', { 
                activeUsers: activeUsers.length 
            });
            
            let warmedUsers = 0;
            let warmedSettings = 0;
            
            for (const user of activeUsers) {
                try {
                    // Pre-warm user data
                    const userData = await this.get('user', user.telegram_id, async () => {
                        return user;
                    });
                    
                    if (userData) {
                        warmedUsers++;
                    }
                    
                    // Pre-warm user settings
                    const userSettings = await this.get('user_settings', user.telegram_id, async () => {
                        // This would fetch from database in real implementation
                        return null;
                    });
                    
                    if (userSettings) {
                        warmedSettings++;
                    }
                    
                } catch (error) {
                    this.recordCacheError(error, 'warmCache', { userId: user.telegram_id });
                }
            }
            
            this.monitoring?.logInfo('Cache warming completed', { 
                activeUsers: activeUsers.length,
                warmedUsers,
                warmedSettings
            });
            
        } catch (error) {
            this.recordCacheError(error, 'warmActiveUsersCache');
        } finally {
            this.isWarming = false;
        }
    }

    // ==================== PERFORMANCE MONITORING ====================
    
    /**
     * Record cache hit with performance tracking
     */
    recordCacheHit(type, identifier, startTime) {
        const responseTime = Date.now() - startTime;
        
        this.metrics.hits++;
        this.metrics.responseTimeSum += responseTime;
        this.updateAverageResponseTime();
        
        // Update category statistics
        if (!this.categoryStats.has(type)) {
            this.categoryStats.set(type, { hits: 0, misses: 0, totalTime: 0 });
        }
        const categoryStats = this.categoryStats.get(type);
        categoryStats.hits++;
        categoryStats.totalTime += responseTime;
        
        // Update user statistics
        if (!this.userStats.has(identifier)) {
            this.userStats.set(identifier, { hits: 0, misses: 0 });
        }
        this.userStats.get(identifier).hits++;
        
        // Log performance for critical paths
        if (this.performanceTargets.criticalPaths.includes(type)) {
            this.monitoring?.logInfo(`🚀 CACHE HIT: ${type}:${identifier} - ${responseTime}ms`, {
                type,
                identifier,
                responseTime,
                critical: true
            });
        }
        
        // Emit monitoring event
        this.emit('cache_hit', { type, identifier, responseTime });
    }
    
    /**
     * Record cache miss with performance tracking
     */
    recordCacheMiss(type, identifier, startTime) {
        const responseTime = Date.now() - startTime;
        
        this.metrics.misses++;
        this.metrics.responseTimeSum += responseTime;
        this.updateAverageResponseTime();
        
        // Update category statistics
        if (!this.categoryStats.has(type)) {
            this.categoryStats.set(type, { hits: 0, misses: 0, totalTime: 0 });
        }
        this.categoryStats.get(type).misses++;
        
        // Update user statistics
        if (!this.userStats.has(identifier)) {
            this.userStats.set(identifier, { hits: 0, misses: 0 });
        }
        this.userStats.get(identifier).misses++;
        
        // Log cache miss for critical paths
        if (this.performanceTargets.criticalPaths.includes(type)) {
            this.monitoring?.logWarning(`❌ CACHE MISS: ${type}:${identifier} - ${responseTime}ms`, {
                type,
                identifier,
                responseTime,
                critical: true
            });
        }
        
        // Emit monitoring event
        this.emit('cache_miss', { type, identifier, responseTime });
    }
    
    /**
     * Record cache error
     */
    recordCacheError(error, operation, context = {}) {
        this.metrics.errors++;
        
        const errorRecord = {
            timestamp: new Date(),
            operation,
            error: error.message,
            context
        };
        
        this.recentErrors.unshift(errorRecord);
        if (this.recentErrors.length > 100) {
            this.recentErrors = this.recentErrors.slice(0, 100);
        }
        
        this.monitoring?.logError(`Cache ${operation} error`, error, context);
        this.emit('cache_error', { error, operation, context });
    }
    
    /**
     * Update average response time
     */
    updateAverageResponseTime() {
        const totalRequests = this.metrics.hits + this.metrics.misses;
        if (totalRequests > 0) {
            this.metrics.avgResponseTime = this.metrics.responseTimeSum / totalRequests;
        }
    }

    // ==================== HEALTH MONITORING ====================
    
    /**
     * Start automated health monitoring
     */
    startHealthMonitoring() {
        this.healthInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthConfig.checkInterval);
        
        this.monitoring?.logInfo('Cache health monitoring started', {
            interval: this.healthConfig.checkInterval,
            autoRecovery: this.healthConfig.autoRecovery
        });
    }
    
    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        try {
            const healthResults = {
                timestamp: new Date(),
                connectivity: await this.checkConnectivity(),
                performance: await this.checkPerformance(),
                consistency: await this.checkConsistency(),
                memory: await this.checkMemoryUsage()
            };
            
            const overallHealth = this.calculateOverallHealth(healthResults);
            
            if (overallHealth.status === 'critical' && this.healthConfig.autoRecovery) {
                await this.performAutoRecovery(healthResults);
            }
            
            this.monitoring?.logInfo('Cache health check completed', {
                ...healthResults,
                overallHealth
            });
            
            this.emit('health_check', { results: healthResults, overallHealth });
            
        } catch (error) {
            this.recordCacheError(error, 'healthCheck');
        }
    }
    
    /**
     * Check Redis connectivity
     */
    async checkConnectivity() {
        try {
            const start = Date.now();
            await this.redis.ping();
            const responseTime = Date.now() - start;
            
            return {
                status: responseTime < 100 ? 'healthy' : 'warning',
                responseTime,
                message: responseTime < 100 ? 'Redis responding normally' : 'Redis response slow'
            };
        } catch (error) {
            return {
                status: 'critical',
                error: error.message,
                message: 'Redis connection failed'
            };
        }
    }
    
    /**
     * Check cache performance metrics
     */
    async checkPerformance() {
        const hitRatio = this.getHitRatio();
        const avgResponseTime = this.metrics.avgResponseTime;
        
        let status = 'healthy';
        let issues = [];
        
        if (hitRatio < this.healthConfig.performanceThresholds.minHitRatio) {
            status = 'warning';
            issues.push(`Hit ratio ${(hitRatio * 100).toFixed(1)}% below target ${(this.healthConfig.performanceThresholds.minHitRatio * 100)}%`);
        }
        
        if (avgResponseTime > this.healthConfig.performanceThresholds.maxResponseTime) {
            status = 'warning';
            issues.push(`Average response time ${avgResponseTime.toFixed(1)}ms above threshold`);
        }
        
        if (this.metrics.errors > this.healthConfig.maxErrors) {
            status = 'critical';
            issues.push(`Too many errors: ${this.metrics.errors}`);
        }
        
        return {
            status,
            hitRatio,
            avgResponseTime,
            totalErrors: this.metrics.errors,
            issues
        };
    }

    // ==================== PERFORMANCE ANALYSIS ====================
    
    /**
     * Analyze cache performance comprehensively
     */
    async analyzePerformance() {
        const results = {
            timestamp: new Date(),
            overallMetrics: this.getOverallMetrics(),
            categoryBreakdown: this.getCategoryBreakdown(),
            criticalPathAnalysis: await this.analyzeCriticalPaths(),
            recommendations: this.generateRecommendations()
        };
        
        this.monitoring?.logInfo('Cache performance analysis completed', results);
        return results;
    }
    
    /**
     * Get overall cache metrics
     */
    getOverallMetrics() {
        const hitRatio = this.getHitRatio();
        const uptime = (Date.now() - this.metrics.startTime) / 1000;
        
        return {
            hitRatio,
            totalRequests: this.metrics.totalRequests,
            cacheHits: this.metrics.hits,
            cacheMisses: this.metrics.misses,
            totalErrors: this.metrics.errors,
            avgResponseTime: this.metrics.avgResponseTime,
            uptime: Math.floor(uptime)
        };
    }
    
    /**
     * Get hit ratio
     */
    getHitRatio() {
        const totalRequests = this.metrics.hits + this.metrics.misses;
        return totalRequests > 0 ? this.metrics.hits / totalRequests : 0;
    }

    // ==================== UTILITY METHODS ====================
    
    /**
     * Get active users for cache warming
     */
    async getActiveUsers() {
        // This would typically query the database for active users
        // For now, return empty array as placeholder
        return [];
    }
    
    /**
     * Start performance monitoring with periodic reports
     */
    startPerformanceMonitoring() {
        this.performanceInterval = setInterval(() => {
            this.logPerformanceReport();
        }, 30000); // Every 30 seconds
    }
    
    /**
     * Log performance report
     */
    logPerformanceReport() {
        const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000 / 60);
        const hitRatio = this.getHitRatio();
        
        console.log('\n📊 ===== CACHE PERFORMANCE REPORT =====');
        console.log(`⏱️  Uptime: ${uptime}m`);
        console.log(`📈 Total Requests: ${this.metrics.totalRequests}`);
        console.log(`🚀 Cache Hits: ${this.metrics.hits}`);
        console.log(`❌ Cache Misses: ${this.metrics.misses}`);
        console.log(`🎯 Hit Ratio: ${(hitRatio * 100).toFixed(2)}%`);
        console.log(`⚡ Avg Response Time: ${this.metrics.avgResponseTime.toFixed(2)}ms`);
        
        if (this.categoryStats.size > 0) {
            console.log('\n📋 Category Breakdown:');
            for (const [category, stats] of this.categoryStats.entries()) {
                const categoryHitRatio = stats.hits / (stats.hits + stats.misses) * 100;
                const avgTime = stats.totalTime / stats.hits;
                console.log(`  ${category}: ${stats.hits}H/${stats.misses}M (${categoryHitRatio.toFixed(1)}%) - ${avgTime.toFixed(1)}ms`);
            }
        }
        
        console.log('=====================================\n');
    }
    
    /**
     * Start cache warming scheduler
     */
    startCacheWarming() {
        // Warm cache immediately
        setTimeout(() => {
            this.warmActiveUsersCache();
        }, 5000); // Wait 5 seconds after startup
        
        // Schedule regular cache warming every hour
        this.warmingInterval = setInterval(() => {
            this.warmActiveUsersCache();
        }, 60 * 60 * 1000); // Every hour
        
        this.monitoring?.logInfo('Cache warming scheduler started');
    }
    
    /**
     * Initialize metrics collection
     */
    initializeMetricsCollection() {
        // Reset metrics
        this.metrics.startTime = Date.now();
        
        // Start collecting metrics for monitoring system
        this.metricsInterval = setInterval(() => {
            if (this.monitoring) {
                this.monitoring.recordCacheHit();  // This would be called when actual hits occur
                this.monitoring.recordCacheMiss(); // This would be called when actual misses occur
            }
        }, 1000);
    }

    // ==================== CLEANUP ====================
    
    /**
     * Cleanup and destroy the cache system
     */
    destroy() {
        // Clear all intervals
        if (this.healthInterval) clearInterval(this.healthInterval);
        if (this.performanceInterval) clearInterval(this.performanceInterval);
        if (this.warmingInterval) clearInterval(this.warmingInterval);
        if (this.metricsInterval) clearInterval(this.metricsInterval);
        
        // Clear statistics
        this.categoryStats.clear();
        this.userStats.clear();
        this.recentErrors = [];
        
        this.monitoring?.logInfo('Unified Cache System destroyed');
    }
}

module.exports = UnifiedCacheSystem;

