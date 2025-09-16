/**
 * Comprehensive Error Handler for Area51 Telegram Bot
 * Provides centralized error handling with proper logging and user feedback
 */

class ErrorHandler {
    constructor(monitoring = null) {
        this.monitoring = monitoring;
    }

    /**
     * Handle async errors in middleware
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
     * Handle Telegram bot errors
     * @param {Object} ctx - Telegram context
     * @param {Error} error - The error that occurred
     */
    async handleTelegramError(ctx, error) {
        const userId = ctx?.from?.id || 'unknown';
        const errorId = this.generateErrorId();
        
        // Log error with context
        this.monitoring?.logError('Telegram bot error', error, {
            userId,
            errorId,
            command: ctx?.message?.text || ctx?.callbackQuery?.data,
            timestamp: new Date().toISOString()
        });

        // Send user-friendly error message
        try {
            const userMessage = this.getUserFriendlyMessage(error);
            await ctx.reply(`❌ ${userMessage}\n\nError ID: ${errorId}`, {
                reply_markup: { remove_keyboard: true }
            });
        } catch (replyError) {
            // If we can't send a message, log it
            this.monitoring?.logError('Failed to send error message to user', replyError, { userId, errorId });
        }
    }

    /**
     * Handle database errors
     * @param {Error} error - Database error
     * @param {string} operation - The operation that failed
     * @param {Object} context - Additional context
     * @returns {Object} - Standardized error response
     */
    handleDatabaseError(error, operation, context = {}) {
        const errorId = this.generateErrorId();
        
        this.monitoring?.logError(`Database error during ${operation}`, error, {
            ...context,
            errorId,
            operation
        });

        if (error.code === 'ECONNREFUSED') {
            return {
                success: false,
                error: 'Database connection failed',
                errorId,
                retry: true
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

        return {
            success: false,
            error: 'Database operation failed',
            errorId,
            retry: true
        };
    }

    /**
     * Handle API errors
     * @param {Error} error - API error
     * @param {string} apiName - Name of the API
     * @param {Object} context - Additional context
     * @returns {Object} - Standardized error response
     */
    handleApiError(error, apiName, context = {}) {
        const errorId = this.generateErrorId();
        
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
                retry: true
            };
        }

        if (error.response?.status === 429) {
            return {
                success: false,
                error: `${apiName} rate limit exceeded`,
                errorId,
                retry: true,
                retryAfter: error.response.headers['retry-after'] || 60
            };
        }

        if (error.response?.status >= 500) {
            return {
                success: false,
                error: `${apiName} server error`,
                errorId,
                retry: true
            };
        }

        return {
            success: false,
            error: `${apiName} request failed`,
            errorId,
            retry: false
        };
    }

    /**
     * Handle wallet-related errors
     * @param {Error} error - Wallet error
     * @param {Object} context - Additional context
     * @returns {Object} - Standardized error response
     */
    handleWalletError(error, context = {}) {
        const errorId = this.generateErrorId();
        
        this.monitoring?.logError('Wallet operation error', error, {
            ...context,
            errorId
        });

        if (error.message.includes('insufficient funds')) {
            return {
                success: false,
                error: 'Insufficient funds for transaction',
                errorId,
                userAction: 'Add more MON to your wallet'
            };
        }

        if (error.message.includes('gas')) {
            return {
                success: false,
                error: 'Gas estimation failed',
                errorId,
                userAction: 'Try adjusting gas settings'
            };
        }

        if (error.message.includes('nonce')) {
            return {
                success: false,
                error: 'Transaction nonce conflict',
                errorId,
                retry: true
            };
        }

        return {
            success: false,
            error: 'Wallet operation failed',
            errorId,
            retry: false
        };
    }

    /**
     * Convert technical errors to user-friendly messages
     * @param {Error} error - The error to convert
     * @returns {string} - User-friendly error message
     */
    getUserFriendlyMessage(error) {
        const message = error.message.toLowerCase();

        if (message.includes('timeout')) {
            return 'Request timed out. Please try again.';
        }

        if (message.includes('network') || message.includes('connection')) {
            return 'Network connection issue. Please try again.';
        }

        if (message.includes('insufficient')) {
            return 'Insufficient funds for this transaction.';
        }

        if (message.includes('slippage')) {
            return 'Price changed too much. Try increasing slippage tolerance.';
        }

        if (message.includes('gas')) {
            return 'Transaction gas estimation failed. Try adjusting gas settings.';
        }

        if (message.includes('approval') || message.includes('allowance')) {
            return 'Token approval failed. Please try again.';
        }

        if (message.includes('validation') || message.includes('invalid')) {
            return 'Invalid input provided. Please check your values.';
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

        return true;
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt - Current attempt number
     * @returns {number} - Delay in milliseconds
     */
    getRetryDelay(attempt) {
        return Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
    }
}

module.exports = ErrorHandler;
