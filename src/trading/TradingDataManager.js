/**
 * Trading Data Manager - Unified Data and Cache Management
 * Manages all cache and data operations for the unified trading system
 * Uses UnifiedCacheManager for consistent Redis-only caching
 */
const TradingConfig = require('./TradingConfig');
const UnifiedCacheManager = require('../services/UnifiedCacheManager');
class TradingDataManager {
    constructor(dependencies) {
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
    }
    /**
     * 📦 تحضير جميع البيانات المطلوبة للتداول مرة واحدة فقط
     */
    async prepareTradeData(userId, tradeType, preloadedUser = null, preloadedSettings = null) {
        const startTime = Date.now();
        try {
            // استخدام البيانات المحملة مسبقاً إذا كانت متوفرة (للسرعة)
            let user, settings;
            if (preloadedUser && preloadedSettings) {
                user = preloadedUser;
                settings = preloadedSettings;
            } else {
                // جلب البيانات الأساسية بالتوازي من الكاش أولاً
                [user, settings] = await Promise.all([
                    this.getCachedUser(userId),
                    this.getCachedSettings(userId)
                ]);
            }
            if (!user) {
                throw new Error('User not found');
            }
            // إنشاء wallet instance
            const wallet = await this.getCachedWallet(userId, user.encrypted_private_key);
            if (!wallet) {
                throw new Error('Failed to create wallet instance');
            }
            // الحصول على رصيد MON من الكاش أولاً للسرعة
            let balanceData;
            try {
                balanceData = await this.cache.getOrSet('mon_balance', user.wallet_address, async () => {
                    return await this.monorailAPI.getMONBalance(user.wallet_address);
                }, 300); // 5 minutes cache
            } catch (error) {
                balanceData = await this.monorailAPI.getMONBalance(user.wallet_address);
            }
            const tradeData = {
                user,
                settings,
                wallet,
                balance: balanceData.balance || '0',
                walletAddress: user.wallet_address
            };
            // إعدادات التداول المحسوبة مع تسجيل للتأكد
            tradeData.effectiveSlippage = this.config.getSlippageValue(tradeType, settings);
            tradeData.effectiveGas = this.config.getGasValue(tradeType, settings);
            // تسجيل الإعدادات المطبقة للتأكد
            } Gwei`,
                effectiveSlippage: `${tradeData.effectiveSlippage}%`,
                userGasSetting: settings?.gas_price ? `${Math.round(settings.gas_price / 1000000000)} Gwei` : 'default',
                userSlippageSetting: settings?.slippage_tolerance ? `${settings.slippage_tolerance}%` : 'default',
                turboMode: settings?.turbo_mode || false
            });
            const responseTime = Date.now() - startTime;
            this.updateMetrics('prepareTradeData', responseTime);
            return tradeData;
        } catch (error) {
            throw error;
        }
    }
    /**
     * Get user data with permanent caching
     */
    async getCachedUser(userId) {
        try {
            return await this.cache.getOrSet('user_data', userId, async () => {
                this.metrics.dbQueries++;
                return await this.database.getUserByTelegramId(userId);
            });
        } catch (error) {
            // Fallback to direct database query
            return await this.database.getUserByTelegramId(userId);
        }
    }
    /**
     * Get user settings with permanent caching
     */
    async getCachedSettings(userId) {
        try {
            return await this.cache.getOrSet('user_settings', userId, async () => {
                this.metrics.dbQueries++;
                return await this.database.getUserSettings(userId);
            });
        } catch (error) {
            return await this.database.getUserSettings(userId);
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
     * 💱 الحصول على quote (بدون كاش - بيانات فورية)
     */
    async getFreshQuote(fromToken, toToken, amount, senderAddress) {
        try {
            // الـ quotes لا تُحفظ في الكاش لأنها تتغير بسرعة
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
     * 📝 تسجيل المعاملة الناجحة
     */
    async logSuccessfulTrade(userId, result) {
        try {
            );
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
            await this.database.addTransaction(userId, {
                txHash: result.txHash,
                type: result.type || 'unknown',
                tokenAddress: result.tokenAddress,
                amount: amount.toString(),
                totalValue: totalValue, // Fixed: use camelCase to match database function
                timestamp: new Date(),
                success: true
            });
        } catch (error) {
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