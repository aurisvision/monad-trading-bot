const SecurityManager = require('./security');

class ErrorHandler {
    constructor() {
        this.security = new SecurityManager();
        this.errorCounts = new Map();
        this.maxErrorsPerUser = 10;
        this.errorWindowMs = 60000; // 1 minute
    }

    // Handle and log errors with context
    async handleError(error, ctx, operation = 'unknown') {
        const userId = ctx?.from?.id || 'unknown';
        const username = ctx?.from?.username || 'unknown';
        
        // Log the error
        console.error(`[ERROR] User: ${userId} (${username}), Operation: ${operation}`, {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Track error frequency per user
        this.trackUserError(userId);

        // Security logging
        this.security.logSecurityEvent(userId, 'error_occurred', {
            operation: operation,
            error: error.message,
            username: username
        });

        // Determine error type and response
        const errorResponse = this.categorizeError(error, operation);
        
        // Send user-friendly error message
        if (ctx && ctx.reply) {
            try {
                await ctx.reply(errorResponse.message);
            } catch (replyError) {
                console.error('Failed to send error message to user:', replyError);
            }
        }

        return errorResponse;
    }

    // Track errors per user to detect abuse
    trackUserError(userId) {
        const now = Date.now();
        const key = `errors_${userId}`;
        
        if (!this.errorCounts.has(key)) {
            this.errorCounts.set(key, {
                count: 1,
                firstError: now,
                lastError: now
            });
            return;
        }

        const errorData = this.errorCounts.get(key);
        
        // Reset if window expired
        if (now - errorData.firstError > this.errorWindowMs) {
            errorData.count = 1;
            errorData.firstError = now;
        } else {
            errorData.count++;
        }
        
        errorData.lastError = now;

        // If too many errors, temporarily block user
        if (errorData.count > this.maxErrorsPerUser) {
            this.security.trackFailedAttempt(userId, 'excessive_errors');
        }
    }

    // Categorize errors and provide appropriate responses
    categorizeError(error, operation) {
        const message = error.message.toLowerCase();
        
        // Network/API errors
        if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
            return {
                type: 'network',
                message: '🌐 Network error occurred. Please try again in a moment.',
                retryable: true
            };
        }

        // Insufficient balance errors
        if (message.includes('insufficient') || message.includes('balance')) {
            return {
                type: 'balance',
                message: '💰 Insufficient balance for this transaction. Please check your wallet balance.',
                retryable: false
            };
        }

        // Invalid input errors
        if (message.includes('invalid') || message.includes('malformed')) {
            return {
                type: 'validation',
                message: '❌ Invalid input provided. Please check your data and try again.',
                retryable: false
            };
        }

        // Transaction errors
        if (message.includes('transaction') || message.includes('gas') || message.includes('revert')) {
            return {
                type: 'transaction',
                message: '⛽ Transaction failed. This could be due to network congestion or insufficient gas. Please try again.',
                retryable: true
            };
        }

        // Token/contract errors
        if (message.includes('token') || message.includes('contract')) {
            return {
                type: 'contract',
                message: '🪙 Token or contract error. Please verify the token address is correct.',
                retryable: false
            };
        }

        // Authentication/permission errors
        if (message.includes('unauthorized') || message.includes('permission') || message.includes('access')) {
            return {
                type: 'auth',
                message: '🔐 Authentication error. Please restart the bot with /start.',
                retryable: false
            };
        }

        // Rate limiting errors
        if (message.includes('rate limit') || message.includes('too many requests')) {
            return {
                type: 'rate_limit',
                message: '⏰ Too many requests. Please wait a moment before trying again.',
                retryable: true
            };
        }

        // Database errors
        if (message.includes('database') || message.includes('sql')) {
            return {
                type: 'database',
                message: '💾 Database error occurred. Please try again later.',
                retryable: true
            };
        }

        // Generic error
        return {
            type: 'generic',
            message: '❌ An unexpected error occurred. Please try again or contact support if the issue persists.',
            retryable: true
        };
    }

    // Handle specific trading errors
    handleTradingError(error, operation, tokenSymbol = 'Token') {
        const message = error.message.toLowerCase();
        
        if (message.includes('slippage')) {
            return `📊 Slippage tolerance exceeded for ${tokenSymbol}. Try increasing slippage in settings or wait for better market conditions.`;
        }
        
        if (message.includes('liquidity')) {
            return `💧 Insufficient liquidity for ${tokenSymbol}. Try a smaller amount or wait for more liquidity.`;
        }
        
        if (message.includes('price impact')) {
            return `💥 Price impact too high for ${tokenSymbol}. Consider trading a smaller amount.`;
        }
        
        if (message.includes('deadline')) {
            return `⏰ Transaction deadline exceeded for ${tokenSymbol}. Please try again.`;
        }
        
        return `❌ Trading error for ${tokenSymbol}: ${error.message}`;
    }

    // Handle wallet-related errors
    handleWalletError(error, operation) {
        const message = error.message.toLowerCase();
        
        if (message.includes('private key') || message.includes('mnemonic')) {
            return '🔑 Invalid private key or mnemonic phrase. Please check your input and try again.';
        }
        
        if (message.includes('encryption') || message.includes('decryption')) {
            return '🔐 Wallet encryption error. Please contact support.';
        }
        
        if (message.includes('signature')) {
            return '✍️ Transaction signing failed. Please try again.';
        }
        
        return `👛 Wallet error: ${error.message}`;
    }

    // Check if user should be temporarily blocked due to errors
    shouldBlockUser(userId) {
        const errorData = this.errorCounts.get(`errors_${userId}`);
        if (!errorData) return false;
        
        const now = Date.now();
        return errorData.count > this.maxErrorsPerUser && 
               (now - errorData.firstError) <= this.errorWindowMs;
    }

    // Clean up old error tracking data
    cleanup() {
        const now = Date.now();
        
        for (const [key, errorData] of this.errorCounts.entries()) {
            if (now - errorData.lastError > this.errorWindowMs * 2) {
                this.errorCounts.delete(key);
            }
        }
        
        // Also cleanup security manager
        this.security.cleanup();
    }

    // Get error statistics for monitoring
    getErrorStats() {
        const stats = {
            totalUsers: this.errorCounts.size,
            recentErrors: 0,
            blockedUsers: 0
        };
        
        const now = Date.now();
        
        for (const [key, errorData] of this.errorCounts.entries()) {
            if (now - errorData.lastError <= this.errorWindowMs) {
                stats.recentErrors += errorData.count;
            }
            
            if (this.shouldBlockUser(key.replace('errors_', ''))) {
                stats.blockedUsers++;
            }
        }
        
        return stats;
    }
}

module.exports = ErrorHandler;
