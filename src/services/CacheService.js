const Redis = require('ioredis');

/**
 * Comprehensive Redis Cache Service for Area51 Telegram Bot
 * Implements TTL strategy, pipeline operations, and cache invalidation
 */
class CacheService {
    constructor(redis, monitoring = null) {
        this.redis = redis;
        this.monitoring = monitoring;
        this.keyPrefix = 'area51:';
        
        // TTL configurations (in seconds) - Optimized for 85%+ hit ratio
        this.ttlConfig = {
            user: null,              // No TTL - persistent until manual update
            user_settings: null,     // No TTL - persistent until manual update
            wallet_balance: 120,     // 2 minutes - increased from 30s
            portfolio: 300,          // 5 minutes - increased from 1 minute
            main_menu: 300,          // 5 minutes - increased from 1 minute
            user_state: 600,         // 10 minutes - temporary state
            token_info: 900,         // 15 minutes - increased from 5 minutes
            mon_price_usd: 3600,     // 1 hour - price doesn't change frequently
            temp_sell_data: 20 * 60, // 20 minutes - increased from 10 minutes
            user_buttons: null,      // No TTL - user's custom buttons are persistent
            gas_settings: null       // No TTL - gas settings are persistent
        };
        
        // Performance metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            errors: 0,
            totalRequests: 0,
            avgResponseTime: 0
        };
    }

    /**
     * Clear user state from cache
     */
    async clearUserState(userId) {
        const key = this.getKey('user_state', userId);
        try {
            await this.redis.del(key);
            if (this.monitoring) {
                this.monitoring.logInfo('User state cleared from cache', { userId, key });
            }
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Failed to clear user state from cache', error, { userId, key });
            }
            throw error;
        }
    }

    /**
     * Initialize cache service
     */
    async initialize() {
        if (!this.redis) {
            console.log('⚠️ Redis not available, cache service disabled');
            return;
        }

        try {
            // Test Redis connection
            await this.redis.ping();
            console.log('✅ CacheService initialized successfully');
            
            if (this.monitoring) {
                this.monitoring.logInfo('CacheService initialized', { keyPrefix: this.keyPrefix });
            }
        } catch (error) {
            console.error('❌ CacheService initialization failed:', error);
            if (this.monitoring) {
                this.monitoring.logError('CacheService initialization failed', error);
            }
        }
    }

    // Cache Health Check System
    async validateCacheConsistency() {
        if (!this.redis) return { status: 'disabled', issues: [] };
        
        const issues = [];
        const legacyPatterns = [
            'user:*', 'balance:*', 'portfolio:*', 'main_menu:*', 
            'mon_balance:*', 'settings:*'
        ];
        
        try {
            // Check for legacy keys that should use area51: prefix
            for (const pattern of legacyPatterns) {
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    issues.push({
                        type: 'legacy_keys',
                        pattern,
                        count: keys.length,
                        keys: keys.slice(0, 5), // Show first 5 examples
                        severity: 'critical'
                    });
                }
            }
            
            // Check for duplicate data (same user with different key formats)
            const area51Keys = await this.redis.keys('area51:user:*');
            const legacyUserKeys = await this.redis.keys('user:*');
            
            if (area51Keys.length > 0 && legacyUserKeys.length > 0) {
                issues.push({
                    type: 'duplicate_user_data',
                    area51Count: area51Keys.length,
                    legacyCount: legacyUserKeys.length,
                    severity: 'high'
                });
            }
            
            return {
                status: 'checked',
                timestamp: new Date().toISOString(),
                totalIssues: issues.length,
                issues
            };
            
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                issues: []
            };
        }
    }

    // Get all key prefixes used by CacheService
    getAllKeyPrefixes() {
        return Object.keys(this.ttlConfig).map(type => `${this.keyPrefix}${type}:`);
    }

    // Clean legacy cache keys
    async cleanLegacyKeys() {
        if (!this.redis) return { cleaned: 0, errors: [] };
        
        const legacyPatterns = [
            'user:*', 'balance:*', 'portfolio:*', 'main_menu:*', 
            'mon_balance:*', 'settings:*'
        ];
        
        let totalCleaned = 0;
        const errors = [];
        
        try {
            for (const pattern of legacyPatterns) {
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                    totalCleaned += keys.length;
                    
                    if (this.monitoring) {
                        this.monitoring.logInfo('Legacy cache keys cleaned', {
                            pattern,
                            count: keys.length
                        });
                    }
                }
            }
            
            return { cleaned: totalCleaned, errors };
            
        } catch (error) {
            errors.push(error.message);
            return { cleaned: totalCleaned, errors };
        }
    }

    /**
     * Generate cache key with prefix
     */
    getKey(type, identifier) {
        return `${this.keyPrefix}${type}:${identifier}`;
    }

    /**
     * Get data from cache with fallback
     */
    async get(type, identifier, fallbackFn = null) {
        const startTime = Date.now();
        this.metrics.totalRequests++;
        
        try {
            const key = this.getKey(type, identifier);
            const cached = await this.redis.get(key);
            
            if (cached) {
                this.metrics.hits++;
                this._updateResponseTime(startTime);
                
                console.log(`🚀 CACHE HIT: ${type}:${identifier} - Instant response!`);
                if (this.monitoring) {
                    this.monitoring.logInfo('Cache hit', { key, type, identifier });
                }
                
                return JSON.parse(cached);
            }
            
            // Cache miss - use fallback if provided
            this.metrics.misses++;
            console.log(`❌ CACHE MISS: ${type}:${identifier} - Fetching from source...`);
            
            if (fallbackFn && typeof fallbackFn === 'function') {
                const data = await fallbackFn();
                if (data) {
                    await this.set(type, identifier, data);
                    this._updateResponseTime(startTime);
                    return data;
                }
            }
            
            this._updateResponseTime(startTime);
            return null;
            
        } catch (error) {
            this.metrics.errors++;
            this._updateResponseTime(startTime);
            
            if (this.monitoring) {
                this.monitoring.logError('Cache get error', error, { type, identifier });
            }
            
            // Fallback to function if cache fails
            if (fallbackFn && typeof fallbackFn === 'function') {
                try {
                    return await fallbackFn();
                } catch (fallbackError) {
                    if (this.monitoring) {
                        this.monitoring.logError('Fallback function error', fallbackError, { type, identifier });
                    }
                }
            }
            
            return null;
        }
    }

    /**
     * Set data in cache with appropriate TTL
     */
    async set(type, identifier, data, customTTL = null) {
        try {
            const key = this.getKey(type, identifier);
            const value = JSON.stringify(data);
            const ttl = customTTL || this.ttlConfig[type];
            
            if (ttl) {
                await this.redis.setEx(key, ttl, value);
            } else {
                await this.redis.set(key, value);
            }
            
            if (this.monitoring) {
                this.monitoring.logInfo('Cache set', { key, type, identifier, ttl });
            }
            
            return true;
            
        } catch (error) {
            this.metrics.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Cache set error', error, { type, identifier });
            }
            
            return false;
        }
    }

    /**
     * Delete data from cache
     */
    async delete(type, identifier) {
        if (!this.redis) return false;
        
        try {
            const key = this.getKey(type, identifier);
            const result = await this.redis.del(key);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Cache delete', { key, type, identifier, deleted: result > 0 });
            }
            
            return result > 0;
        } catch (error) {
            this.metrics.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Cache delete error', error, { type, identifier });
            }
            
            return false;
        }
    }

    /**
     * Clear all cache after trading operations
     */
    async clearAfterTrade(userId, walletAddress) {
        if (!this.redis) return;
        
        try {
            await Promise.all([
                this.delete('portfolio', userId),
                this.delete('wallet_balance', walletAddress),
                this.delete('main_menu', userId),
                this.delete('user_state', userId)
            ]);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Cache cleared after trade', { userId, walletAddress });
            }
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Cache clear after trade failed', error, { userId, walletAddress });
            }
        }
    }

    /**
     * Pipeline operations for batch cache operations (3x faster)
     */
    async batchDelete(operations) {
        try {
            if (!operations || operations.length === 0) {
                return true;
            }
            
            // Check if redis client has pipeline method
            if (!this.redis || typeof this.redis.pipeline !== 'function') {
                // Fallback to individual deletions
                const deletePromises = operations.map(async ({ type, identifier }) => {
                    const key = this.getKey(type, identifier);
                    try {
                        await this.redis.del(key);
                        return { success: true, key };
                    } catch (error) {
                        return { success: false, key, error };
                    }
                });
                
                const results = await Promise.all(deletePromises);
                const successCount = results.filter(r => r.success).length;
                
                if (this.monitoring) {
                    this.monitoring.logInfo('Batch delete completed (fallback mode)', {
                        total: operations.length,
                        successful: successCount,
                        failed: operations.length - successCount
                    });
                }
                
                return successCount === operations.length;
            }
            
            const pipeline = this.redis.pipeline();
            const keys = [];
            
            operations.forEach(({ type, identifier }) => {
                const key = this.getKey(type, identifier);
                pipeline.del(key);
                keys.push(key);
            });
            
            const results = await pipeline.exec();
            
            if (this.monitoring) {
                this.monitoring.logInfo('Batch cache delete', { 
                    keys, 
                    operations: operations.length,
                    results: results.length 
                });
            }
            
            return true;
            
        } catch (error) {
            this.metrics.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Batch delete error', error, { operations });
            }
            
            return false;
        }
    }

    /**
     * Pipeline operations for batch cache set
     */
    async batchSet(operations) {
        try {
            if (!operations || operations.length === 0) {
                return true;
            }
            
            const pipeline = this.redis.pipeline();
            const keys = [];
            
            operations.forEach(({ type, identifier, data, customTTL }) => {
                const key = this.getKey(type, identifier);
                const value = JSON.stringify(data);
                const ttl = customTTL || this.ttlConfig[type];
                
                if (ttl) {
                    pipeline.setEx(key, ttl, value);
                } else {
                    pipeline.set(key, value);
                }
                
                keys.push(key);
            });
            
            const results = await pipeline.exec();
            
            if (this.monitoring) {
                this.monitoring.logInfo('Batch cache set', { 
                    keys, 
                    operations: operations.length,
                    results: results.length 
                });
            }
            
            return true;
            
        } catch (error) {
            this.metrics.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Batch set error', error, { operations });
            }
            
            return false;
        }
    }

    /**
     * Force refresh cache (ignore existing cache, fetch fresh data)
     */
    async forceRefresh(type, identifier, fallbackFn) {
        try {
            // Delete existing cache first
            await this.delete(type, identifier);
            
            // Fetch fresh data
            if (fallbackFn && typeof fallbackFn === 'function') {
                const data = await fallbackFn();
                if (data) {
                    await this.set(type, identifier, data);
                    
                    if (this.monitoring) {
                        this.monitoring.logInfo('Force refresh completed', { type, identifier });
                    }
                    
                    return data;
                }
            }
            
            return null;
            
        } catch (error) {
            this.metrics.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Force refresh error', error, { type, identifier });
            }
            
            return null;
        }
    }

    /**
     * Cache invalidation for critical operations
     */
    async invalidateAfterBuy(telegramId, walletAddress) {
        const operations = [
            { type: 'wallet_balance', identifier: walletAddress },
            { type: 'portfolio', identifier: telegramId },
            { type: 'main_menu', identifier: telegramId },
            { type: 'mon_balance', identifier: walletAddress } // Legacy support
        ];
        
        return await this.batchDelete(operations);
    }

    async invalidateAfterSell(telegramId, walletAddress) {
        const operations = [
            { type: 'wallet_balance', identifier: walletAddress },
            { type: 'portfolio', identifier: telegramId },
            { type: 'main_menu', identifier: telegramId },
            { type: 'user_state', identifier: telegramId },
            { type: 'mon_balance', identifier: walletAddress } // Legacy support
        ];
        
        return await this.batchDelete(operations);
    }

    async invalidateAfterTransfer(senderTelegramId, receiverTelegramId, senderWallet, receiverWallet) {
        const operations = [
            { type: 'wallet_balance', identifier: senderWallet },
            { type: 'wallet_balance', identifier: receiverWallet },
            { type: 'portfolio', identifier: senderTelegramId },
            { type: 'main_menu', identifier: senderTelegramId },
            { type: 'mon_balance', identifier: senderWallet }, // Legacy support
            { type: 'mon_balance', identifier: receiverWallet } // Legacy support
        ];
        
        // Add receiver cache if different user
        if (receiverTelegramId && receiverTelegramId !== senderTelegramId) {
            operations.push(
                { type: 'portfolio', identifier: receiverTelegramId },
                { type: 'main_menu', identifier: receiverTelegramId }
            );
        }
        
        return await this.batchDelete(operations);
    }

    async invalidateAfterSettingsChange(telegramId) {
        const operations = [
            { type: 'user_settings', identifier: telegramId },
            { type: 'main_menu', identifier: telegramId }
        ];
        
        return await this.batchDelete(operations);
    }

    async invalidateAfterWalletDeletion(telegramId, walletAddress) {
        const operations = [
            { type: 'user', identifier: telegramId },
            { type: 'user_settings', identifier: telegramId },
            { type: 'wallet_balance', identifier: walletAddress },
            { type: 'portfolio', identifier: telegramId },
            { type: 'main_menu', identifier: telegramId },
            { type: 'user_state', identifier: telegramId },
            { type: 'mon_balance', identifier: walletAddress } // Legacy support
        ];
        
        return await this.batchDelete(operations);
    }

    async invalidateAfterManualRefresh(telegramId, walletAddress) {
        const operations = [
            { type: 'portfolio', identifier: telegramId }, // Force refresh despite 30min TTL
            { type: 'wallet_balance', identifier: walletAddress },
            { type: 'main_menu', identifier: telegramId },
            { type: 'mon_balance', identifier: walletAddress } // Legacy support
        ];
        
        return await this.batchDelete(operations);
    }

    /**
     * Get cache statistics
     */
    getMetrics() {
        const hitRate = this.metrics.totalRequests > 0 
            ? (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(2)
            : 0;
            
        return {
            ...this.metrics,
            hitRate: `${hitRate}%`,
            missRate: `${(100 - hitRate).toFixed(2)}%`
        };
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
            avgResponseTime: 0
        };
    }

    /**
     * Clear all cache for a specific user
     */
    async clearUserCache(userId) {
        try {
            const userKeys = [
                this.getKey('user', userId),
                this.getKey('user_settings', userId),
                this.getKey('portfolio', userId),
                this.getKey('main_menu', userId),
                this.getKey('user_state', userId)
            ];
            
            // Get user data to find wallet address for balance cache
            const userData = await this.get('user', userId);
            if (userData && userData.wallet_address) {
                userKeys.push(this.getKey('wallet_balance', userData.wallet_address));
            }
            
            // Delete all user-related keys
            if (userKeys.length > 0) {
                await this.redis.del(...userKeys);
            }
            
            if (this.monitoring) {
                this.monitoring.logInfo('User cache cleared', { 
                    userId, 
                    keysCleared: userKeys.length 
                });
            }
            
            return true;
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Clear user cache failed', error, { userId });
            }
            return false;
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const testKey = this.getKey('health', 'check');
            await this.redis.set(testKey, 'ok', 'EX', 10);
            const result = await this.redis.get(testKey);
            await this.redis.del(testKey);
            
            return result === 'ok';
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Cache health check failed', error);
            }
            return false;
        }
    }

    /**
     * Update response time metrics
     */
    _updateResponseTime(startTime) {
        const responseTime = Date.now() - startTime;
        this.metrics.avgResponseTime = 
            (this.metrics.avgResponseTime + responseTime) / 2;
    }
}

module.exports = CacheService;
