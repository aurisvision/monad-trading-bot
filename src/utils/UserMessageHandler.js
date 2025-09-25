/**
 * 💬 User-Friendly Messages & Error Handling
 * Improves user experience with better messages and loading states
 * Area51 Bot - Enhanced UX Module
 */

class UserMessageHandler {
    constructor() {
        this.messages = {
            // Loading states
            loading: {
                transaction: '⏳ *Processing Transaction...*\nPlease wait while we execute your trade.',
                wallet: '⏳ *Loading Wallet...*\nFetching your wallet information.',
                portfolio: '⏳ *Loading Portfolio...*\nCalculating your positions.',
                balance: '⏳ *Checking Balance...*\nUpdating your MON balance.',
                settings: '⏳ *Loading Settings...*\nPreparing your preferences.'
            },

            // Success messages
            success: {
                transaction: '✅ *Transaction Successful!*\nYour trade has been executed successfully.',
                wallet_created: '🎉 *Wallet Created!*\nYour new wallet is ready to use.',
                wallet_imported: '📥 *Wallet Imported!*\nYour existing wallet has been imported successfully.',
                settings_saved: '💾 *Settings Saved!*\nYour preferences have been updated.'
            },

            // Error messages - User friendly
            errors: {
                network: {
                    title: '🌐 Network Issue',
                    message: 'We\'re having trouble connecting to the Monad network. Please try again in a moment.',
                    suggestion: '💡 *Tip:* Check your internet connection and try again.'
                },

                rate_limit: {
                    title: '⏰ Too Many Requests',
                    message: 'You\'ve reached the request limit for this action.',
                    suggestion: '💡 *Tip:* Wait a few minutes and try again, or upgrade your account for higher limits.'
                },

                insufficient_funds: {
                    title: '💰 Insufficient Funds',
                    message: 'You don\'t have enough MON tokens for this transaction.',
                    suggestion: '💡 *Tip:* Check your balance and add more MON tokens to continue trading.'
                },

                invalid_token: {
                    title: '🔍 Token Not Found',
                    message: 'The token address you entered is not valid or supported.',
                    suggestion: '💡 *Tip:* Verify the token address and make sure it\'s on Monad network.'
                },

                slippage_too_high: {
                    title: '📈 High Slippage Detected',
                    message: 'The price movement is higher than your slippage tolerance.',
                    suggestion: '💡 *Tip:* Increase your slippage tolerance in settings or wait for price stabilization.'
                },

                wallet_error: {
                    title: '👛 Wallet Error',
                    message: 'There was an issue with your wallet operation.',
                    suggestion: '💡 *Tip:* Try refreshing your wallet or contact support if the problem persists.'
                },

                server_error: {
                    title: '⚙️ Service Temporarily Unavailable',
                    message: 'Our servers are experiencing high load. Please try again.',
                    suggestion: '💡 *Tip:* This usually resolves within a few minutes. Try again shortly.'
                },

                timeout: {
                    title: '⏰ Request Timeout',
                    message: 'The operation took too long to complete.',
                    suggestion: '💡 *Tip:* Network congestion may be causing delays. Try again or use a different gas setting.'
                },

                unauthorized: {
                    title: '🔐 Access Denied',
                    message: 'You don\'t have permission to perform this action.',
                    suggestion: '💡 *Tip:* Make sure you\'re using the correct account and try logging in again.'
                }
            },

            // Informational messages
            info: {
                maintenance: '🔧 *Scheduled Maintenance*\nWe\'re performing routine maintenance. Service will resume shortly.',
                new_features: '🚀 *New Features Available!*\nCheck out the latest updates in your settings.',
                security_alert: '🛡️ *Security Notice*\nWe detected unusual activity. Additional verification may be required.',
                network_congestion: '🚦 *Network Busy*\nMonad network is experiencing high traffic. Transactions may be slower.'
            }
        };

        // Message formatting options
        this.formatting = {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: null
        };
    }

