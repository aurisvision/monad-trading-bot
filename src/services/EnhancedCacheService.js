/**
 * Enhanced Cache Service for Area51 Trading Bot
 * Uses Redis Cluster Manager for high-performance caching with smart routing
 * Maintains compatibility with existing CacheService API
 */

const RedisClusterManager = require('./RedisClusterManager');
const DevelopmentCacheCluster = require('./DevelopmentCacheCluster');

class EnhancedCacheService {
    constructor(config = {}, monitoring = null) {
        this.monitoring = monitoring;
        this.keyPrefix = 'area51:';
        
        // Initialize appropriate cluster based on environment
        const isDevelopment = process.env.NODE_ENV === 'development' || !config.replica || !config.cache;
        
        if (isDevelopment) {
            this.cluster = new DevelopmentCacheCluster(config.master || config, monitoring);
            this.monitoring?.logInfo('Using Development Cache Cluster (Single Redis)');
        } else {
            this.cluster = new RedisClusterManager(config, monitoring);
            this.monitoring?.logInfo('Using Production Redis Cluster Manager');
        }
        
        // TTL configurations (in seconds) - Optimized for cluster performance
        this.ttlConfig = {
            // Persistent data (no TTL)
            user: null,
            user_settings: null,
            gas_settings: null,
            user_buttons: null,
            
            // High-frequency data (short TTL)
            wallet_balance: 120,        // 2 minutes
            portfolio: 300,             // 5 minutes
            main_menu: 300,             // 5 minutes
            user_state: 600,            // 10 minutes
            
            // Semi-static data (longer TTL)
            token_info: 900,            // 15 minutes
            mon_price_usd: 3600,        // 1 hour
            temp_sell_data: 1200        // 20 minutes
        };
        
        // Performance metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            errors: 0,
            totalRequests: 0,
            avgResponseTime: 0,
            startTime: Date.now()
        };

