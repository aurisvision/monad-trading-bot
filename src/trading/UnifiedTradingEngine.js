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
            const startTime = Date.now();
            
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
            
            const executionTime = Date.now() - startTime;
            
            if (!swapResult.success) {
                // Enhanced error handling
                throw new Error(`Transaction failed: ${swapResult.error}`);
            }
            
            // Calculate token price if possible
            const tokenPrice = swapResult.expectedOutput && swapResult.expectedOutput > 0 
                ? (amount / swapResult.expectedOutput).toFixed(6) 
                : null;
            
            return {
                success: true,
                action: 'buy',
                txHash: swapResult.txHash,
                tokenSymbol: tokenInfo.token.symbol,
                tokenName: tokenInfo.token.name,
                tokenAddress: tokenAddress,
                monAmount: amount,
                tokenAmount: swapResult.expectedOutput || 0,
                actualTokenAmount: swapResult.actualOutput || swapResult.expectedOutput || 0,
                expectedOutput: swapResult.expectedOutput || 0,
                priceImpact: swapResult.priceImpact || 'N/A',
                gasUsed: swapResult.receipt?.gasUsed?.toString(),
                effectiveGasPrice: swapResult.receipt?.effectiveGasPrice?.toString(),
                mode: 'normal',
                slippage: tradeData.effectiveSlippage,
                tokenPrice: tokenPrice,
                route: swapResult.route || ['MON', tokenInfo.token.symbol],
                executionTime: executionTime,
                timestamp: Date.now()
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
            const startTime = Date.now();
            
            // Get basic token info for display (cached, fast)
            const tokenInfo = await this.dataManager.getCachedTokenInfo(tokenAddress);
            
            // Direct execution without extensive validation for maximum speed
            const swapResult = await this.monorailAPI.executeSwapTurbo(
                tradeData.wallet,
                tokenAddress,
                amount,
                20, // Fixed 20% slippage for turbo mode
                tradeData.wallet.address
            );
            
            const executionTime = Date.now() - startTime;
            
            if (!swapResult.success) {
                throw new Error(`Turbo execution failed: ${swapResult.error}`);
            }
            
            // Calculate token price if possible
            const tokenPrice = swapResult.expectedOutput && swapResult.expectedOutput > 0 
                ? (amount / swapResult.expectedOutput).toFixed(6) 
                : null;
            
            return {
                success: true,
                action: 'buy',
                txHash: swapResult.txHash,
                tokenSymbol: tokenInfo?.token?.symbol || 'UNKNOWN',
                tokenName: tokenInfo?.token?.name || 'Unknown Token',
                tokenAddress: tokenAddress,
                monAmount: amount,
                tokenAmount: swapResult.expectedOutput || 0,
                actualTokenAmount: swapResult.actualOutput || swapResult.expectedOutput || 0,
                expectedOutput: swapResult.expectedOutput || 0,
                priceImpact: swapResult.priceImpact || 'N/A',
                gasUsed: null, // Turbo mode doesn't wait for receipt
                effectiveGasPrice: '210', // Fixed 210 Gwei for turbo
                mode: 'turbo',
                slippage: 20,
                tokenPrice: tokenPrice,
                route: swapResult.route || ['MON', tokenInfo?.token?.symbol || 'UNKNOWN'],
                executionTime: executionTime,
                timestamp: Date.now()
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
            
            // Get token information
            let tokenSymbol = 'Unknown';
            let tokenName = 'Unknown Token';
            try {
                const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
                if (tokenInfo && tokenInfo.token) {
                    tokenSymbol = tokenInfo.token.symbol || 'Unknown';
                    tokenName = tokenInfo.token.name || 'Unknown Token';
                }
            } catch (error) {
                console.log('Warning: Could not fetch token info:', error.message);
            }
            
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
                tokenSymbol: tokenSymbol,
                tokenName: tokenName,
                tokenAmount: tokenAmount,
                monReceived: swapResult.expectedOutput || swapResult.outputAmount || '0',
                mode: 'normal',
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
            // Get token information
            let tokenSymbol = 'Unknown';
            let tokenName = 'Unknown Token';
            try {
                const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
                if (tokenInfo && tokenInfo.token) {
                    tokenSymbol = tokenInfo.token.symbol || 'Unknown';
                    tokenName = tokenInfo.token.name || 'Unknown Token';
                }
            } catch (error) {
                console.log('Warning: Could not fetch token info:', error.message);
            }
            
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
                tokenSymbol: tokenSymbol,
                tokenName: tokenName,
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
     * ✅ Security validations for normal trading
     */
    async validateNormalTrade(tradeData, tokenAddress, amount) {
        const security = this.config.getSecurityConfig();
        // Validate token address
        if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
            throw new Error(this.config.getErrorMessage('INVALID_TOKEN'));
        }
        // Validate amount
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            throw new Error(this.config.getErrorMessage('INVALID_AMOUNT'));
        }
        // Check maximum transaction limit
        if (numAmount > security.maxTransactionAmount) {
            throw new Error('Amount exceeds maximum limit: ' + security.maxTransactionAmount + ' MON');
        }
        // Check balance
        const requiredAmount = numAmount + security.gasBuffer;
        const availableBalance = parseFloat(tradeData.balance);
        if (availableBalance < requiredAmount) {
            throw new Error(
                this.config.getErrorMessage('INSUFFICIENT_BALANCE') + '\n' +
                'Required: ' + requiredAmount.toFixed(4) + ' MON\n' +
                'Available: ' + availableBalance.toFixed(4) + ' MON'
            );
        }
        // Check minimum balance
        if (availableBalance < security.minBalance) {
            throw new Error('Balance below minimum required: ' + security.minBalance + ' MON');
        }
    }
    /**
     * ✅ Security validations for selling
     */
    async validateSellTrade(tradeData, tokenAddress, tokenAmount) {
        // Validate token address
        if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
            throw new Error(this.config.getErrorMessage('INVALID_TOKEN'));
        }
        // Validate amount
        const numAmount = parseFloat(tokenAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            throw new Error(this.config.getErrorMessage('INVALID_AMOUNT'));
        }
        // Check sufficient MON balance for gas
        const security = this.config.getSecurityConfig();
        const monBalance = parseFloat(tradeData.balance);
        if (monBalance < security.gasBuffer) {
            throw new Error('Insufficient MON balance for network fees. Required: ' + security.gasBuffer + ' MON');
        }
    }
    /**
     * 📊 Update performance statistics
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
        // Log to monitoring system
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
     * 📈 Get success rate
     */
    getSuccessRate() {
        if (this.stats.totalTrades === 0) return 0;
        return (this.stats.successfulTrades / this.stats.totalTrades * 100).toFixed(2);
    }
    /**
     * 📊 Get detailed statistics
     */
    getDetailedStats() {
        return {
            ...this.stats,
            successRate: this.getSuccessRate(),
            dataManagerMetrics: this.dataManager.getMetrics()
        };
    }
    /**
     * 🔧 System health check
     */
    async healthCheck() {
        try {
            // Test Redis connection
            const redisOk = await this.dataManager.testRedisConnection();
            // Test database connection
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
