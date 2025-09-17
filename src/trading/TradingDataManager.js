/**
 * Trading Data Manager - إدارة البيانات والكاش الموحد
 * يدير جميع عمليات الكاش والبيانات للنظام التداول الموحد
 * يستخدم Redis فقط كنظام كاش وحيد
 */

const TradingConfig = require('./TradingConfig');

class TradingDataManager {
    constructor(dependencies) {
        this.redis = dependencies.redis; // Redis فقط كنظام كاش
        this.database = dependencies.database;
        this.monorailAPI = dependencies.monorailAPI;
        this.walletManager = dependencies.walletManager;
        this.monitoring = dependencies.monitoring;
        
        this.config = new TradingConfig();
        
        // إحصائيات الأداء
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
            console.log(`🔄 Preparing trade data for user ${userId}, type: ${tradeType}`);
            
            // استخدام البيانات المحملة مسبقاً إذا كانت متوفرة (للسرعة)
            let user, settings;
            if (preloadedUser && preloadedSettings) {
                user = preloadedUser;
                settings = preloadedSettings;
                console.log(`⚡ Using preloaded data for speed optimization`);
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

            // الحصول على رصيد MON
            const balanceData = await this.monorailAPI.getMONBalance(user.wallet_address);
            
            const tradeData = {
                user,
                settings,
                wallet,
                balance: balanceData.balance || '0',
                walletAddress: user.wallet_address
            };

            // إعدادات التداول المحسوبة
            tradeData.effectiveSlippage = this.config.getSlippageValue(tradeType, settings);
            tradeData.effectiveGas = this.config.getGasValue(tradeType, settings);

            const responseTime = Date.now() - startTime;
            this.updateMetrics('prepareTradeData', responseTime);
            
            console.log(`✅ Trade data prepared in ${responseTime}ms`);
            return tradeData;

        } catch (error) {
            console.error('❌ Error preparing trade data:', error);
            throw error;
        }
    }

    /**
     * 👤 الحصول على بيانات المستخدم (مع كاش دائم)
     */
    async getCachedUser(userId) {
        const cacheConfig = this.config.getCacheConfig('user_data');
        const key = `${cacheConfig.prefix}${userId}`;
        
        try {
            // محاولة الحصول من الكاش أولاً
            const cached = await this.redis.get(key);
            if (cached) {
                this.metrics.cacheHits++;
                return JSON.parse(cached);
            }

            // إذا لم يوجد في الكاش، جلب من قاعدة البيانات
            this.metrics.cacheMisses++;
            this.metrics.dbQueries++;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (user) {
                // حفظ في الكاش بدون TTL (دائماً محفوظ)
                await this.redis.set(key, JSON.stringify(user));
                console.log(`💾 User ${userId} cached permanently`);
            }
            
            return user;

        } catch (error) {
            console.error(`❌ Error getting cached user ${userId}:`, error);
            // fallback إلى قاعدة البيانات مباشرة
            return await this.database.getUser(userId);
        }
    }

    /**
     * ⚙️ الحصول على إعدادات المستخدم (مع كاش دائم)
     */
    async getCachedSettings(userId) {
        const cacheConfig = this.config.getCacheConfig('user_settings');
        const key = `${cacheConfig.prefix}${userId}`;
        
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                this.metrics.cacheHits++;
                return JSON.parse(cached);
            }

            this.metrics.cacheMisses++;
            this.metrics.dbQueries++;
            
            const settings = await this.database.getUserSettings(userId);
            if (settings) {
                // حفظ في الكاش بدون TTL
                await this.redis.set(key, JSON.stringify(settings));
                console.log(`💾 Settings for user ${userId} cached permanently`);
            }
            
