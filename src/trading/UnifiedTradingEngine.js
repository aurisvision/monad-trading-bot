/**
 * Unified Trading Engine - المحرك الموحد للتداول
 * نقطة دخول موحدة لجميع أنواع التداول (Normal, Turbo, Auto Buy)
 * يحل محل جميع محركات التداول القديمة
 */

const TradingDataManager = require('./TradingDataManager');
const TradingConfig = require('./TradingConfig');

class UnifiedTradingEngine {
    constructor(dependencies) {
        this.dataManager = new TradingDataManager(dependencies);
        this.config = new TradingConfig();
        this.monorailAPI = dependencies.monorailAPI;
        this.walletManager = dependencies.walletManager;
        this.database = dependencies.database;
        this.monitoring = dependencies.monitoring;
        
        // إحصائيات الأداء
        this.stats = {
            totalTrades: 0,
            successfulTrades: 0,
            failedTrades: 0,
            avgExecutionTime: 0,
            tradesByType: {
                normal: 0,
                turbo: 0,
                auto: 0
            }
        };
    }

    /**
     * 🎯 نقطة الدخول الموحدة لجميع أنواع التداول
     */
    async executeTrade(request) {
        const startTime = Date.now();
        const { type, action, userId, tokenAddress, amount, ctx } = request;
        
        try {
            console.log(`🚀 Starting ${type} ${action} trade for user ${userId}`);
            
            // التحقق من صحة نوع التداول
            if (!this.config.isValidTradeType(type)) {
                throw new Error(`نوع التداول غير صحيح: ${type}`);
            }

            // 1️⃣ تحضير البيانات مرة واحدة فقط
            const tradeData = await this.dataManager.prepareTradeData(userId, type);
            
            // 2️⃣ تنفيذ التداول حسب النوع والإجراء
            let result;
            if (action === 'buy') {
                result = await this.executeBuyByType(type, tradeData, tokenAddress, amount);
            } else if (action === 'sell') {
                result = await this.executeSellByType(type, tradeData, tokenAddress, amount);
            } else {
                throw new Error(`إجراء غير صحيح: ${action}`);
            }
            
            // 3️⃣ تنظيف الكاش بعد التداول الناجح
            if (result.success) {
                await this.dataManager.postTradeCleanup(userId, tradeData.user.wallet_address, result);
            }
            
            // 4️⃣ تحديث الإحصائيات
            const executionTime = Date.now() - startTime;
            this.updateStats(type, result.success, executionTime);
            
            // إضافة معلومات إضافية للنتيجة
            result.executionTime = executionTime;
            result.type = type;
            result.action = action;
            
            console.log(`${result.success ? '✅' : '❌'} ${type} ${action} completed in ${executionTime}ms`);
            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.updateStats(type, false, executionTime);
            
            console.error(`❌ ${type} ${action} failed:`, error);
            
            return {
                success: false,
                error: error.message,
                type,
                action,
                executionTime
            };
        }
    }

    /**
     * 💰 تنفيذ عمليات الشراء حسب النوع
     */
    async executeBuyByType(type, tradeData, tokenAddress, amount) {
        switch(type) {
            case 'normal':
                return await this.executeNormalBuy(tradeData, tokenAddress, amount);
            case 'turbo':
                return await this.executeTurboBuy(tradeData, tokenAddress, amount);
            case 'auto':
                return await this.executeAutoBuy(tradeData, tokenAddress, amount);
            default:
                throw new Error(`نوع شراء غير مدعوم: ${type}`);
        }
    }

    /**
     * 💸 تنفيذ عمليات البيع حسب النوع
     */
    async executeSellByType(type, tradeData, tokenAddress, amount) {
        switch(type) {
            case 'normal':
                return await this.executeNormalSell(tradeData, tokenAddress, amount);
            case 'turbo':
                return await this.executeTurboSell(tradeData, tokenAddress, amount);
            default:
                throw new Error(`نوع بيع غير مدعوم: ${type}`);
        }
    }