        this.initialized = false;
    }

    /**
     * Initialize the enhanced cache service
     */
    async initialize() {
        if (this.initialized) return;

        try {
            await this.cluster.initialize();
            this.initialized = true;
            
            this.monitoring?.logInfo('Enhanced Cache Service initialized with Redis Cluster');
            console.log('Enhanced Cache Service initialized', {
                cluster: this.cluster.getStatus().health
            });

        } catch (error) {
            this.monitoring?.logError('Enhanced Cache Service initialization failed', error);
            throw error;
        }
    }

    /**
     * Get data from cache with intelligent fallback
     */
    async get(type, identifier, fallbackFn = null) {
        const startTime = Date.now();
        
        try {
            this.metrics.totalRequests++;

            // Try to get from cluster
            const cached = await this.cluster.read(identifier, { type });
            
            if (cached !== null) {
                this.metrics.hits++;
                this.recordResponseTime(Date.now() - startTime);
                
                this.monitoring?.logInfo(`🚀 CACHE HIT: ${type}:${identifier} - Instant response!`, {
                    key: this.cluster.getKey(identifier, type),
                    type,
                    identifier
                });
                
                return cached;
            }

            // Cache miss - use fallback if provided
            this.metrics.misses++;
            
            if (fallbackFn && typeof fallbackFn === 'function') {
                const data = await fallbackFn();
                
                if (data !== null && data !== undefined) {
                    // Store in cache for next time
                    await this.set(type, identifier, data);
                    
                    this.monitoring?.logInfo(`💾 CACHE MISS: ${type}:${identifier} - Data fetched and cached`, {
                        key: this.cluster.getKey(identifier, type),
                        type,
                        identifier
                    });
                    
                    return data;
                }
            }

            this.recordResponseTime(Date.now() - startTime);
            return null;

        } catch (error) {
            this.metrics.errors++;
            this.recordResponseTime(Date.now() - startTime);
            
            this.monitoring?.logError('Cache get operation failed', error, { type, identifier });
            
            // Try fallback function on error
            if (fallbackFn && typeof fallbackFn === 'function') {
                try {
                    return await fallbackFn();
                } catch (fallbackError) {
                    this.monitoring?.logError('Fallback function failed', fallbackError, { type, identifier });
                }
            }
            
            return null;
        }
    }

    /**
     * Set data in cache with optimal TTL
     */
    async set(type, identifier, data, customTTL = null) {
        try {
            const ttl = customTTL || this.ttlConfig[type];
            
            await this.cluster.write(identifier, data, { type, ttl });
            
            this.monitoring?.logInfo('Cache set', {
                key: this.cluster.getKey(identifier, type),
                type,
                identifier,
                ttl
            });

            return true;

        } catch (error) {
            this.monitoring?.logError('Cache set operation failed', error, { type, identifier });
            return false;
        }
    }

    /**
     * Delete data from cache
     */
    async delete(type, identifier) {
        try {
            await this.cluster.delete(identifier, { type });
            
            this.monitoring?.logInfo('Cache delete', {
                key: this.cluster.getKey(identifier, type),
                type,
                identifier
            });

            return true;

        } catch (error) {
            this.monitoring?.logError('Cache delete operation failed', error, { type, identifier });
            return false;
        }
    }

    /**
     * Clear user state from cache
     */
    async clearUserState(userId) {
        try {
            await this.delete('user_state', userId);
            
            this.monitoring?.logInfo('User state cleared from cache', { 
                userId, 
                key: this.cluster.getKey(userId, 'user_state')
            });

            return true;

        } catch (error) {
            this.monitoring?.logError('Failed to clear user state from cache', error, { userId });
            return false;
        }
    }

    /**
     * Invalidate cache for specific type and identifier
     */
    async invalidate(type, identifier) {
        return await this.delete(type, identifier);
    }

    /**
     * Batch get operation
     */
    async getBatch(requests) {
        const results = {};
        const promises = requests.map(async ({ type, identifier, fallbackFn }) => {
            const result = await this.get(type, identifier, fallbackFn);
            return { key: `${type}:${identifier}`, result };
        });

        try {
            const batchResults = await Promise.allSettled(promises);
            
            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results[result.value.key] = result.value.result;
                } else {
                    const request = requests[index];
                    results[`${request.type}:${request.identifier}`] = null;
                    this.monitoring?.logError('Batch get item failed', result.reason, {
                        type: request.type,
                        identifier: request.identifier
                    });
                }
            });

            return results;

        } catch (error) {
            this.monitoring?.logError('Batch get operation failed', error);
            return {};
        }
    }

    /**
     * Batch set operation
     */
    async setBatch(items) {
        const promises = items.map(({ type, identifier, data, ttl }) => 
            this.set(type, identifier, data, ttl)
        );

        try {
            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
            
            this.monitoring?.logInfo('Batch set completed', {
                total: items.length,
                successful,
                failed: items.length - successful
            });

            return successful;

        } catch (error) {
            this.monitoring?.logError('Batch set operation failed', error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const clusterStatus = this.cluster.getStatus();
        
        return {
            // Cache service metrics
            hits: this.metrics.hits,
            misses: this.metrics.misses,
            errors: this.metrics.errors,
            totalRequests: this.metrics.totalRequests,
            hitRatio: this.metrics.totalRequests > 0 ? (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(2) + '%' : '0%',
            avgResponseTime: this.metrics.avgResponseTime.toFixed(2) + 'ms',
            uptime: Date.now() - this.metrics.startTime,
            
            // Cluster metrics
            cluster: {
                health: clusterStatus.health,
                reads: clusterStatus.metrics.reads,
                writes: clusterStatus.metrics.writes,
                responseTime: clusterStatus.metrics.responseTime
            }
        };
    }

    /**
     * Record response time for metrics
     */
    recordResponseTime(time) {
        // Update average response time using moving average
        if (this.metrics.avgResponseTime === 0) {
            this.metrics.avgResponseTime = time;
        } else {
            this.metrics.avgResponseTime = (this.metrics.avgResponseTime * 0.9) + (time * 0.1);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const clusterStatus = this.cluster.getStatus();
            
            return {
                status: clusterStatus.health.master ? 'healthy' : 'unhealthy',
                cluster: clusterStatus.health,
                metrics: this.getStats(),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.monitoring?.logError('Cache health check failed', error);
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        setInterval(() => {
            const stats = this.getStats();
            
            this.monitoring?.logInfo('📊 ===== ENHANCED CACHE PERFORMANCE REPORT =====');
            this.monitoring?.logInfo(`⏱️  Uptime: ${Math.floor(stats.uptime / 60000)}m`);
            this.monitoring?.logInfo(`📈 Total Requests: ${stats.totalRequests}`);
            this.monitoring?.logInfo(`🚀 Cache Hits: ${stats.hits}`);
            this.monitoring?.logInfo(`❌ Cache Misses: ${stats.misses}`);
            this.monitoring?.logInfo(`🎯 Hit Ratio: ${stats.hitRatio}`);
            this.monitoring?.logInfo(`⚡ Avg Response Time: ${stats.avgResponseTime}`);
            this.monitoring?.logInfo(`🏥 Cluster Health: Master=${stats.cluster.health.master}, Replica=${stats.cluster.health.replica}, Cache=${stats.cluster.health.cache}`);
            this.monitoring?.logInfo('=====================================');

        }, 60000); // Report every minute
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            hits: 0,
            misses: 0,
            errors: 0,
            totalRequests: 0,
            avgResponseTime: 0,
            startTime: Date.now()
        };
        
        this.cluster.resetMetrics();
        this.monitoring?.logInfo('Enhanced Cache Service metrics reset');
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            await this.cluster.shutdown();
            this.monitoring?.logInfo('Enhanced Cache Service shutdown completed');
        } catch (error) {
            this.monitoring?.logError('Enhanced Cache Service shutdown failed', error);
        }
    }

    // Legacy compatibility methods
    
    /**
     * @deprecated Use get() instead
     */
    async getKey(key, type) {
        return this.cluster.getKey(key, type);
    }

    /**
     * @deprecated Use cluster health check instead
     */
    async ping() {
        const health = await this.healthCheck();
        return health.status === 'healthy';
    }
}

module.exports = EnhancedCacheService;
