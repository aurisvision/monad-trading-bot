const Redis = require('ioredis');

/**
 * Comprehensive Redis Cache Service for Area51 Telegram Bot
 * Implements TTL strategy, pipeline operations, and cache invalidation
 */
class CacheService {
    constructor(redisClient, monitoring = null) {
        this.redis = redisClient;
        this.monitoring = monitoring;
        this.keyPrefix = 'area51:';
        
        // TTL Configuration (in seconds)
        this.ttlConfig = {
            user: null,                    // No TTL - persistent until manual deletion
            portfolio: 30 * 60,           // 30 minutes (with force refresh capability)
            wallet_balance: 30,           // 30 seconds
            main_menu: 60,                // 1 minute
            user_settings: null,          // No TTL - persistent until user updates settings
            user_state: 10 * 60,          // 10 minutes
            token_info: 5 * 60,           // 5 minutes
            mon_price_usd: 2 * 60,        // 2 minutes
            temp_sell_data: 10 * 60       // 10 minutes
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
                
                if (this.monitoring) {
                    this.monitoring.logInfo('Cache hit', { key, type, identifier });
                }
                
                return JSON.parse(cached);
            }
            
            // Cache miss - use fallback if provided
            this.metrics.misses++;
            
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
     * Delete single cache key
     */
    async delete(type, identifier) {
        try {
            const key = this.getKey(type, identifier);
            const result = await this.redis.del(key);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Cache delete', { key, type, identifier, deleted: result });
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
     * Pipeline operations for batch cache operations (3x faster)
     */
    async batchDelete(operations) {
        try {
            if (!operations || operations.length === 0) {
                return true;
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