    /**
     * 🔵 الشراء العادي - مع جميع الفحوصات الأمنية
     */
    async executeNormalBuy(tradeData, tokenAddress, amount) {
        try {
            console.log(`🔵 Executing normal buy: ${amount} MON for token ${tokenAddress}`);
            
            // فحوصات الأمان والحصول على معلومات العملة بالتوازي للسرعة
            const [tokenInfo] = await Promise.all([
                this.dataManager.getCachedTokenInfo(tokenAddress),
                this.validateNormalTrade(tradeData, tokenAddress, amount)
            ]);
            
            if (!tokenInfo || !tokenInfo.success) {
                throw new Error(this.config.getErrorMessage('INVALID_TOKEN'));
            }
            
            // لا نحتاج quote منفصل - سيتم الحصول عليه في buyToken
            
            // تنفيذ المعاملة
            const swapResult = await this.monorailAPI.buyToken(
                tradeData.wallet,
                tokenAddress,
                amount,
                tradeData.effectiveSlippage,
                { gasPrice: tradeData.effectiveGas }
            );
            
            if (!swapResult.success) {
                throw new Error(`فشل في تنفيذ المعاملة: ${swapResult.error}`);
            }
            
            return {
                success: true,
                action: 'buy',
                txHash: swapResult.txHash,
                tokenSymbol: tokenInfo.token.symbol,
                tokenAddress: tokenAddress,
                monAmount: amount,
                expectedTokenAmount: swapResult.expectedOutput || 'N/A',
                priceImpact: swapResult.priceImpact || 'N/A',
                gasUsed: swapResult.receipt?.gasUsed?.toString(),
                effectiveGasPrice: swapResult.receipt?.effectiveGasPrice?.toString()
            };

        } catch (error) {
            console.error('❌ Normal buy failed:', error);
            throw error;
        }
    }

    /**
     * 🟡 التيربو شراء - سرعة قصوى بدون فحوصات
     */
    async executeTurboBuy(tradeData, tokenAddress, amount) {
        try {
            console.log(`🟡 Executing turbo buy: ${amount} MON for token ${tokenAddress}`);
            
            // تنفيذ مباشر بدون فحوصات (للسرعة القصوى)
            const swapResult = await this.monorailAPI.executeSwapTurbo(
                tradeData.wallet,
                tokenAddress,
                amount,
                20, // 20% slippage ثابت
                tradeData.wallet.address
            );
            
            if (!swapResult.success) {
                throw new Error(`فشل في تنفيذ التيربو: ${swapResult.error}`);
            }
            
            return {
                success: true,
                action: 'buy',
                txHash: swapResult.txHash,
                tokenAddress: tokenAddress,
                monAmount: amount,
                mode: 'turbo',
                slippage: 20
            };

        } catch (error) {
            console.error('❌ Turbo buy failed:', error);
            throw error;
        }
    }

    /**
     * 🟢 الشراء التلقائي - بإعدادات منفصلة
     */
    async executeAutoBuy(tradeData, tokenAddress, amount) {
        try {
            console.log(`🟢 Executing auto buy: ${amount} MON for token ${tokenAddress}`);
            
            // فحص تفعيل الشراء التلقائي
            if (!tradeData.settings.auto_buy_enabled) {
                throw new Error(this.config.getErrorMessage('AUTO_BUY_DISABLED'));
            }
            
            // استخدام كمية الشراء التلقائي من الإعدادات
            const autoBuyAmount = tradeData.settings.auto_buy_amount || amount;
            
            // فحص الرصيد
            const security = this.config.getSecurityConfig();
            const requiredAmount = parseFloat(autoBuyAmount);
            const availableBalance = parseFloat(tradeData.balance) - security.gasBuffer;
            
            if (availableBalance < requiredAmount) {
                throw new Error(this.config.getErrorMessage('INSUFFICIENT_BALANCE'));
            }
            
            // تنفيذ المعاملة بإعدادات الشراء التلقائي
            const swapResult = await this.monorailAPI.buyToken(
                tradeData.wallet,
                tokenAddress,
                autoBuyAmount,
                tradeData.effectiveSlippage,
                { gasPrice: tradeData.effectiveGas }
            );
            
            if (!swapResult.success) {
                throw new Error(`فشل في الشراء التلقائي: ${swapResult.error}`);
            }
            
            return {
                success: true,
                action: 'buy',
                txHash: swapResult.txHash,
                tokenAddress: tokenAddress,
                monAmount: autoBuyAmount,
                mode: 'auto',
                slippage: tradeData.effectiveSlippage
            };

        } catch (error) {
            console.error('❌ Auto buy failed:', error);
            throw error;
        }
    }

