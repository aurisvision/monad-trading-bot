// Centralized Error Handling Utility for Area51 Bot
// Reduces code duplication and provides consistent error handling

class ErrorHandler {
    constructor(logger = console) {
        this.logger = logger;
    }

    // Handle button action errors
    async handleButtonError(ctx, error, actionName, customMessage = null) {
        const userId = ctx.from?.id || 'unknown';
        const errorMessage = customMessage || `❌ Error in ${actionName}. Please try again.`;
        
        this.logger.error(`❌ Error in ${actionName} for user ${userId}:`, error);
        
        try {
            await ctx.answerCbQuery();
            await ctx.reply(errorMessage);
        } catch (replyError) {
            this.logger.error('Failed to send error message to user:', replyError);
        }
    }

    // Handle database operation errors
    async handleDatabaseError(ctx, error, operation, fallbackAction = null) {
        const userId = ctx.from?.id || 'unknown';
        
        this.logger.error(`❌ Database error in ${operation} for user ${userId}:`, error);
        
        try {
            await ctx.answerCbQuery();
            
            if (fallbackAction) {
                await fallbackAction(ctx);
            } else {
                await ctx.reply('❌ Database error. Please try again in a moment.');
            }
        } catch (replyError) {
            this.logger.error('Failed to handle database error:', replyError);
        }
    }

    // Handle settings update errors
    async handleSettingsError(ctx, error, settingName) {
        const userId = ctx.from?.id || 'unknown';
        
        this.logger.error(`❌ Settings update error for ${settingName} (user ${userId}):`, error);
        
        try {
            await ctx.answerCbQuery();
            await ctx.reply(`❌ Error updating ${settingName}. Please try again.`);
        } catch (replyError) {
            this.logger.error('Failed to send settings error message:', replyError);
        }
    }

    // Handle trading operation errors
    async handleTradingError(ctx, error, operation, tokenSymbol = null) {
        const userId = ctx.from?.id || 'unknown';
        const tokenInfo = tokenSymbol ? ` for ${tokenSymbol}` : '';
        
        this.logger.error(`❌ Trading error in ${operation}${tokenInfo} (user ${userId}):`, error);
        
        try {
            await ctx.answerCbQuery();
            
            if (error.message?.includes('insufficient')) {
                await ctx.reply('❌ Insufficient balance for this transaction.');
            } else if (error.message?.includes('slippage')) {
                await ctx.reply('❌ Transaction failed due to slippage. Try increasing slippage tolerance.');
            } else if (error.message?.includes('gas')) {
                await ctx.reply('❌ Gas estimation failed. Try adjusting gas settings.');
            } else {
                await ctx.reply(`❌ ${operation} failed. Please try again.`);
            }
        } catch (replyError) {
            this.logger.error('Failed to send trading error message:', replyError);
        }
    }

    // Handle wallet operation errors
    async handleWalletError(ctx, error, operation) {
        const userId = ctx.from?.id || 'unknown';
        
        this.logger.error(`❌ Wallet error in ${operation} (user ${userId}):`, error);
        
        try {
            await ctx.answerCbQuery();
            
            if (error.message?.includes('private key')) {
                await ctx.reply('❌ Invalid private key format. Please check and try again.');
            } else if (error.message?.includes('decrypt')) {
                await ctx.reply('❌ Wallet decryption failed. Please contact support.');
            } else {
                await ctx.reply(`❌ Wallet ${operation} failed. Please try again.`);
            }
        } catch (replyError) {
            this.logger.error('Failed to send wallet error message:', replyError);
        }
    }

    // Handle API errors (Monorail, price feeds, etc.)
    async handleAPIError(ctx, error, apiName, operation) {
        const userId = ctx.from?.id || 'unknown';
        
        this.logger.error(`❌ ${apiName} API error in ${operation} (user ${userId}):`, error);
        
        try {
            await ctx.answerCbQuery();
            
            if (error.message?.includes('timeout')) {
                await ctx.reply('❌ Request timeout. Please try again.');
            } else if (error.message?.includes('rate limit')) {
                await ctx.reply('❌ Too many requests. Please wait a moment and try again.');
            } else {
                await ctx.reply(`❌ ${apiName} service temporarily unavailable. Please try again.`);
            }
        } catch (replyError) {
            this.logger.error('Failed to send API error message:', replyError);
        }
    }

    // Handle cache operation errors (non-critical)
    handleCacheError(error, operation, userId = 'unknown') {
        this.logger.warn(`⚠️ Cache error in ${operation} (user ${userId}):`, error);
        // Cache errors are non-critical, don't notify user
    }

    // Generic error handler with automatic error type detection
    async handleError(ctx, error, context = 'operation') {
        const errorMessage = error.message?.toLowerCase() || '';
        
        if (errorMessage.includes('database') || errorMessage.includes('sql')) {
            await this.handleDatabaseError(ctx, error, context);
        } else if (errorMessage.includes('wallet') || errorMessage.includes('private key')) {
            await this.handleWalletError(ctx, error, context);
        } else if (errorMessage.includes('api') || errorMessage.includes('fetch') || errorMessage.includes('network')) {
            await this.handleAPIError(ctx, error, 'External', context);
        } else if (errorMessage.includes('trading') || errorMessage.includes('swap') || errorMessage.includes('slippage')) {
            await this.handleTradingError(ctx, error, context);
        } else {
            await this.handleButtonError(ctx, error, context);
        }
    }

    // Log performance warnings
    logPerformanceWarning(operation, duration, threshold = 5000) {
        if (duration > threshold) {
            this.logger.warn(`⚠️ Slow operation: ${operation} took ${duration}ms (threshold: ${threshold}ms)`);
        }
    }

    // Log user action for debugging
    logUserAction(userId, action, details = {}) {
        this.logger.info(`👤 User ${userId} performed ${action}:`, details);
    }
}

module.exports = ErrorHandler;