    /**
     * Get loading message for specific operation
     */
    getLoadingMessage(operation) {
        return this.messages.loading[operation] || '⏳ *Loading...*\nPlease wait.';
    }

    /**
     * Get success message for specific operation
     */
    getSuccessMessage(operation, details = {}) {
        let message = this.messages.success[operation] || '✅ *Success!*';

        // Add details if provided
        if (details.transactionHash) {
            message += `\n\n📋 *Transaction Hash:*\n\`${details.transactionHash}\``;
        }
        if (details.amount) {
            message += `\n💰 *Amount:* ${details.amount}`;
        }
        if (details.newBalance) {
            message += `\n💰 *New Balance:* ${details.newBalance} MON`;
        }

        return message;
    }

    /**
     * Get user-friendly error message
     */
    getErrorMessage(errorType, context = {}) {
        const errorTemplate = this.messages.errors[errorType];

        if (!errorTemplate) {
            return this.getGenericErrorMessage(context);
        }

        let message = `*${errorTemplate.title}*\n\n${errorTemplate.message}`;

        // Add context-specific information
        if (context.remainingTime) {
            message += `\n\n⏰ *Try again in:* ${context.remainingTime}`;
        }
        if (context.requiredAmount && context.availableAmount) {
            message += `\n\n💰 *Required:* ${context.requiredAmount} MON`;
            message += `\n💰 *Available:* ${context.availableAmount} MON`;
        }
        if (context.retryCount) {
            message += `\n\n🔄 *Attempt:* ${context.retryCount}/3`;
        }

        message += `\n\n${errorTemplate.suggestion}`;

        // Add help button if appropriate
        if (errorType === 'rate_limit' || errorType === 'server_error') {
            message += '\n\n[Get Help](https://t.me/Area51Community)';
        }

        return message;
    }

    /**
     * Get generic error message for unknown errors
     */
    getGenericErrorMessage(context = {}) {
        let message = '❌ *Something went wrong*\n\nWe encountered an unexpected error. Our team has been notified.';

        if (context.errorId) {
            message += `\n\n🔍 *Error ID:* ${context.errorId}`;
        }

        message += '\n\n💡 *What you can try:*';
        message += '\n• Wait a moment and try again';
        message += '\n• Check your internet connection';
        message += '\n• Refresh the bot with /start';

        message += '\n\n📞 [Contact Support](https://t.me/Area51Community)';

        return message;
    }

