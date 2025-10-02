/**
 * Unified Trading Engine - Core Trading System
 * Unified entry point for all trading types (Normal, Turbo, Auto Buy)
 * Replaces all legacy trading engines
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
        // Performance statistics
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
     * 🎯 Unified entry point for all trading types
     */
    async executeTrade(request) {
        const startTime = Date.now();
        const { type, action, userId, tokenAddress, amount, ctx, preloadedUser, preloadedSettings } = request;
        try {
            // Validate trade type
            if (!this.config.isValidTradeType(type)) {
                throw new Error(`Invalid trade type: ${type}`);
            }
            // 1️⃣ Prepare data once only (using preloaded data for speed)
            const tradeData = await this.dataManager.prepareTradeData(userId, type, preloadedUser, preloadedSettings);
            // 2️⃣ Execute trade by type and action
            let result;
            if (action === 'buy') {
                result = await this.executeBuyByType(type, tradeData, tokenAddress, amount);
            } else if (action === 'sell') {
                result = await this.executeSellByType(type, tradeData, tokenAddress, amount);
            } else {
                throw new Error(`Invalid action: ${action}`);
            }
            // 3️⃣ Clean cache after successful trade
            if (result.success) {
                await this.dataManager.postTradeCleanup(userId, tradeData.user.wallet_address, result);
            }
            // 4️⃣ Update statistics
            const executionTime = Date.now() - startTime;
            this.updateStats(type, result.success, executionTime);
            // Add additional information to result
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
     * 💰 Execute buy operations by type
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
     * Execute sell operations by type
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
     * Normal buy execution - with all security checks
     */
    async executeNormalBuy(tradeData, tokenAddress, amount) {
        try {
            // Security checks and token info retrieval in parallel for speed
            const [tokenInfo] = await Promise.all([
                this.dataManager.getCachedTokenInfo(tokenAddress),
                this.validateNormalTrade(tradeData, tokenAddress, amount)
            ]);
            if (!tokenInfo || !tokenInfo.success) {
                throw new Error(this.config.getErrorMessage('INVALID_TOKEN'));
            }
            // No separate quote needed - will be obtained in buyToken
            // Execute transaction
            const swapResult = await this.monorailAPI.buyToken(
                tradeData.wallet,
                tokenAddress,
                amount,
                tradeData.effectiveSlippage,
                { gasPrice: tradeData.effectiveGas }
            );
            if (!swapResult.success) {
                // Enhanced error handling
                throw new Error(`Transaction failed: ${swapResult.error}`);
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
     * Turbo buy execution - maximum speed with minimal checks
     */
    async executeTurboBuy(tradeData, tokenAddress, amount) {
        try {
            // Direct execution without extensive validation for maximum speed
            const swapResult = await this.monorailAPI.executeSwapTurbo(
                tradeData.wallet,
                tokenAddress,
                amount,
                20, // Fixed 20% slippage for turbo mode
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
     * Normal sell execution
     */
    async executeNormalSell(tradeData, tokenAddress, tokenAmount) {
        try {
            // Security checks for sell operation
            await this.validateSellTrade(tradeData, tokenAddress, tokenAmount);
            // Adjust sell amount - sell 99.5% instead of 100% to avoid precision issues
            let adjustedAmount = tokenAmount;
            const numAmount = parseFloat(tokenAmount);
            if (numAmount > 0) {
                adjustedAmount = (numAmount * 0.995).toString(); // Sell 99.5%
                console.log('📉 Adjusted sell amount to 99.5% to avoid precision issues');
            }
            // Execute sell with enhanced error handling
            const swapResult = await this.monorailAPI.sellTokenOptimized(
                tradeData.wallet,
                tokenAddress,
                adjustedAmount,
                tradeData.effectiveSlippage,
                { gasPrice: tradeData.effectiveGas }
            );
            if (!swapResult.success) {
                // Enhanced error handling
                throw new Error(`Transaction failed: ${swapResult.error}`);
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
     * Turbo sell execution - maximum speed with minimal checks
     */
    async executeTurboSell(tradeData, tokenAddress, tokenAmount) {
        try {
            // Direct sell without extensive validation
            const swapResult = await this.monorailAPI.sellTokenOptimized(
                tradeData.wallet,
                tokenAddress,
                tokenAmount,
                20, // Fixed 20% slippage for turbo mode
                { 
                    gasPrice: 100000000000, // Fixed 100 Gwei for turbo
                    turboMode: true // Enable turbo mode for maximum speed
                }
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

}
module.exports = UnifiedTradingEngine;
