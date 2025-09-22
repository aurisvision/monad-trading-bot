// 🚀 Transaction Middleware - Simplified for unified trading system
class TransactionMiddleware {
    constructor(transactionAccelerator, monitoring) {
        this.transactionAccelerator = transactionAccelerator;
        this.monitoring = monitoring;
        // Trading-related callback patterns that need acceleration
        this.tradingPatterns = [
            /^buy_amount_/,
            /^confirm_buy_/,
            /^sell_percentage_/,
            /^confirm_portfolio_sell_/,
            /^buy_token_/
        ];
    }
    /**
     * 🚀 Middleware to pre-load data for trading operations
     */
    middleware() {
        return async (ctx, next) => {
            const startTime = Date.now();
            try {
                // Check if this is a trading-related operation
                const callbackData = ctx.callbackQuery?.data;
                const isTradingOperation = callbackData && 
                    this.tradingPatterns.some(pattern => pattern.test(callbackData));
                if (isTradingOperation && this.transactionAccelerator) {
                    const userId = ctx.from?.id;
                    if (userId) {
                        // Pre-load critical data in background (non-blocking)
                        this.preloadDataAsync(userId).catch(error => {
                        });
                    }
                }
                // Continue to next middleware/handler
                await next();
                // Log performance metrics
                const duration = Date.now() - startTime;
                if (isTradingOperation) {
                    // Record performance in Transaction Accelerator
                    if (this.transactionAccelerator?.performanceReporter) {
                        let operationType = 'other';
                        if (callbackData.includes('buy')) operationType = 'buy';
                        else if (callbackData.includes('sell')) operationType = 'sell';
                        else if (callbackData.includes('auto_buy')) operationType = 'autoBuy';
                        this.transactionAccelerator.performanceReporter.recordTransaction(operationType, duration, true);
                    }
                    this.monitoring?.logInfo('Trading operation performance', {
                        userId: ctx.from?.id,
                        operation: callbackData,
                        duration,
                        preloaded: !!this.transactionAccelerator
                    });
                }
            } catch (error) {
                await next(); // Continue even if middleware fails
            }
        };
    }
    /**
     * 🔥 Async data preloading (non-blocking)
     */
    async preloadDataAsync(userId) {
        try {
            // Get user data first
            const user = await this.getUserFromCache(userId);
            if (user?.wallet_address) {
                // Pre-load critical data for instant access
                await this.transactionAccelerator.preloadCriticalData(userId, user.wallet_address);
            }
        } catch (error) {
            // Don't throw - this is background operation
        }
    }
    /**
     * 🚀 Fast user lookup with caching
     */
    async getUserFromCache(userId) {
        try {
            // Try to get from transaction accelerator's cache first
            if (this.transactionAccelerator?.cacheService) {
                return await this.transactionAccelerator.cacheService.get('user', userId);
            }
            return null;
        } catch (error) {
            return null;
        }
    }
    /**
     * 📊 Get middleware performance stats
     */
    getStats() {
        return {
            tradingPatterns: this.tradingPatterns.length,
            acceleratorEnabled: !!this.transactionAccelerator,
            monitoringEnabled: !!this.monitoring
        };
    }
}
module.exports = TransactionMiddleware;