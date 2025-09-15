/**
 * Trading Cache Optimizer for Area51 Telegram Bot
 * Implements cache-first strategy for critical trading operations
 */

class TradingCacheOptimizer {
    constructor(database, cacheService, monitoring = null) {
        this.database = database;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        
        // Define which data should be cached for trading operations
        this.tradingDataTypes = {
            // Core user data (permanent cache - no TTL)
            user: {
                ttl: null,
                fields: ['telegram_id', 'username', 'wallet_address', 'created_at', 'updated_at', 'last_activity'],
                excludeFields: ['encrypted_private_key', 'encrypted_mnemonic'] // Security: Never cache private keys
            },
            
            // User settings (permanent cache - no TTL)
            user_settings: {
                ttl: null,
                fields: ['gas_price', 'slippage_tolerance', 'sell_gas_price', 'sell_slippage_tolerance', 
                        'auto_buy_enabled', 'auto_buy_amount', 'auto_buy_gas', 'auto_buy_slippage',
                        'turbo_mode', 'notifications_enabled', 'custom_buy_amounts', 'custom_sell_amounts']
            },
            
            // User state (temporary cache - 10 minutes TTL)
            user_state: {
                ttl: 600,
                fields: ['state', 'data', 'expires_at']
            }
        };
    }

    /**
     * Get user data optimized for trading operations
     * Uses cache-first strategy with database fallback
     */
    async getTradingUserData(telegramId) {
        try {
            let userData = null;
            
            if (this.cacheService) {
                // Try cache first
                userData = await this.cacheService.get('user', telegramId);
                
                if (userData) {
                    if (this.monitoring) {
                        this.monitoring.logInfo('Trading user data served from cache', { 
                            telegramId, 
                            source: 'cache',
                            responseTime: '~1ms'
                        });
                    }
                    return userData;
                }
            }
            
            // Cache miss - get from database and cache it
            userData = await this.database.getUserByTelegramId(telegramId);
            
            if (userData && this.cacheService) {
                // Remove sensitive data before caching
                const safeUserData = this.sanitizeUserDataForCache(userData);
                await this.cacheService.set('user', telegramId, safeUserData);
                
                if (this.monitoring) {
                    this.monitoring.logInfo('Trading user data cached from database', { 
                        telegramId, 
                        source: 'database',
                        cached: true
                    });
                }
                
                return safeUserData;
            }
            
            return userData;
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Trading user data fetch failed', error, { telegramId });
            }
            
            // Fallback to database only
            return await this.database.getUserByTelegramId(telegramId);
        }
    }

    /**
     * Get user settings optimized for trading operations
     */
    async getTradingUserSettings(telegramId) {
        try {
            let userSettings = null;
            
            if (this.cacheService) {
                // Try cache first
                userSettings = await this.cacheService.get('user_settings', telegramId);
                
                if (userSettings) {
                    if (this.monitoring) {
                        this.monitoring.logInfo('Trading user settings served from cache', { 
                            telegramId, 
                            source: 'cache',
                            responseTime: '~1ms'
                        });
                    }
                    return userSettings;
                }
            }
            
            // Cache miss - get from database and cache it
            userSettings = await this.database.getUserSettings(telegramId);
            
            if (userSettings && this.cacheService) {
                await this.cacheService.set('user_settings', telegramId, userSettings);
                
                if (this.monitoring) {
                    this.monitoring.logInfo('Trading user settings cached from database', { 
                        telegramId, 
                        source: 'database',
                        cached: true
                    });
                }
            }
            
            return userSettings;
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Trading user settings fetch failed', error, { telegramId });
            }
            
            // Fallback to database only
            return await this.database.getUserSettings(telegramId);
        }
    }

    /**
     * Get user state optimized for trading operations
     */
    async getTradingUserState(telegramId) {
        try {
            let userState = null;
            
            if (this.cacheService) {
                // Try cache first
                userState = await this.cacheService.get('user_state', telegramId);
                
                if (userState) {
                    if (this.monitoring) {
                        this.monitoring.logInfo('Trading user state served from cache', { 
                            telegramId, 
                            source: 'cache',
                            responseTime: '~1ms'
                        });
                    }
                    return userState;
                }
            }
            
            // Cache miss - get from database and cache it
            userState = await this.database.getUserState(telegramId);
            
            if (userState && this.cacheService) {
                await this.cacheService.set('user_state', telegramId, userState);
                
                if (this.monitoring) {
                    this.monitoring.logInfo('Trading user state cached from database', { 
                        telegramId, 
                        source: 'database',
                        cached: true
                    });
                }
            }
            
            return userState;
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Trading user state fetch failed', error, { telegramId });
            }
            
            // Fallback to database only
            return await this.database.getUserState(telegramId);
        }
    }

    /**
     * Get private key securely (NEVER cached for security)
     */
    async getPrivateKeySecure(telegramId) {
        // SECURITY: Private keys are NEVER cached - always fetch from database
        try {
            const userData = await this.database.getUserByTelegramId(telegramId);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Private key fetched securely from database', { 
                    telegramId,
                    source: 'database_only',
                    cached: false,
                    security: 'high'
                });
            }
            
            return userData?.encrypted_private_key;
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Secure private key fetch failed', error, { telegramId });
            }
            throw error;
        }
    }

    /**
     * Batch get all trading data in one optimized call
     */
    async getAllTradingData(telegramId) {
        const startTime = Date.now();
        
        try {
            // Get all data in parallel for maximum speed
            const [userData, userSettings, userState] = await Promise.all([
                this.getTradingUserData(telegramId),
                this.getTradingUserSettings(telegramId),
                this.getTradingUserState(telegramId)
            ]);
            
            const responseTime = Date.now() - startTime;
            
            if (this.monitoring) {
                this.monitoring.logInfo('Batch trading data fetched', { 
                    telegramId,
                    responseTime: `${responseTime}ms`,
                    components: ['user', 'settings', 'state']
                });
            }
            
            return {
                user: userData,
                settings: userSettings,
                state: userState,
                responseTime
            };
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Batch trading data fetch failed', error, { telegramId });
            }
            throw error;
        }
    }

    /**
     * Remove sensitive data before caching
     */
    sanitizeUserDataForCache(userData) {
        if (!userData) return null;
        
        const safeData = { ...userData };
        
        // SECURITY: Remove sensitive fields
        delete safeData.encrypted_private_key;
        delete safeData.encrypted_mnemonic;
        
        return safeData;
    }

    /**
     * Invalidate user cache after trading operations
     */
    async invalidateUserCache(telegramId, walletAddress = null) {
        if (!this.cacheService) return;
        
        try {
            // Invalidate user-related caches
            await Promise.all([
                this.cacheService.delete('user', telegramId),
                this.cacheService.delete('user_settings', telegramId),
                this.cacheService.delete('user_state', telegramId),
                this.cacheService.delete('main_menu', telegramId),
                this.cacheService.delete('portfolio', telegramId),
                walletAddress ? this.cacheService.delete('wallet_balance', walletAddress) : Promise.resolve()
            ]);
            
            if (this.monitoring) {
                this.monitoring.logInfo('User cache invalidated after trading operation', { 
                    telegramId,
                    walletAddress,
                    invalidated: ['user', 'settings', 'state', 'menu', 'portfolio', 'balance']
                });
            }
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Cache invalidation failed', error, { telegramId });
            }
        }
    }

    /**
     * Warm up cache for active users
     */
    async warmUpUserCache(telegramId) {
        if (!this.cacheService) return;
        
        try {
            const startTime = Date.now();
            
            // Pre-load all trading data
            await this.getAllTradingData(telegramId);
            
            const warmupTime = Date.now() - startTime;
            
            if (this.monitoring) {
                this.monitoring.logInfo('User cache warmed up', { 
                    telegramId,
                    warmupTime: `${warmupTime}ms`
                });
            }
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Cache warmup failed', error, { telegramId });
            }
        }
    }

    /**
     * Get cache performance metrics
     */
    async getCacheMetrics() {
        if (!this.cacheService || !this.cacheService.metrics) {
            return { available: false };
        }
        
        const metrics = this.cacheService.metrics;
        const hitRatio = metrics.totalRequests > 0 ? 
            (metrics.hits / metrics.totalRequests) * 100 : 0;
        
        return {
            available: true,
            hitRatio: Math.round(hitRatio * 100) / 100,
            totalRequests: metrics.totalRequests,
            hits: metrics.hits,
            misses: metrics.misses,
            errors: metrics.errors,
            avgResponseTime: metrics.avgResponseTime
        };
    }
}

module.exports = TradingCacheOptimizer;
