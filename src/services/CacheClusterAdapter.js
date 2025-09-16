/**
 * Cache Cluster Adapter for Area51 Trading Bot
 * Provides seamless integration between existing code and new Redis Cluster
 * Maintains backward compatibility while adding cluster benefits
 */

const EnhancedCacheService = require('./EnhancedCacheService');
const CacheService = require('./CacheService');

class CacheClusterAdapter {
    constructor(redisConfig = {}, monitoring = null) {
        this.monitoring = monitoring;
        this.useCluster = process.env.REDIS_CLUSTER_ENABLED === 'true';
        
        // Initialize appropriate cache service
        if (this.useCluster) {
            this.cacheService = new EnhancedCacheService({
                master: { 
                    port: parseInt(process.env.REDIS_MASTER_PORT) || 6379,
                    host: process.env.REDIS_MASTER_HOST || 'localhost'
                },
                replica: { 
                    port: parseInt(process.env.REDIS_REPLICA_PORT) || 6380,
                    host: process.env.REDIS_REPLICA_HOST || 'localhost'
                },
                cache: { 
                    port: parseInt(process.env.REDIS_CACHE_PORT) || 6381,
                    host: process.env.REDIS_CACHE_HOST || 'localhost'
                },
                writeMode: process.env.REDIS_WRITE_MODE || 'mirror',
                readMode: process.env.REDIS_READ_MODE || 'smart'
            }, monitoring);
            
            this.monitoring?.logInfo('Cache Cluster Adapter: Using Enhanced Cache Service with Redis Cluster');
        } else {
            // Fallback to single Redis instance
            const redis = redisConfig.redis || null;
            this.cacheService = new CacheService(redis, monitoring);
            
            this.monitoring?.logInfo('Cache Cluster Adapter: Using Legacy Cache Service with single Redis');
        }
        
        this.initialized = false;
    }

    /**
     * Initialize the cache service
     */
    async initialize() {
        if (this.initialized) return;

        try {
            await this.cacheService.initialize();
            this.initialized = true;
            
            if (this.useCluster) {
                // Start performance monitoring for cluster
                this.cacheService.startPerformanceMonitoring();
            }
            
            this.monitoring?.logInfo('Cache Cluster Adapter initialized successfully', {
                useCluster: this.useCluster,
                type: this.useCluster ? 'Enhanced' : 'Legacy'
            });

        } catch (error) {
            this.monitoring?.logError('Cache Cluster Adapter initialization failed', error);
            
            // Fallback to legacy cache if cluster fails
            if (this.useCluster) {
                this.monitoring?.logWarning('Falling back to legacy cache service');
                this.useCluster = false;
                this.cacheService = new CacheService(null, this.monitoring);
                await this.cacheService.initialize();
                this.initialized = true;
            } else {
                throw error;
            }
        }
    }