    /**
     * 🔵 البيع العادي
     */
    async executeNormalSell(tradeData, tokenAddress, tokenAmount) {
        try {
            console.log(`🔵 Executing normal sell: ${tokenAmount} tokens of ${tokenAddress}`);
            
            // فحوصات الأمان للبيع
            await this.validateSellTrade(tradeData, tokenAddress, tokenAmount);
            
            // تعديل الكمية للبيع - بيع 99.5% بدلاً من 100% لتجنب مشاكل الكسور
            let adjustedAmount = tokenAmount;
            const numAmount = parseFloat(tokenAmount);
            if (numAmount > 0) {
                adjustedAmount = (numAmount * 0.995).toString(); // بيع 99.5%
                console.log(`💡 Adjusted sell amount from ${tokenAmount} to ${adjustedAmount} (99.5%)`);
            }
            
            // تنفيذ البيع مع معالجة أفضل للأخطاء
            const swapResult = await this.monorailAPI.sellTokenOptimized(
                tradeData.wallet,
                tokenAddress,
                adjustedAmount,
                tradeData.effectiveSlippage,
                { gasPrice: tradeData.effectiveGas }
            );
            
            if (!swapResult.success) {
                // تحسين رسالة الخطأ
                let errorMessage = swapResult.error || 'Unknown error';
                if (errorMessage.includes('transaction execution reverted')) {
                    errorMessage = 'Transaction reverted - possible reasons:\n1. Insufficient token balance\n2. Token not approved for spending\n3. Slippage too low\n4. Liquidity issues\n5. Invalid token pair';
                }
                throw new Error(`Sell execution failed: ${errorMessage}`);
            }
            
            return {
                success: true,
                action: 'sell',
                txHash: swapResult.txHash,
                tokenAddress: tokenAddress,
                tokenAmount: tokenAmount,
                monReceived: swapResult.expectedOutput || swapResult.outputAmount || '0',
                gasUsed: swapResult.receipt?.gasUsed?.toString(),
                effectiveGasPrice: swapResult.receipt?.effectiveGasPrice?.toString()
            };

        } catch (error) {
            console.error('❌ Normal sell failed:', error);
            throw error;
        }
    }

    /**
     * 🟡 التيربو بيع
     */
    async executeTurboSell(tradeData, tokenAddress, tokenAmount) {
        try {
            console.log(`🟡 Executing turbo sell: ${tokenAmount} tokens of ${tokenAddress}`);
            
            // بيع مباشر بدون فحوصات
            const swapResult = await this.monorailAPI.sellTokenOptimized(
                tradeData.wallet,
                tokenAddress,
                tokenAmount,
                20, // 20% slippage ثابت
                { gasPrice: 100000000000 } // 100 Gwei ثابت
            );
            
            if (!swapResult.success) {
                throw new Error(`فشل في تنفيذ التيربو بيع: ${swapResult.error}`);
            }
            
            return {
                success: true,
                action: 'sell',
                txHash: swapResult.txHash,
                tokenAddress: tokenAddress,
                tokenAmount: tokenAmount,
                monReceived: swapResult.expectedOutput || swapResult.outputAmount || '0',
                mode: 'turbo',
                slippage: 20
            };

        } catch (error) {
            console.error('❌ Turbo sell failed:', error);
            throw error;
        }
    }