            return settings;

        } catch (error) {
            console.error(`❌ Error getting cached settings ${userId}:`, error);
            return await this.database.getUserSettings(userId);
        }
    }

    /**
     * 👛 الحصول على instance المحفظة (مع كاش مؤقت)
     */
    async getCachedWallet(userId, encryptedPrivateKey) {
        const cacheConfig = this.config.getCacheConfig('wallet_instance');
        const key = `${cacheConfig.prefix}${userId}`;
        
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                this.metrics.cacheHits++;
                // إرجاع wallet instance من الكاش
                return await this.walletManager.getWalletWithProvider(encryptedPrivateKey);
            }

            this.metrics.cacheMisses++;
            
            const wallet = await this.walletManager.getWalletWithProvider(encryptedPrivateKey);
            if (wallet) {
                // حفظ مؤشر في الكاش (ليس الـ wallet نفسه لأسباب أمنية)
                if (this.redis.setex) {
                    await this.redis.setex(key, 3600, 'cached'); // ساعة واحدة
                } else {
                    await this.redis.set(key, 'cached', 'EX', 3600);
                }
                console.log(`💾 Wallet instance for user ${userId} marked as cached`);
            }
            
            return wallet;

        } catch (error) {
            console.error(`❌ Error getting cached wallet ${userId}:`, error);
            throw error;
        }
    }

    /**
     * 💰 الحصول على رصيد MON (مع كاش قصير المدى)
     */
    async getCachedBalance(walletAddress) {
        const cacheConfig = this.config.getCacheConfig('mon_balance');
        const key = `${cacheConfig.prefix}${walletAddress}`;
        
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                this.metrics.cacheHits++;
                return JSON.parse(cached);
            }

            this.metrics.cacheMisses++;
            
            const balance = await this.walletManager.getBalance(walletAddress);
            if (balance !== null) {
                // حفظ في الكاش لمدة 30 ثانية
                if (this.redis.setex) {
                    await this.redis.setex(key, cacheConfig.ttl, JSON.stringify(balance));
                } else {
                    // Fallback for different Redis clients
                    await this.redis.set(key, JSON.stringify(balance), 'EX', cacheConfig.ttl);
                }
                console.log(`💾 Balance for ${walletAddress} cached for ${cacheConfig.ttl}s`);
            }
            
            return balance;

        } catch (error) {
            console.error(`❌ Error getting cached balance ${walletAddress}:`, error);
            return await this.walletManager.getBalance(walletAddress);
        }
    }

    /**
     * 🪙 الحصول على معلومات العملة (مع كاش متوسط المدى)
     */
    async getCachedTokenInfo(tokenAddress) {
        const cacheConfig = this.config.getCacheConfig('token_info');
        const key = `${cacheConfig.prefix}${tokenAddress}`;
        
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                this.metrics.cacheHits++;
                return JSON.parse(cached);
            }

            this.metrics.cacheMisses++;
            
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            if (tokenInfo && tokenInfo.success) {
                // حفظ في الكاش لمدة 5 دقائق
                if (this.redis.setex) {
                    await this.redis.setex(key, cacheConfig.ttl, JSON.stringify(tokenInfo));
                } else {
                    await this.redis.set(key, JSON.stringify(tokenInfo), 'EX', cacheConfig.ttl);
                }
                console.log(`💾 Token info for ${tokenAddress} cached for ${cacheConfig.ttl}s`);
            }
            
            return tokenInfo;

        } catch (error) {
            console.error(`❌ Error getting cached token info ${tokenAddress}:`, error);
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
            console.error('❌ Error getting fresh quote:', error);
            throw error;
        }
    }

    /**
     * 🧹 تنظيف الكاش بعد التداول الناجح
     */
    async postTradeCleanup(userId, walletAddress, result) {
        if (!result || !result.success) {
            return; // لا تنظف الكاش إذا فشلت المعاملة
        }

        try {
            console.log(`🧹 Cleaning cache after successful trade for user ${userId}`);
            
            // قائمة المفاتيح التي تحتاج تنظيف
            const keysToDelete = [
                `area51:balance:${walletAddress}`,      // رصيد MON
                `area51:portfolio:${walletAddress}`,    // محفظة العملات
                `area51:main_menu:${userId}`,           // القائمة الرئيسية
                `area51:gas:network`                    // أسعار الـ gas
            ];
            
            // حذف المفاتيح بالتوازي
            await Promise.all(keysToDelete.map(key => this.redis.del(key)));
            
            console.log(`✅ Cache cleaned for ${keysToDelete.length} keys`);
            
            // تسجيل المعاملة في قاعدة البيانات
            if (result.txHash) {
                await this.logSuccessfulTrade(userId, result);
            }

        } catch (error) {
            console.error('❌ Error during post-trade cleanup:', error);
            // لا نرمي خطأ هنا لأن المعاملة نجحت
        }
    }

    /**
     * 📝 تسجيل المعاملة الناجحة
     */
    async logSuccessfulTrade(userId, result) {
        try {
            console.log('🔍 Logging trade result:', JSON.stringify(result, null, 2));
            
            // Get the correct amount based on action type
            let amount = result.amount || result.monAmount || result.tokenAmount;
            
            // Ensure amount is not null
            if (!amount) {
                console.warn('⚠️ No amount found in result, using 0');
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
            
            console.log(`💾 Saving transaction: amount=${amount}, total_value=${totalValue}`);
            
            await this.database.addTransaction(userId, {
                txHash: result.txHash,
                type: result.type || 'unknown',
                tokenAddress: result.tokenAddress,
                amount: amount.toString(),
                total_value: totalValue,
                timestamp: new Date(),
                success: true
            });
        } catch (error) {
            console.error('❌ Error logging successful trade:', error);
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
            console.log(`🔄 User ${userId} data updated in cache`);
        } catch (error) {
            console.error(`❌ Error updating cached user ${userId}:`, error);
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
            console.log(`🔄 Settings for user ${userId} updated in cache`);
        } catch (error) {
            console.error(`❌ Error updating cached settings ${userId}:`, error);
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
            console.log(`🗑️ Cache invalidated for user ${userId}`);
        } catch (error) {
            console.error(`❌ Error invalidating cache for user ${userId}:`, error);
        }
    }

    /**
     * 🧹 تنظيف الكاش بعد التداول الناجح
     */
    async cleanCacheAfterTrade(userId, walletAddress) {
        try {
            const keysToDelete = [
                `area51:wallet_balance:${walletAddress}`,
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
                    console.warn(`⚠️ Could not delete cache key ${key}:`, error.message);
                }
            }
            
            console.log(`🧹 Cleaning cache after successful trade for user ${userId}`);
            console.log(`✅ Cache cleaned for ${deletedCount} keys`);
            
        } catch (error) {
            console.error('❌ Error cleaning cache after trade:', error);
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
                console.warn('⚠️ Redis client not initialized');
                return false;
            }
            
            // Test Redis connection
            const result = await this.redis.ping();
            console.log('✅ Redis connection test successful:', result);
            return true;
        } catch (error) {
            console.error('❌ Redis connection test failed:', error);
            return false;
        }
    }
}

module.exports = TradingDataManager;
