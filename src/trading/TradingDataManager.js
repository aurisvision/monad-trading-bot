/**
 * Trading Data Manager - Unified Data and Cache Management
 * Manages all cache and data operations for the unified trading system
 * Uses UnifiedCacheManager for consistent Redis-only caching
 */
const TradingConfig = require('./TradingConfig');
const UnifiedCacheManager = require('../services/UnifiedCacheManager');
const logger = require('../utils/Logger');
class TradingDataManager {
    constructor(dependencies) {
        const timer = logger.startTimer('trading_data_manager_init');
        
        this.database = dependencies.database;
        this.monorailAPI = dependencies.monorailAPI;
        this.walletManager = dependencies.walletManager;
        this.monitoring = dependencies.monitoring;
        
        // Initialize unified cache system
        this.cache = new UnifiedCacheManager(
            dependencies.redis,
            this.monitoring,
            process.env.NODE_ENV || 'production'
        );
        this.config = new TradingConfig();
        
        // Performance metrics
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            dbQueries: 0,
            avgResponseTime: 0
        };
        
        logger.info('TradingDataManager initialized', {
            hasDatabase: !!this.database,
            hasMonorailAPI: !!this.monorailAPI,
            hasWalletManager: !!this.walletManager,
            hasMonitoring: !!this.monitoring,
            environment: process.env.NODE_ENV || 'production',
            nodeVersion: process.version,
            platform: process.platform,
            memoryUsage: process.memoryUsage(),
            category: 'trading_system'
        });
        