    /**
     * Create loading state with auto-update
     */
    async showLoadingState(ctx, operation, duration = 30000) {
        const loadingMessage = this.getLoadingMessage(operation);

        const message = await ctx.reply(loadingMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '⏳ Processing...', callback_data: 'loading' }
                ]]
            }
        });

        // Auto-update loading state
        const updateInterval = setInterval(async () => {
            try {
                // Add dots animation
                const dots = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
                const randomDot = dots[Math.floor(Math.random() * dots.length)];

                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    message.message_id,
                    null,
                    `${randomDot} *Still processing...*\n${this.getLoadingMessage(operation).substring(4)}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                // Message might be deleted or edited
                clearInterval(updateInterval);
            }
        }, 2000);

        // Auto-cleanup after duration
        setTimeout(() => {
            clearInterval(updateInterval);
        }, duration);

        return {
            messageId: message.message_id,
            updateInterval,
            cleanup: () => clearInterval(updateInterval)
        };
    }

    /**
     * Replace loading state with result
     */
    async resolveLoadingState(ctx, loadingState, success, resultMessage, keyboard = null) {
        // Cleanup loading animation
        if (loadingState.cleanup) {
            loadingState.cleanup();
        }

        const icon = success ? '✅' : '❌';
        const finalMessage = `${icon} ${resultMessage.substring(resultMessage.indexOf('*') + 1)}`;

        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loadingState.messageId,
                null,
                finalMessage,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (error) {
            // Fallback to new message if edit fails
            await ctx.reply(finalMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    }

    /**
     * Map technical errors to user-friendly messages
     */
    mapErrorToUserMessage(error) {
        const errorMessage = error.message || error.toString();

        // Network-related errors
        if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            return this.getErrorMessage('timeout');
        }

        if (errorMessage.includes('insufficient funds') || errorMessage.includes('INSUFFICIENT_FUNDS')) {
            return this.getErrorMessage('insufficient_funds');
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('RATE_LIMIT')) {
            return this.getErrorMessage('rate_limit');
        }

        if (errorMessage.includes('slippage') || errorMessage.includes('SLIPPAGE')) {
            return this.getErrorMessage('slippage_too_high');
        }

        if (errorMessage.includes('invalid token') || errorMessage.includes('INVALID_TOKEN')) {
            return this.getErrorMessage('invalid_token');
        }

        if (errorMessage.includes('unauthorized') || errorMessage.includes('UNAUTHORIZED')) {
            return this.getErrorMessage('unauthorized');
        }

        // Database errors
        if (errorMessage.includes('database') || errorMessage.includes('connection')) {
            return this.getErrorMessage('server_error');
        }

        // Default generic error
        return this.getGenericErrorMessage({
            errorId: `ERR_${Date.now()}`,
            originalError: errorMessage
        });
    }

    /**
     * Create progress indicator for multi-step operations
     */
    createProgressIndicator(steps, currentStep) {
        const progressBar = '█'.repeat(currentStep) + '░'.repeat(steps - currentStep);
        const percentage = Math.round((currentStep / steps) * 100);

        return {
            text: `📊 Progress: ${percentage}%\n${progressBar}`,
            percentage,
            completed: currentStep >= steps
        };
    }

    /**
     * Format transaction details for user display
     */
    formatTransactionDetails(transaction) {
        let message = '📋 *Transaction Details*\n\n';

        if (transaction.type) {
            message += `🔄 *Type:* ${transaction.type.toUpperCase()}\n`;
        }

        if (transaction.amount) {
            message += `💰 *Amount:* ${transaction.amount}\n`;
        }

        if (transaction.token) {
            message += `🪙 *Token:* ${transaction.token}\n`;
        }

        if (transaction.hash) {
            message += `🔗 *Hash:* \`${transaction.hash}\`\n`;
        }

        if (transaction.status) {
            const statusEmoji = {
                'pending': '⏳',
                'confirmed': '✅',
                'failed': '❌'
            };
            message += `📊 *Status:* ${statusEmoji[transaction.status] || '❓'} ${transaction.status}\n`;
        }

        if (transaction.timestamp) {
            const date = new Date(transaction.timestamp).toLocaleString();
            message += `🕐 *Time:* ${date}\n`;
        }

        if (transaction.gasUsed) {
            message += `⛽ *Gas Used:* ${transaction.gasUsed}\n`;
        }

        if (transaction.fee) {
            message += `💵 *Fee:* ${transaction.fee} MON\n`;
        }

        return message;
    }

    /**
     * Create confirmation dialog with timeout
     */
    async createConfirmationDialog(ctx, message, timeoutMs = 30000) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Confirm', callback_data: 'confirm_yes' },
                    { text: '❌ Cancel', callback_data: 'confirm_no' }
                ]
            ]
        };

        const sentMessage = await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        // Auto-cancel after timeout
        const timeout = setTimeout(async () => {
            try {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    sentMessage.message_id,
                    null,
                    '⏰ *Confirmation Timeout*\n\nThe confirmation request has expired for security reasons.',
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                // Message might be deleted
            }
        }, timeoutMs);

        return {
            messageId: sentMessage.message_id,
            timeout,
            cleanup: () => clearTimeout(timeout)
        };
    }
}

module.exports = UserMessageHandler;
