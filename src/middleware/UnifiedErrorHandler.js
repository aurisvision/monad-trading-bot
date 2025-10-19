/**
 * Unified Error Handler for Area51 Telegram Bot
 * Combines Telegram-specific error handling with comprehensive error management
 * Provides centralized error handling with proper logging, user feedback, and monitoring
 */

const logger = require('../utils/Logger');

class UnifiedErrorHandler {
    constructor(monitoring = null) {
        const initTimer = logger.startTimer('error_handler_init');
        
        this.monitoring = monitoring;
        this.errorStats = {
            total: 0,
            byType: {},
            byUser: {},
            recent: []
        };
        
        // Enhanced initialization logging
        logger.info('UnifiedErrorHandler initialized', {
            hasMonitoring: !!monitoring,
            nodeVersion: process.version,
            platform: process.platform,
            memoryUsage: process.memoryUsage(),
            category: 'error_handler'
        });
        
        logger.endTimer(initTimer);
    }

    // ==================== TELEGRAM ERROR HANDLING ====================
    
    /**
     * Handle async errors in Telegram middleware
     * @param {Function} fn - Async function to wrap
     * @returns {Function} - Wrapped function with error handling
     */
    asyncHandler(fn) {
        return (ctx, next) => {
            return Promise.resolve(fn(ctx, next)).catch((error) => {
                this.handleTelegramError(ctx, error);
            });
        };
    }

    /**
     * Main Telegram bot error handler
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     */
    async handleTelegramError(ctx, error) {
        const userId = ctx?.from?.id || 'unknown';
        const errorId = this.generateErrorId();
        const operationTimer = logger.startTimer(`telegram_error_handling_${errorId}`);
        
        // Record error statistics
        this.recordErrorStats(error, userId);
        
        // Enhanced error logging with comprehensive context
        logger.error('Telegram bot error occurred', error, {
            userId,
            errorId,
            command: ctx?.message?.text || ctx?.callbackQuery?.data,
            updateType: ctx.updateType,
            chatId: ctx?.chat?.id,
            chatType: ctx?.chat?.type,
            messageId: ctx?.message?.message_id,
            callbackData: ctx?.callbackQuery?.data,
            userInfo: {
                username: ctx?.from?.username,
                firstName: ctx?.from?.first_name,
                languageCode: ctx?.from?.language_code
            },
            category: 'telegram_error'
        });
        
        // Also log to monitoring system
        this.monitoring?.logError('Telegram bot error', error, {
            userId,
            errorId,
            command: ctx?.message?.text || ctx?.callbackQuery?.data,
            updateType: ctx.updateType,
            timestamp: new Date().toISOString()
        });

        // Send user-friendly error message
        try {
            const userMessage = this.getUserFriendlyMessage(error);
            
            // Handle callback queries
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            await ctx.reply(`❌ ${userMessage}\n\n🔍 Error ID: ${errorId}`, {
                reply_markup: { remove_keyboard: true }
            });
            
            // Log successful user notification
            logger.info('Error message sent to user', {
                userId,
                errorId,
                userMessage,
                category: 'telegram_error'
            });
            
        } catch (replyError) {
            // Enhanced error logging for reply failures
            logger.error('Failed to send error message to user', replyError, {
                userId,
                errorId,
                originalError: error.message,
                chatId: ctx?.chat?.id,
                category: 'telegram_error'
            });
            
            // Also log to monitoring system
            this.monitoring?.logError('Failed to send error message to user', replyError, { userId, errorId });
        }
        
        logger.endTimer(operationTimer);
    }

