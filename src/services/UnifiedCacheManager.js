/**
 * Unified Cache Manager for Area51 Trading Bot
 * Production-ready Redis-only cache management system
 * Replaces all fragmented cache implementations
 */
const CacheConfig = require('../config/CacheConfig');
class UnifiedCacheManager {
    constructor(redis, monitoring = null, environment = 'production') {
        this.redis = redis;
        this.monitoring = monitoring;
        this.config = new CacheConfig(environment);
        // Validate configuration
        const validation = this.config.validate();
        if (!validation.isValid) {
            throw new Error(`Cache configuration invalid: ${validation.errors.join(', ')}`);
        }
        // Performance metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            errors: 0,
            totalRequests: 0,
            avgResponseTime: 0,
            operations: {
                get: 0,
                set: 0,
                delete: 0,
                invalidate: 0
            }
        };
        // Connection health
        this.isHealthy = true;
        this.lastHealthCheck = null;
        // Initialize health monitoring
        this.initializeHealthMonitoring();
    }
    /**
     * Initialize Redis health monitoring
     */
    initializeHealthMonitoring() {
        if (!this.redis) return;
        this.redis.on('connect', () => {
            this.isHealthy = true;
        });
        this.redis.on('error', (error) => {
            this.isHealthy = false;
            this.metrics.errors++;
        });
        this.redis.on('close', () => {
            this.isHealthy = false;
        });
    }
    /**
     * Set data in cache with automatic TTL handling
     */
    async set(type, identifier, data, customTTL = null) {
        const startTime = Date.now();
        this.metrics.operations.set++;
        try {
            if (!this.isHealthy) {
                return false;
            }
            const config = this.config.getCacheConfig(type);
            if (!config) {
                throw new Error(`Unknown cache type: ${type}`);
            }
            const key = this.config.generateKey(type, identifier);
            const serializedData = JSON.stringify(data);
            const ttl = customTTL !== null ? customTTL : config.ttl;
            if (ttl && ttl > 0) {
                await this.redis.set(key, serializedData, 'EX', ttl);
            } else {
                await this.redis.set(key, serializedData);
            }
            this.recordMetrics('set', startTime, true);
            this.monitoring?.logInfo('Cache set', { type, identifier, ttl });
            return true;
        } catch (error) {
            this.recordMetrics('set', startTime, false);
            this.monitoring?.logError('Cache set failed', error, { type, identifier });
            return false;
        }
    }
    /**
     * Get data from cache
     */
    async get(type, identifier) {
        const startTime = Date.now();
        this.metrics.operations.get++;
        this.metrics.totalRequests++;
        try {
            if (!this.isHealthy) {
                this.metrics.misses++;
                return null;
            }
            const config = this.config.getCacheConfig(type);
            if (!config) {
                throw new Error(`Unknown cache type: ${type}`);
            }
            const key = this.config.generateKey(type, identifier);
            const data = await this.redis.get(key);
            if (data) {
                this.metrics.hits++;
                this.recordMetrics('get', startTime, true);
                this.monitoring?.logInfo('Cache hit', { type, identifier });
                return JSON.parse(data);
            } else {
                this.metrics.misses++;
                this.recordMetrics('get', startTime, false);
                this.monitoring?.logInfo('Cache miss', { type, identifier });
                return null;
            }
        } catch (error) {
            this.metrics.misses++;
            this.metrics.errors++;
            this.recordMetrics('get', startTime, false);
            this.monitoring?.logError('Cache get failed', error, { type, identifier });
            return null;
        }
    }
    /**
     * Delete single cache entry
     */
    async delete(type, identifier) {
        const startTime = Date.now();
        this.metrics.operations.delete++;
        try {
            if (!this.isHealthy) {
                return false;
            }
            const config = this.config.getCacheConfig(type);
            if (!config) {
                throw new Error(`Unknown cache type: ${type}`);
            }
            const key = this.config.generateKey(type, identifier);
            const result = await this.redis.del(key);
            if (result > 0) {
                this.recordMetrics('delete', startTime, true);
                this.monitoring?.logInfo('Cache deleted', { type, identifier });
                return true;
            } else {
                this.recordMetrics('delete', startTime, false);
                return false;
            }
        } catch (error) {
            this.recordMetrics('delete', startTime, false);
            this.monitoring?.logError('Cache delete failed', error, { type, identifier });
            return false;
        }
    }
    /**
     * Invalidate cache after trading operations
     */
    async invalidateAfterOperation(operation, userId, walletAddress) {
        const startTime = Date.now();
        this.metrics.operations.invalidate++;
        try {
            const typesToInvalidate = this.config.getInvalidationRules(operation);
            if (typesToInvalidate.length === 0) {
                return true;
            }
            const deletePromises = typesToInvalidate.map(type => {
                // Determine identifier based on cache type
                let identifier;
                if (type.includes('balance') || type.includes('portfolio_value')) {
                    identifier = walletAddress;
                } else {
                    identifier = userId;
                }
                return this.delete(type, identifier);
            });
            const results = await Promise.all(deletePromises);
            const successCount = results.filter(r => r).length;
            this.recordMetrics('invalidate', startTime, true);
            this.monitoring?.logInfo('Cache invalidated', { 
                operation, 
                userId, 
                walletAddress, 
                typesInvalidated: typesToInvalidate,
                successCount 
            });
            return successCount > 0;
        } catch (error) {
            this.recordMetrics('invalidate', startTime, false);
            this.monitoring?.logError('Cache invalidation failed', error, { operation, userId, walletAddress });
            return false;
        }
    }
    /**
     * Get or set pattern - fetch from cache or execute function and cache result
     */
    async getOrSet(type, identifier, fetchFunction, customTTL = null) {
        // Try to get from cache first
        let data = await this.get(type, identifier);
        if (data !== null) {
            return data;
        }
        // Cache miss - execute fetch function
        try {
            data = await fetchFunction();
            if (data !== null && data !== undefined) {
                // Cache the result
                await this.set(type, identifier, data, customTTL);
            }
            return data;
        } catch (error) {
            this.monitoring?.logError('Fetch function failed', error, { type, identifier });
            return null;
        }
    }
    /**
     * Batch operations for better performance
     */
    async batchDelete(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            return [];
        }
        try {
            const pipeline = this.redis.pipeline();
            operations.forEach(({ type, identifier }) => {
                const key = this.config.generateKey(type, identifier);
                pipeline.del(key);
            });
            const results = await pipeline.exec();
            const successCount = results.filter(([error, result]) => !error && result > 0).length;
            return results;
        } catch (error) {
            this.monitoring?.logError('Batch delete failed', error, { operations });
            return [];
        }
    }
    /**
     * Health check
     */
    async healthCheck() {
        try {
            const testKey = 'area51:health:check';
            const testValue = Date.now().toString();
            await this.redis.set(testKey, testValue, 'EX', 10);
            const result = await this.redis.get(testKey);
            await this.redis.del(testKey);
            const isHealthy = result === testValue;
            this.isHealthy = isHealthy;
            this.lastHealthCheck = new Date();
            if (isHealthy) {
            } else {
            }
            return isHealthy;
        } catch (error) {
            this.isHealthy = false;
            this.lastHealthCheck = new Date();
            return false;
        }
    }
    /**
     * Get performance metrics
     */
    getMetrics() {
        const hitRate = this.metrics.totalRequests > 0 
            ? (this.metrics.hits / this.metrics.totalRequests) * 100 
            : 0;
        return {
            ...this.metrics,
            hitRate: Math.round(hitRate * 100) / 100,
            isHealthy: this.isHealthy,
            lastHealthCheck: this.lastHealthCheck
        };
    }
    /**
     * Record performance metrics
     */
    recordMetrics(operation, startTime, success) {
        const duration = Date.now() - startTime;
        this.metrics.avgResponseTime = (this.metrics.avgResponseTime + duration) / 2;
        if (!success) {
            this.metrics.errors++;
        }
    }
    /**
     * Clear user state from cache (for compatibility)
     */
    async clearUserState(userId) {
        try {
            // Only clear temporary state, NOT main_menu or portfolio (they should persist)
            const statesToClear = ['user_state', 'session'];
            const deletePromises = statesToClear.map(type => this.delete(type, userId));
            await Promise.all(deletePromises);
            return true;
        } catch (error) {
            return false;
        }
    }
    /**
     * Clear ALL user cache (including main_menu and portfolio) - use with caution
     */
    async clearAllUserCache(userId) {
        try {
            const statesToClear = ['user_state', 'session', 'main_menu', 'portfolio'];
            const deletePromises = statesToClear.map(type => this.delete(type, userId));
            await Promise.all(deletePromises);
            return true;
        } catch (error) {
            return false;
        }
    }
    /**
     * Clear all cache (use with caution)
     */
    async clearAll() {
        try {
            const keys = await this.redis.keys('area51:*');
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
            return keys.length;
        } catch (error) {
            return 0;
        }
    }
    /**
     * Get cache statistics
     */
    async getStats() {
        try {
            const info = await this.redis.info('memory');
            const keyCount = await this.redis.dbsize();
            return {
                keyCount,
                memoryInfo: info,
                metrics: this.getMetrics(),
                config: {
                    environment: this.config.environment,
                    totalCacheTypes: Object.keys(this.config.getAllConfigs()).length
                }
            };
        } catch (error) {
            return null;
        }
    }
}
module.exports = UnifiedCacheManager;