    /**
     * ✅ فحوصات الأمان للتداول العادي
     */
    async validateNormalTrade(tradeData, tokenAddress, amount) {
        const security = this.config.getSecurityConfig();
        
        // فحص صحة عنوان العملة
        if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
            throw new Error(this.config.getErrorMessage('INVALID_TOKEN'));
        }
        
        // فحص صحة الكمية
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            throw new Error(this.config.getErrorMessage('INVALID_AMOUNT'));
        }
        
        // فحص الحد الأقصى للمعاملة
        if (numAmount > security.maxTransactionAmount) {
            throw new Error(`الكمية تتجاوز الحد الأقصى: ${security.maxTransactionAmount} MON`);
        }
        
        // فحص الرصيد
        const requiredAmount = numAmount + security.gasBuffer;
        const availableBalance = parseFloat(tradeData.balance);
        
        if (availableBalance < requiredAmount) {
            throw new Error(
                `${this.config.getErrorMessage('INSUFFICIENT_BALANCE')}\n` +
                `المطلوب: ${requiredAmount.toFixed(4)} MON\n` +
                `المتاح: ${availableBalance.toFixed(4)} MON`
            );
        }
        
        // فحص الحد الأدنى للرصيد
        if (availableBalance < security.minBalance) {
            throw new Error(`الرصيد أقل من الحد الأدنى: ${security.minBalance} MON`);
        }
    }

    /**
     * ✅ فحوصات الأمان للبيع
     */
    async validateSellTrade(tradeData, tokenAddress, tokenAmount) {
        // فحص صحة عنوان العملة
        if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
            throw new Error(this.config.getErrorMessage('INVALID_TOKEN'));
        }
        
        // فحص صحة الكمية
        const numAmount = parseFloat(tokenAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            throw new Error(this.config.getErrorMessage('INVALID_AMOUNT'));
        }
        
        // فحص وجود رصيد كافي من MON للـ gas
        const security = this.config.getSecurityConfig();
        const monBalance = parseFloat(tradeData.balance);
        
        if (monBalance < security.gasBuffer) {
            throw new Error(`رصيد MON غير كافي لرسوم الشبكة. المطلوب: ${security.gasBuffer} MON`);
        }
    }

    /**
     * 📊 تحديث إحصائيات الأداء
     */
    updateStats(type, success, executionTime) {
        this.stats.totalTrades++;
        
        if (success) {
            this.stats.successfulTrades++;
        } else {
            this.stats.failedTrades++;
        }
        
        this.stats.tradesByType[type] = (this.stats.tradesByType[type] || 0) + 1;
        this.stats.avgExecutionTime = 
            (this.stats.avgExecutionTime + executionTime) / 2;
        
        // تسجيل في نظام المراقبة
        if (this.monitoring) {
            this.monitoring.logInfo('UnifiedTradingEngine.trade', {
                type,
                success,
                executionTime,
                totalTrades: this.stats.totalTrades,
                successRate: this.getSuccessRate()
            });
        }
    }

    /**
     * 📈 الحصول على معدل النجاح
     */
    getSuccessRate() {
        if (this.stats.totalTrades === 0) return 0;
        return (this.stats.successfulTrades / this.stats.totalTrades * 100).toFixed(2);
    }

    /**
     * 📊 الحصول على إحصائيات مفصلة
     */
    getDetailedStats() {
        return {
            ...this.stats,
            successRate: this.getSuccessRate(),
            dataManagerMetrics: this.dataManager.getMetrics()
        };
    }

    /**
     * 🔧 اختبار النظام
     */
    async healthCheck() {
        try {
            // اختبار اتصال Redis
            const redisOk = await this.dataManager.testRedisConnection();
            
            // اختبار اتصال قاعدة البيانات
            const dbOk = await this.database.testConnection();
            
            return {
                status: redisOk && dbOk ? 'healthy' : 'unhealthy',
                redis: redisOk,
                database: dbOk,
                stats: this.getDetailedStats()
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }
}

module.exports = UnifiedTradingEngine;