        logger.endTimer(timer, 'TradingDataManager initialization completed', {
            category: 'trading_system'
        });
    }
    /**
     * 📦 Prepare all required trading data once only
     */
    async prepareTradeData(userId, tradeType, preloadedUser = null, preloadedSettings = null) {
        const timer = logger.startTimer('prepare_trade_data');
        const startTime = Date.now();
        
        logger.info('Starting trade data preparation', {
            userId,
            tradeType,
            hasPreloadedUser: !!preloadedUser,
            hasPreloadedSettings: !!preloadedSettings,
            timestamp: new Date().toISOString(),
            category: 'trading_transaction'
        });
        
        try {
            // Use preloaded data if available (for speed)
            let user, settings;
            if (preloadedUser && preloadedSettings) {
                user = preloadedUser;
                settings = preloadedSettings;
                
                logger.debug('Using preloaded user and settings data', {
                    userId,
                    userWallet: user?.wallet_address,
                    category: 'trading_performance'
                });
            } else {
                // Fetch basic data in parallel from cache first
                const dataFetchTimer = logger.startTimer('fetch_user_settings_data');
                
                [user, settings] = await Promise.all([
                    this.getCachedUser(userId),
                    this.getCachedSettings(userId)
                ]);
                
                logger.endTimer(dataFetchTimer, 'User and settings data fetched', {
                    userId,
                    userFound: !!user,
                    settingsFound: !!settings,
                    category: 'trading_performance'
                });
            }
            if (!user) {
                logger.error('User not found during trade data preparation', {
                    userId,
                    tradeType,
                    category: 'trading_error'
                });
                throw new Error('User not found');
            }
            
            // Create wallet instance
            const walletTimer = logger.startTimer('create_wallet_instance');
            const wallet = await this.getCachedWallet(userId, user.encrypted_private_key);
            
            if (!wallet) {
                logger.error('Failed to create wallet instance', {
                    userId,
                    walletAddress: user.wallet_address,
                    category: 'trading_error'
                });
                throw new Error('Failed to create wallet instance');
            }
            
            logger.endTimer(walletTimer, 'Wallet instance created successfully', {
                userId,
                walletAddress: user.wallet_address,
                category: 'trading_performance'
            });
            
            // Get MON balance from cache first for speed
            const balanceTimer = logger.startTimer('fetch_mon_balance');
            let balanceData;
            let balanceFromCache = false;
            
            try {
                balanceData = await this.cache.getOrSet('mon_balance', user.wallet_address, async () => {
                    return await this.monorailAPI.getMONBalance(user.wallet_address);
                }, 300); // 5 minutes cache
                balanceFromCache = true;
            } catch (error) {
                logger.warn('Failed to get balance from cache, fetching directly', {
                    userId,
                    walletAddress: user.wallet_address,
                    error: error.message,
                    category: 'trading_warning'
                });
                balanceData = await this.monorailAPI.getMONBalance(user.wallet_address);
                balanceFromCache = false;
            }
            
            logger.endTimer(balanceTimer, 'MON balance fetched', {
                userId,
                walletAddress: user.wallet_address,
                balance: balanceData.balance || '0',
                fromCache: balanceFromCache,
                category: 'trading_performance'
            });
            const tradeData = {
                user,
                settings,
                wallet,
                balance: balanceData.balance || '0',
                walletAddress: user.wallet_address
            };
            
            // Calculated trade settings with logging for verification
            tradeData.effectiveSlippage = this.config.getSlippageValue(tradeType, settings);
            tradeData.effectiveGas = this.config.getGasValue(tradeType, settings);
            
            // Log applied settings for verification
            logger.info('Trade settings applied', {
                userId,
                tradeType,
                effectiveGas: Math.round(tradeData.effectiveGas / 1000000000) + ' Gwei',
                effectiveSlippage: tradeData.effectiveSlippage + '%',
                userGasSetting: settings?.gas_price ? Math.round(settings.gas_price / 1000000000) + ' Gwei' : 'default',
                userSlippageSetting: settings?.slippage_tolerance ? settings.slippage_tolerance + '%' : 'default',
                turboMode: settings?.turbo_mode || false,
                balance: balanceData.balance || '0',
                walletAddress: user.wallet_address,
                category: 'trading_configuration'
            });
            
            const responseTime = Date.now() - startTime;
            this.updateMetrics('prepareTradeData', responseTime);
            
            logger.endTimer(timer, 'Trade data preparation completed successfully', {
                userId,
                tradeType,
                responseTime,
                walletAddress: user.wallet_address,
                balance: balanceData.balance || '0',
                category: 'trading_transaction'
            });
            
            return tradeData;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            logger.error('Failed to prepare trade data', {
                userId,
                tradeType,
                error: error.message,
                stack: error.stack,
                responseTime,
                hasPreloadedUser: !!preloadedUser,
                hasPreloadedSettings: !!preloadedSettings,
                category: 'trading_error'
            });
            
            logger.endTimer(timer, 'Trade data preparation failed', {
                userId,
                tradeType,
                error: error.message,
                responseTime,
                category: 'trading_error'
            });
            
            throw error;
        }
    }
    /**
     * Get user data with permanent caching
     */
    async getCachedUser(userId) {
        const timer = logger.startTimer('get_cached_user');
        
        try {
            const result = await this.cache.getOrSet('user_data', userId, async () => {
                logger.debug('Cache miss for user data, fetching from database', {
                    userId,
                    category: 'cache_performance'
                });
                this.metrics.dbQueries++;
                return await this.database.getUserByTelegramId(userId);
            });
            
            logger.endTimer(timer, 'User data retrieved successfully', {
                userId,
                fromCache: true,
                userFound: !!result,
                category: 'cache_performance'
            });
            
            return result;
        } catch (error) {
            logger.warn('Cache failed for user data, falling back to database', {
                userId,
                error: error.message,
                category: 'cache_warning'
            });
            
            // Fallback to direct database query
            const result = await this.database.getUserByTelegramId(userId);
            
            logger.endTimer(timer, 'User data retrieved from database fallback', {
                userId,
                fromCache: false,
                userFound: !!result,
                category: 'cache_performance'
            });
            
            return result;
        }
    }
    
    /**
     * Get user settings with permanent caching
     */
    async getCachedSettings(userId) {
        const timer = logger.startTimer('get_cached_settings');
        
        try {
            const result = await this.cache.getOrSet('user_settings', userId, async () => {
                logger.debug('Cache miss for user settings, fetching from database', {
                    userId,
                    category: 'cache_performance'
                });
                this.metrics.dbQueries++;
                return await this.database.getUserSettings(userId);
            });
            
            logger.endTimer(timer, 'User settings retrieved successfully', {
                userId,
                fromCache: true,
                settingsFound: !!result,
                category: 'cache_performance'
            });
            
            return result;
        } catch (error) {
            logger.warn('Cache failed for user settings, falling back to database', {
                userId,
                error: error.message,
                category: 'cache_warning'
            });
            
            const result = await this.database.getUserSettings(userId);
            
            logger.endTimer(timer, 'User settings retrieved from database fallback', {
                userId,
                fromCache: false,
                settingsFound: !!result,
                category: 'cache_performance'
            });
            
            return result;
        }
    }
    /**
     * Get wallet instance with security-conscious caching
     */
    async getCachedWallet(userId, encryptedPrivateKey) {
        try {
            // Check if wallet instance is cached (security marker only)
            const cached = await this.cache.get('wallet_instance', userId);
            if (cached) {
                this.metrics.cacheHits++;
            } else {
                this.metrics.cacheMisses++;
                // Mark wallet as cached (security marker, not actual wallet data)
                await this.cache.set('wallet_instance', userId, 'cached');
            }
            // Always fetch fresh wallet instance for security
            return await this.walletManager.getWalletWithProvider(encryptedPrivateKey);
        } catch (error) {
            throw error;
        }
    }
    /**
     * Get MON balance with 5-minute caching
     */
    async getCachedBalance(walletAddress) {
        try {
            return await this.cache.getOrSet('mon_balance', walletAddress, async () => {
                return await this.walletManager.getBalance(walletAddress);
            });
        } catch (error) {
            return await this.walletManager.getBalance(walletAddress);
        }
    }
    /**
     * Get token information with 5-minute caching
     */
    async getCachedTokenInfo(tokenAddress) {
        try {
            return await this.cache.getOrSet('token_info', tokenAddress, async () => {
                return await this.monorailAPI.getTokenInfo(tokenAddress);
            });
        } catch (error) {
            return await this.monorailAPI.getTokenInfo(tokenAddress);
        }
    }
    /**
     * 💱 Get quote (without cache - real-time data)
     */
    async getFreshQuote(fromToken, toToken, amount, senderAddress) {
        try {
            // Quotes are not cached because they change rapidly
            return await this.monorailAPI.getQuote(fromToken, toToken, amount, senderAddress);
        } catch (error) {
            throw error;
        }
    }
    /**
     * Clean cache after successful trading operations
     */
    async postTradeCleanup(userId, walletAddress, result, operationType = 'buy_operation') {
        if (!result || !result.success) {
            return;
        }
        try {
            // Use unified cache invalidation
            await this.cache.invalidateAfterOperation(operationType, userId, walletAddress);
            // Log successful trade
            if (result.txHash) {
                await this.logSuccessfulTrade(userId, result);
            }
        } catch (error) {
            // Don't throw error here as the trade was successful
        }
    }
    /**
     * 📝 Log successful transaction
     */
    async logSuccessfulTrade(userId, result) {
        const timer = logger.startTimer('log_successful_trade');
        
        try {
            logger.info('Starting successful trade logging', {
                userId,
                txHash: result.txHash,
                type: result.type,
                tokenAddress: result.tokenAddress,
                category: 'trading_transaction'
            });
            
            // Get the correct amount based on action type
            let amount = result.amount || result.monAmount || result.tokenAmount;
            // Ensure amount is not null
            if (!amount) {
                amount = '0';
            }
            
            // Calculate total_value - improved logic
            let totalValue = '0';
            if (result.monAmount) {
                totalValue = result.monAmount.toString(); // For buy: MON spent
            } else if (result.monReceived) {
                totalValue = result.monReceived.toString(); // For sell: MON received
            } else if (result.tokenAmount) {
                totalValue = result.tokenAmount.toString(); // Token amount as fallback
            } else if (amount) {
                totalValue = amount.toString(); // Final fallback
            }
            
            const transactionData = {
                txHash: result.txHash,
                type: result.type || 'unknown',
                tokenAddress: result.tokenAddress,
                amount: amount.toString(),
                totalValue: totalValue, // Fixed: use camelCase to match database function
                timestamp: new Date(),
                success: true
            };
            
            logger.debug('Transaction data prepared for database', {
                userId,
                transactionData,
                category: 'trading_transaction'
            });
            
            await this.database.addTransaction(userId, transactionData);
            
            logger.info('Successful trade logged to database', {
                userId,
                txHash: result.txHash,
                type: result.type || 'unknown',
                amount: amount.toString(),
                totalValue: totalValue,
                tokenAddress: result.tokenAddress,
                category: 'trading_transaction'
            });
            
            logger.endTimer(timer, 'Trade logging completed successfully', {
                userId,
                txHash: result.txHash,
                category: 'trading_performance'
            });
            
        } catch (error) {
            logger.error('Failed to log successful trade', {
                userId,
                txHash: result.txHash,
                error: error.message,
                stack: error.stack,
                category: 'trading_error'
            });
            
            logger.endTimer(timer, 'Trade logging failed', {
                userId,
                error: error.message,
                category: 'trading_error'
            });
        }
    }
    /**
     * 🔄 تحديث بيانات المستخدم في الكاش
     */
    async updateCachedUser(userId, userData) {
        const cacheConfig = this.config.getCacheConfig('user_data');
        const key = `${cacheConfig.prefix}${userId}`;
        try {
            await this.redis.set(key, JSON.stringify(userData));
        } catch (error) {
        }
    }
    /**
     * 🔄 تحديث إعدادات المستخدم في الكاش
     */
    async updateCachedSettings(userId, settings) {
        const cacheConfig = this.config.getCacheConfig('user_settings');
        const key = `${cacheConfig.prefix}${userId}`;
        try {
            await this.redis.set(key, JSON.stringify(settings));
        } catch (error) {
        }
    }
    /**
     * 🗑️ حذف بيانات مستخدم من الكاش
     */
    async invalidateUserCache(userId) {
        try {
            const keys = [
                `area51:user:${userId}`,
                `area51:user_settings:${userId}`,
                `area51:wallet_instance:${userId}`,
                `area51:main_menu:${userId}`
            ];
            await Promise.all(keys.map(key => this.redis.del(key)));
        } catch (error) {
        }
    }
    /**
     * 🧹 تنظيف الكاش بعد التداول الناجح
     */
    async cleanCacheAfterTrade(userId, walletAddress) {
        try {
            const keysToDelete = [
                `area51:mon_balance:${walletAddress}`,
                `area51:portfolio:${userId}`,
                `area51:main_menu:${userId}`,
                `area51:user_state:${userId}`
            ];
            let deletedCount = 0;
            for (const key of keysToDelete) {
                try {
                    const result = await this.redis.del(key);
                    if (result > 0) {
                        deletedCount++;
                    }
                } catch (error) {
                }
            }
        } catch (error) {
        }
    }
    /**
     * 📊 تحديث إحصائيات الأداء
     */
    updateMetrics(operation, responseTime) {
        this.metrics.avgResponseTime = 
            (this.metrics.avgResponseTime + responseTime) / 2;
        if (this.monitoring) {
            this.monitoring.logInfo(`TradingDataManager.${operation}`, {
                responseTime,
                cacheHitRate: this.getCacheHitRate()
            });
        }
    }
    /**
     * 📈 الحصول على معدل نجاح الكاش
     */
    getCacheHitRate() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        return total > 0 ? (this.metrics.cacheHits / total * 100).toFixed(2) : 0;
    }
    /**
     * 📊 الحصول على إحصائيات الأداء
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheHitRate: this.getCacheHitRate()
        };
    }
    /**
     * 🔧 اختبار اتصال Redis
     */
    async testRedisConnection() {
        try {
            if (!this.redis) {
                return false;
            }
            // Test Redis connection
            const result = await this.redis.ping();
            return true;
        } catch (error) {
            return false;
        }
    }
}
module.exports = TradingDataManager;