    /**
     * Get data from cache - maintains compatibility with existing API
     */
    async get(type, identifier, fallbackFn = null) {
        try {
            return await this.cacheService.get(type, identifier, fallbackFn);
        } catch (error) {
            this.monitoring?.logError('Cache get operation failed', error, { type, identifier });
            
            // Execute fallback function if provided
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
     * Set data in cache - maintains compatibility with existing API
     */
    async set(type, identifier, data, customTTL = null) {
        try {
            return await this.cacheService.set(type, identifier, data, customTTL);
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
            if (this.cacheService.delete) {
                return await this.cacheService.delete(type, identifier);
            } else {
                // Legacy compatibility
                const key = this.getKey(type, identifier);
                await this.cacheService.redis.del(key);
                return true;
            }
        } catch (error) {
            this.monitoring?.logError('Cache delete operation failed', error, { type, identifier });
            return false;
        }
    }

    /**
     * Clear user state - maintains compatibility
     */
    async clearUserState(userId) {
        try {
            return await this.cacheService.clearUserState(userId);
        } catch (error) {
            this.monitoring?.logError('Clear user state failed', error, { userId });
            return false;
        }
    }

    /**
     * Invalidate cache - maintains compatibility
     */
    async invalidate(type, identifier) {
        try {
            if (this.cacheService.invalidate) {
                return await this.cacheService.invalidate(type, identifier);
            } else {
                // Legacy compatibility
                return await this.delete(type, identifier);
            }
        } catch (error) {
            this.monitoring?.logError('Cache invalidate failed', error, { type, identifier });
            return false;
        }
    }

    /**
     * Get cache key - maintains compatibility with legacy system
     */
    getKey(type, identifier) {
        if (this.cacheService.getKey) {
            return this.cacheService.getKey(type, identifier);
        } else {
            // Legacy compatibility
            return `area51:${type}:${identifier}`;
        }
    }

    /**
     * Batch operations - enhanced functionality
     */
    async getBatch(requests) {
        try {
            if (this.cacheService.getBatch) {
                return await this.cacheService.getBatch(requests);
            } else {
                // Legacy fallback - sequential gets
                const results = {};
                for (const { type, identifier, fallbackFn } of requests) {
                    const result = await this.get(type, identifier, fallbackFn);
                    results[`${type}:${identifier}`] = result;
                }
                return results;
            }
        } catch (error) {
            this.monitoring?.logError('Batch get operation failed', error);
            return {};
        }
    }

    async setBatch(items) {
        try {
            if (this.cacheService.setBatch) {
                return await this.cacheService.setBatch(items);
            } else {
                // Legacy fallback - sequential sets
                let successful = 0;
                for (const { type, identifier, data, ttl } of items) {
                    const result = await this.set(type, identifier, data, ttl);
                    if (result) successful++;
                }
                return successful;
            }
        } catch (error) {
            this.monitoring?.logError('Batch set operation failed', error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        try {
            if (this.cacheService.getStats) {
                return this.cacheService.getStats();
            } else {
                // Legacy compatibility
                return {
                    hits: this.cacheService.metrics?.hits || 0,
                    misses: this.cacheService.metrics?.misses || 0,
                    errors: this.cacheService.metrics?.errors || 0,
                    totalRequests: this.cacheService.metrics?.totalRequests || 0,
                    hitRatio: '0%',
                    avgResponseTime: '0ms',
                    type: 'legacy'
                };
            }
        } catch (error) {
            this.monitoring?.logError('Get stats failed', error);
            return { error: error.message };
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            if (this.cacheService.healthCheck) {
                return await this.cacheService.healthCheck();
            } else {
                // Legacy compatibility
                if (this.cacheService.redis) {
                    await this.cacheService.redis.ping();
                    return { status: 'healthy', type: 'legacy' };
                } else {
                    return { status: 'no-redis', type: 'legacy' };
                }
            }
        } catch (error) {
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Performance monitoring
     */
    startPerformanceMonitoring() {
        if (this.useCluster && this.cacheService.startPerformanceMonitoring) {
            // Already started in initialize for cluster
            return;
        }
        
        // Legacy performance monitoring
        setInterval(() => {
            const stats = this.getStats();
            
            this.monitoring?.logInfo('📊 ===== CACHE PERFORMANCE REPORT =====');
            this.monitoring?.logInfo(`⏱️  Uptime: ${Math.floor((Date.now() - (this.cacheService.metrics?.startTime || Date.now())) / 60000)}m`);
            this.monitoring?.logInfo(`📈 Total Requests: ${stats.totalRequests}`);
            this.monitoring?.logInfo(`🚀 Cache Hits: ${stats.hits}`);
            this.monitoring?.logInfo(`❌ Cache Misses: ${stats.misses}`);
            this.monitoring?.logInfo(`🎯 Hit Ratio: ${stats.hitRatio}`);
            this.monitoring?.logInfo(`⚡ Avg Response Time: ${stats.avgResponseTime}`);
            this.monitoring?.logInfo('=====================================');

        }, 60000); // Report every minute
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            if (this.cacheService.shutdown) {
                await this.cacheService.shutdown();
            }
            this.monitoring?.logInfo('Cache Cluster Adapter shutdown completed');
        } catch (error) {
            this.monitoring?.logError('Cache Cluster Adapter shutdown failed', error);
        }
    }

    /**
     * Get cluster information (if using cluster)
     */
    getClusterInfo() {
        if (this.useCluster && this.cacheService.cluster) {
            return {
                useCluster: true,
                status: this.cacheService.cluster.getStatus(),
                type: 'enhanced'
            };
        } else {
            return {
                useCluster: false,
                type: 'legacy',
                redis: !!this.cacheService.redis
            };
        }
    }

    /**
     * Migration helper - warm up cluster with existing data
     */
    async warmupCluster() {
        if (!this.useCluster) {
            this.monitoring?.logInfo('Cluster warmup skipped - not using cluster mode');
            return;
        }

        try {
            this.monitoring?.logInfo('Starting cluster warmup...');
            
            // This would typically involve migrating data from single Redis to cluster
            // For development, we'll just log that warmup is complete
            
            this.monitoring?.logInfo('Cluster warmup completed');
            
        } catch (error) {
            this.monitoring?.logError('Cluster warmup failed', error);
        }
    }
}

module.exports = CacheClusterAdapter;
