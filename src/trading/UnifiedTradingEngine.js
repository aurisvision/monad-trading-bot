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
                turbo: 0
            }
        };
    }
    /**
     * 🎯 نقطة الدخول الموحدة لجميع أنواع التداول
     */
    async executeTrade(request) {
        const startTime = Date.now();
        const { type, action, userId, tokenAddress, amount, ctx, preloadedUser, preloadedSettings } = request;
        try {
            // التحقق من صحة نوع التداول
            if (!this.config.isValidTradeType(type)) {
                throw new Error(`Invalid trade type: ${type}`);
            }
            // 1️⃣ تحضير البيانات مرة واحدة فقط (مع استخدام البيانات المحملة مسبقاً للسرعة)
            const tradeData = await this.dataManager.prepareTradeData(userId, type, preloadedUser, preloadedSettings);
            // 2️⃣ تنفيذ التداول حسب النوع والإجراء
            let result;
            if (action === 'buy') {
                result = await this.executeBuyByType(type, tradeData, tokenAddress, amount);
            } else if (action === 'sell') {
                result = await this.executeSellByType(type, tradeData, tokenAddress, amount);
            } else {
                throw new Error(`Invalid action: ${action}`);
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
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.updateStats(type, false, executionTime);
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
        switch (type) {
            case 'normal':
                return await this.executeNormalBuy(tradeData, tokenAddress, amount);
            case 'turbo':
                return await this.executeTurboBuy(tradeData, tokenAddress, amount);
            default:
                throw new Error(`Unsupported buy type: ${type}`);
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
                throw new Error(`Unsupported sell type: ${type}`);
        }
    }
    /**
     * 🔵 الشراء العادي - مع جميع الفحوصات الأمنية
     */
    async executeNormalBuy(tradeData, tokenAddress, amount) {
        try {
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
                // تحسين رسالة الخطأ لتكون مهذبة وواضحة
                let userFriendlyError = this.getUserFriendlyError(swapResult.error);
                throw new Error(userFriendlyError);
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
            throw error;
        }
    }
    /**
     * 🟡 التيربو شراء - سرعة قصوى بدون فحوصات
     */
    async executeTurboBuy(tradeData, tokenAddress, amount) {
        try {
            // تنفيذ مباشر بدون فحوصات (للسرعة القصوى)
            const swapResult = await this.monorailAPI.executeSwapTurbo(
                tradeData.wallet,
                tokenAddress,
                amount,
                20, // 20% slippage ثابت
                tradeData.wallet.address
            );
            if (!swapResult.success) {
                throw new Error(`Turbo execution failed: ${swapResult.error}`);
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
            throw error;
        }
    }
    /**
     * 🔵 البيع العادي
     */
    async executeNormalSell(tradeData, tokenAddress, tokenAmount) {
        try {
            // فحوصات الأمان للبيع
            await this.validateSellTrade(tradeData, tokenAddress, tokenAmount);
            // تعديل الكمية للبيع - بيع 99.5% بدلاً من 100% لتجنب مشاكل الكسور
            let adjustedAmount = tokenAmount;
            const numAmount = parseFloat(tokenAmount);
            if (numAmount > 0) {
                adjustedAmount = (numAmount * 0.995).toString(); // بيع 99.5%
                console.log('📉 Adjusted sell amount to 99.5% to avoid precision issues');
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
                // تحسين رسالة الخطأ لتكون مهذبة وواضحة
                let userFriendlyError = this.getUserFriendlyError(swapResult.error);
                throw new Error(userFriendlyError);
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
            throw error;
        }
    }
    /**
     * 🟡 التيربو بيع
     */
    async executeTurboSell(tradeData, tokenAddress, tokenAmount) {
        try {
            // بيع مباشر بدون فحوصات
            const swapResult = await this.monorailAPI.sellTokenOptimized(
                tradeData.wallet,
                tokenAddress,
                tokenAmount,
                20, // 20% slippage ثابت
                { gasPrice: 100000000000 } // 100 Gwei ثابت
            );
            if (!swapResult.success) {
                throw new Error('Turbo sell failed: ' + swapResult.error);
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
            throw new Error('Amount exceeds maximum limit: ' + security.maxTransactionAmount + ' MON');
        }
        // فحص الرصيد
        const requiredAmount = numAmount + security.gasBuffer;
        const availableBalance = parseFloat(tradeData.balance);
        if (availableBalance < requiredAmount) {
            throw new Error(
                this.config.getErrorMessage('INSUFFICIENT_BALANCE') + '\n' +
                'Required: ' + requiredAmount.toFixed(4) + ' MON\n' +
                'Available: ' + availableBalance.toFixed(4) + ' MON'
            );
        }
        // فحص الحد الأدنى للرصيد
        if (availableBalance < security.minBalance) {
            throw new Error('Balance below minimum required: ' + security.minBalance + ' MON');
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
            throw new Error('Insufficient MON balance for network fees. Required: ' + security.gasBuffer + ' MON');
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

    /**
     * 📝 تحويل رسائل الخطأ التقنية إلى رسائل مهذبة وواضحة للمستخدم
     */
    getUserFriendlyError(error) {
        if (!error) return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى';
        
        const errorStr = error.toString().toLowerCase();
        
        if (errorStr.includes('transaction reverted')) {
            return '❌ فشلت المعاملة على البلوك تشين\n\nالأسباب المحتملة:\n• رصيد غير كافي\n• سعر الغاز منخفض\n• مشكلة في السيولة\n\nيرجى المحاولة مرة أخرى';
        }
        
        if (errorStr.includes('insufficient balance') || errorStr.includes('insufficient funds')) {
            return '❌ الرصيد غير كافي\n\nيرجى التأكد من وجود رصيد كافي في محفظتك والمحاولة مرة أخرى';
        }
        
        if (errorStr.includes('slippage') || errorStr.includes('price impact')) {
            return '❌ تغير السعر بشكل كبير\n\nيرجى زيادة نسبة الـ Slippage أو المحاولة مرة أخرى';
        }
        
        if (errorStr.includes('gas')) {
            return '❌ مشكلة في رسوم الشبكة\n\nيرجى زيادة سعر الغاز والمحاولة مرة أخرى';
        }
        
        if (errorStr.includes('network') || errorStr.includes('connection')) {
            return '❌ مشكلة في الاتصال بالشبكة\n\nيرجى المحاولة مرة أخرى بعد قليل';
        }
        
        // رسالة عامة للأخطاء غير المعروفة
        return '❌ حدث خطأ أثناء تنفيذ المعاملة\n\nيرجى المحاولة مرة أخرى أو التواصل مع الدعم إذا استمرت المشكلة';
    }
}
module.exports = UnifiedTradingEngine;