    /**
     * Handle button action errors (Telegram-specific)
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     * @param {string} actionName - Name of the action
     * @param {string} customMessage - Custom error message
     */
    async handleButtonError(ctx, error, actionName, customMessage = null) {
        const userId = ctx.from?.id || 'unknown';
        const errorId = this.generateErrorId();
        const errorMessage = customMessage || `Error in ${actionName}. Please try again.`;
        
        this.recordErrorStats(error, userId, 'button_action');
        
        this.monitoring?.logError(`Button action error: ${actionName}`, error, {
            userId,
            errorId,
            actionName
        });
        
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            await ctx.reply(`❌ ${errorMessage}\n\n🔍 Error ID: ${errorId}`);
        } catch (replyError) {
            this.monitoring?.logError('Failed to send button error message', replyError, { userId, errorId });
        }
    }

    /**
     * Handle settings update errors (Telegram-specific)
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     * @param {string} settingName - Name of the setting
     */
    async handleSettingsError(ctx, error, settingName) {
        const userId = ctx.from?.id || 'unknown';
        const errorId = this.generateErrorId();
        
        this.recordErrorStats(error, userId, 'settings');
        
        this.monitoring?.logError(`Settings update error: ${settingName}`, error, {
            userId,
            errorId,
            settingName
        });
        
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            await ctx.reply(`❌ Error updating ${settingName}. Please try again.\n\n🔍 Error ID: ${errorId}`);
        } catch (replyError) {
            this.monitoring?.logError('Failed to send settings error message', replyError, { userId, errorId });
        }
    }

    /**
     * Handle trading operation errors (Telegram-specific)
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     * @param {string} operation - Trading operation name
     * @param {string} tokenSymbol - Token symbol (optional)
     */
    async handleTradingError(ctx, error, operation, tokenSymbol = null) {
        const userId = ctx.from?.id || 'unknown';
        const errorId = this.generateErrorId();
        const tokenInfo = tokenSymbol ? ` for ${tokenSymbol}` : '';
        
        this.recordErrorStats(error, userId, 'trading');
        
        this.monitoring?.logError(`Trading error: ${operation}${tokenInfo}`, error, {
            userId,
            errorId,
            operation,
            tokenSymbol
        });
        
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            let userMessage = `${operation} failed. Please try again.`;
            let errorType = 'Unknown Error';
            let solution = 'Please try again or contact support';
            
            if (error.message?.includes('insufficient')) {
                userMessage = 'Insufficient balance for this transaction.';
                errorType = 'Insufficient Balance';
                solution = 'Add more MON tokens to your wallet';
            } else if (error.message?.includes('slippage')) {
                userMessage = 'Transaction failed due to slippage. Try increasing slippage tolerance.';
                errorType = 'High Slippage';
                solution = 'Increase slippage tolerance in settings';
            } else if (error.message?.includes('fee too low') || error.message?.includes('transaction fee too low')) {
                userMessage = 'Transaction fee is too low for the network.';
                errorType = 'Low Gas Fee';
                solution = 'Increase gas price in settings or use Turbo mode';
            } else if (error.message?.includes('gas')) {
                userMessage = 'Gas estimation failed. Try adjusting gas settings.';
                errorType = 'Gas Error';
                solution = 'Try adjusting gas settings or use Turbo mode';
            }
            
            const formattedMessage = `❌ TRANSACTION FAILED\n\n🛡️ ERROR TYPE\n${errorType}\n\n🎯 SOLUTION\n${solution}\n\n⏰ Error ID: ${errorId}`;
            
            await ctx.reply(formattedMessage);
        } catch (replyError) {
            this.monitoring?.logError('Failed to send trading error message', replyError, { userId, errorId });
        }
    }

    /**
     * Handle wallet operation errors (Telegram-specific)
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     * @param {string} operation - Wallet operation name
     */
    async handleWalletError(ctx, error, operation) {
        const userId = ctx.from?.id || 'unknown';
        const errorId = this.generateErrorId();
        
        this.recordErrorStats(error, userId, 'wallet');
        
        this.monitoring?.logError(`Wallet error: ${operation}`, error, {
            userId,
            errorId,
            operation
        });
        
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            let userMessage = `Wallet ${operation} failed. Please try again.`;
            
            if (error.message?.includes('private key')) {
                userMessage = 'Invalid private key format. Please check and try again.';
            } else if (error.message?.includes('decrypt')) {
                userMessage = 'Wallet decryption failed. Please contact support.';
            }
            
            await ctx.reply(`❌ ${userMessage}\n\n🔍 Error ID: ${errorId}`);
        } catch (replyError) {
            this.monitoring?.logError('Failed to send wallet error message', replyError, { userId, errorId });
        }
    }

    /**
     * Handle API errors (Telegram-specific)
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     * @param {string} apiName - API name
     * @param {string} operation - Operation name
     */
    async handleAPIError(ctx, error, apiName, operation) {
        const userId = ctx.from?.id || 'unknown';
        const errorId = this.generateErrorId();
        
        this.recordErrorStats(error, userId, 'api');
        
        this.monitoring?.logError(`${apiName} API error: ${operation}`, error, {
            userId,
            errorId,
            apiName,
            operation
        });
        
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            let userMessage = `${apiName} service temporarily unavailable. Please try again.`;
            
            if (error.message?.includes('timeout')) {
                userMessage = 'Request timeout. Please try again.';
            } else if (error.message?.includes('rate limit')) {
                userMessage = 'Too many requests. Please wait a moment and try again.';
            }
            
            await ctx.reply(`❌ ${userMessage}\n\n🔍 Error ID: ${errorId}`);
        } catch (replyError) {
            this.monitoring?.logError('Failed to send API error message', replyError, { userId, errorId });
        }
    }

    /**
     * Generic Telegram error handler with automatic error type detection
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     * @param {string} context - Error context
     */
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

    // ==================== SYSTEM ERROR HANDLING ====================
    
    /**
     * Handle database errors (returns structured response)
     * @param {Error} error - Database error
     * @param {string} operation - The operation that failed
     * @param {Object} context - Additional context
     * @returns {Object} - Standardized error response
     */
    handleDatabaseError(error, operation, context = {}) {
        const errorId = this.generateErrorId();
        const operationTimer = logger.startTimer(`database_error_handling_${errorId}`);
        
        this.recordErrorStats(error, context.userId || 'system', 'database');
        
        // Enhanced database error logging
        logger.error(`Database error in operation: ${operation}`, error, {
            ...context,
            errorId,
            operation,
            errorCode: error.code,
            sqlState: error.sqlState,
            constraint: error.constraint,
            table: error.table,
            column: error.column,
            detail: error.detail,
            hint: error.hint,
            category: 'database_error'
        });
        
        this.monitoring?.logError(`Database error: ${operation}`, error, {
            ...context,
            errorId,
            operation
        });

        if (error.code === 'ECONNREFUSED') {
            return {
                success: false,
                error: 'Database connection failed',
                errorId,
                retry: true,
                retryDelay: 5000
            };
        }

        if (error.code === '23505') { // Unique constraint violation
            return {
                success: false,
                error: 'Duplicate entry detected',
                errorId,
                retry: false
            };
        }

        if (error.code === '42703') { // Column does not exist
            return {
                success: false,
                error: 'Database schema error',
                errorId,
                retry: false
            };
        }

        const result = {
            success: false,
            error: 'Database operation failed',
            errorId,
            retry: true,
            retryDelay: 2000
        };

        logger.endTimer(operationTimer, 'Database error handling completed', {
            errorId,
            operation,
            errorCode: error.code,
            retry: result.retry,
            category: 'database_error_handling'
        });

        return result;
    }

    /**
     * Handle API errors (returns structured response)
     * @param {Error} error - API error
     * @param {string} apiName - Name of the API
     * @param {Object} context - Additional context
     * @returns {Object} - Standardized error response
     */
    handleApiError(error, apiName, context = {}) {
        const errorId = this.generateErrorId();
        const operationTimer = logger.startTimer(`api_error_handling_${errorId}`);
        
        this.recordErrorStats(error, context.userId || 'system', 'api');
        
        // Enhanced API error logging
        logger.error(`API error from ${apiName}`, error, {
            ...context,
            errorId,
            apiName,
            statusCode: error.response?.status,
            statusText: error.response?.statusText,
            responseData: error.response?.data,
            requestUrl: error.config?.url,
            requestMethod: error.config?.method,
            requestHeaders: error.config?.headers,
            timeout: error.config?.timeout,
            category: 'api_error'
        });
        
        this.monitoring?.logError(`${apiName} API error`, error, {
            ...context,
            errorId,
            apiName
        });

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return {
                success: false,
                error: `${apiName} request timeout`,
                errorId,
                retry: true,
                retryDelay: 3000
            };
        }

        if (error.response?.status === 429) {
            return {
                success: false,
                error: `${apiName} rate limit exceeded`,
                errorId,
                retry: true,
                retryDelay: (error.response.headers['retry-after'] || 60) * 1000
            };
        }

        if (error.response?.status >= 500) {
            return {
                success: false,
                error: `${apiName} server error`,
                errorId,
                retry: true,
                retryDelay: 5000
            };
        }

        const result = {
            success: false,
            error: `${apiName} request failed`,
            errorId,
            retry: false
        };

        logger.endTimer(operationTimer, 'API error handling completed', {
            errorId,
            apiName,
            statusCode: error.response?.status,
            retry: result.retry,
            category: 'api_error_handling'
        });

        return result;
    }

    /**
     * Handle wallet-related errors (returns structured response)
     * @param {Error} error - Wallet error
     * @param {Object} context - Additional context
     * @returns {Object} - Standardized error response
     */
    handleWalletError(error, context = {}) {
        const errorId = this.generateErrorId();
        const operationTimer = logger.startTimer(`wallet_error_handling_${errorId}`);
        
        this.recordErrorStats(error, context.userId || 'system', 'wallet');
        
        // Enhanced wallet error logging
        logger.error('Wallet operation error', error, {
            ...context,
            errorId,
            walletAddress: context.walletAddress,
            operation: context.operation,
            tokenAddress: context.tokenAddress,
            amount: context.amount,
            gasLimit: context.gasLimit,
            gasPrice: context.gasPrice,
            nonce: context.nonce,
            chainId: context.chainId,
            category: 'wallet_error'
        });
        
        this.monitoring?.logError('Wallet operation error', error, {
            ...context,
            errorId
        });

        if (error.message.includes('insufficient funds')) {
            return {
                success: false,
                error: 'Insufficient funds for transaction',
                errorId,
                userAction: 'Add more MON to your wallet',
                retry: false
            };
        }

        if (error.message.includes('gas')) {
            return {
                success: false,
                error: 'Gas estimation failed',
                errorId,
                userAction: 'Try adjusting gas settings',
                retry: true
            };
        }

        if (error.message.includes('nonce')) {
            return {
                success: false,
                error: 'Transaction nonce conflict',
                errorId,
                retry: true,
                retryDelay: 1000
            };
        }

        const result = {
            success: false,
            error: 'Wallet operation failed',
            errorId,
            retry: false
        };

        logger.endTimer(operationTimer, 'Wallet error handling completed', {
            errorId,
            operation: context.operation,
            walletAddress: context.walletAddress,
            retry: result.retry,
            category: 'wallet_error_handling'
        });

        return result;
    }

    /**
     * Handle cache operation errors (non-critical)
     * @param {Error} error - Cache error
     * @param {string} operation - Cache operation name
     * @param {string} userId - User ID
     */
    handleCacheError(error, operation, userId = 'unknown') {
        const errorId = this.generateErrorId();
        const operationTimer = logger.startTimer(`cache_error_handling_${errorId}`);
        
        this.recordErrorStats(error, userId, 'cache');
        
        // Enhanced cache error logging
        logger.warn(`Cache operation failed: ${operation}`, {
            error: error.message,
            stack: error.stack,
            userId,
            errorId,
            operation,
            cacheKey: error.key,
            cacheType: error.type,
            category: 'cache_error'
        });
        
        this.monitoring?.logWarning(`Cache error: ${operation}`, {
            error: error.message,
            userId,
            operation,
            severity: 'low'
        });
        
        logger.endTimer(operationTimer, 'Cache error handling completed', {
            errorId,
            operation,
            userId,
            category: 'cache_error_handling'
        });
        
        // Cache errors are non-critical, don't notify user
    }

    // ==================== UTILITY METHODS ====================
    
    /**
     * Convert technical errors to user-friendly messages
     * @param {Error} error - The error to convert
     * @returns {string} - User-friendly error message
     */
    getUserFriendlyMessage(error) {
        const message = error.message.toLowerCase();

        // Telegram-specific errors
        if (message.includes('message is not modified')) {
            return 'No changes needed.';
        }

        if (message.includes('message to edit not found')) {
            return 'Message expired. Please try again.';
        }

        if (message.includes('bot was blocked')) {
            return 'Unable to send message. Please unblock the bot.';
        }

        // Network errors
        if (message.includes('timeout')) {
            return 'Request timed out. Please try again.';
        }

        if (message.includes('network') || message.includes('connection')) {
            return 'Network connection issue. Please try again.';
        }

        // Trading errors
        if (message.includes('insufficient')) {
            return 'Insufficient funds for this transaction.';
        }

        if (message.includes('slippage')) {
            return 'Price changed too much. Try increasing slippage tolerance.';
        }

        if (message.includes('fee too low') || message.includes('transaction fee too low')) {
            return 'Transaction fee is too low for the network. Increase gas price or use Turbo mode.';
        }

        if (message.includes('gas')) {
            return 'Transaction gas estimation failed. Try adjusting gas settings.';
        }

        if (message.includes('approval') || message.includes('allowance')) {
            return 'Token approval failed. Please try again.';
        }

        // Validation errors
        if (message.includes('validation') || message.includes('invalid')) {
            return 'Invalid input provided. Please check your values.';
        }

        // Rate limiting
        if (message.includes('rate limit')) {
            return 'Too many requests. Please wait a moment and try again.';
        }

        // Default message for unknown errors
        return 'An unexpected error occurred. Please try again or contact support.';
    }

    /**
     * Generate unique error ID for tracking
     * @returns {string} - Unique error identifier
     */
    generateErrorId() {
        return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    }

    /**
     * Record error statistics
     * @param {Error} error - The error
     * @param {string} userId - User ID
     * @param {string} type - Error type
     */
    recordErrorStats(error, userId, type = 'general') {
        this.errorStats.total++;
        
        // By type
        if (!this.errorStats.byType[type]) {
            this.errorStats.byType[type] = 0;
        }
        this.errorStats.byType[type]++;
        
        // By user
        if (!this.errorStats.byUser[userId]) {
            this.errorStats.byUser[userId] = 0;
        }
        this.errorStats.byUser[userId]++;
        
        // Recent errors (keep last 100)
        this.errorStats.recent.unshift({
            timestamp: new Date(),
            type,
            userId,
            message: error.message,
            stack: error.stack?.split('\n')[0] // First line of stack trace
        });
        
        if (this.errorStats.recent.length > 100) {
            this.errorStats.recent = this.errorStats.recent.slice(0, 100);
        }

        // Record in monitoring system
        if (this.monitoring) {
            this.monitoring.recordError(type, 'error');
        }
    }

    /**
     * Validate error recovery options
     * @param {Object} error - Error object with retry information
     * @param {number} attempt - Current attempt number
     * @returns {boolean} - Whether retry should be attempted
     */
    shouldRetry(error, attempt = 1) {
        const maxRetries = 3;
        
        if (attempt >= maxRetries) return false;
        if (!error.retry) return false;
        
        // Don't retry validation errors
        if (error.error?.includes('Invalid') || error.error?.includes('validation')) {
            return false;
        }

        // Don't retry duplicate entry errors
        if (error.error?.includes('Duplicate')) {
            return false;
        }

        return true;
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt - Current attempt number
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {number} - Delay in milliseconds
     */
    getRetryDelay(attempt, baseDelay = 1000) {
        return Math.min(baseDelay * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
    }

    /**
     * Log performance warnings
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {number} threshold - Threshold in milliseconds
     */
    logPerformanceWarning(operation, duration, threshold = 5000) {
        if (duration > threshold) {
            // Enhanced performance warning logging
            logger.warn(`Slow operation detected: ${operation}`, {
                operation,
                duration,
                threshold,
                overThresholdBy: duration - threshold,
                severity: 'performance',
                category: 'performance_warning'
            });
            
            this.monitoring?.logWarning(`Slow operation: ${operation}`, {
                duration,
                threshold,
                severity: 'performance'
            });
        }
    }

    /**
     * Log user action for debugging
     * @param {string} userId - User ID
     * @param {string} action - Action performed
     * @param {Object} details - Additional details
     */
    logUserAction(userId, action, details = {}) {
        // Enhanced user action logging
        logger.info(`User action: ${action}`, {
            userId,
            action,
            timestamp: new Date().toISOString(),
            userAgent: details.userAgent,
            ipAddress: details.ipAddress,
            sessionId: details.sessionId,
            category: 'user_action',
            ...details
        });
        
        this.monitoring?.logInfo(`User action: ${action}`, {
            userId,
            action,
            ...details
        });
    }

    /**
     * Get error statistics
     * @returns {Object} - Error statistics
     */
    getErrorStats() {
        return {
            ...this.errorStats,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset error statistics
     */
    resetErrorStats() {
        this.errorStats = {
            total: 0,
            byType: {},
            byUser: {},
            recent: []
        };
    }

    /**
     * Middleware for Express error handling
     * @returns {Function} - Express error middleware
     */
    expressErrorMiddleware() {
        return (err, req, res, next) => {
            const errorId = this.generateErrorId();
            
            this.monitoring?.logError('Express error', err, {
                errorId,
                method: req.method,
                url: req.url,
                userAgent: req.get('User-Agent')
            });

            res.status(500).json({
                success: false,
                error: 'Internal server error',
                errorId
            });
        };
    }

    /**
     * Cleanup method
     */
    destroy() {
        // Clear recent errors to free memory
        this.errorStats.recent = [];
    }
}

module.exports = UnifiedErrorHandler;

