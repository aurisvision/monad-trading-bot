/**
 * Real-Time Message Updater
 * Handles live updates for trading messages using WebSocket and professional formatting
 */

const ProfessionalMessageFormatter = require('./ProfessionalMessageFormatter');
const EnhancedWebSocketManager = require('./EnhancedWebSocketManager');
const Logger = require('./Logger');

class RealTimeMessageUpdater {
    constructor(bot, options = {}) {
        this.bot = bot;
        this.formatter = new ProfessionalMessageFormatter();
        this.wsManager = new EnhancedWebSocketManager(options);
        this.logger = Logger;
        
        // Track active messages for updates
        this.activeMessages = new Map(); // messageId -> { chatId, type, data, lastUpdate }
        this.pendingTransactions = new Map(); // txHash -> { messageId, chatId, operation }
        
        this.setupWebSocketListeners();
    }

    /**
     * Setup WebSocket event listeners
     */
    setupWebSocketListeners() {
        // Transaction confirmation updates
        this.wsManager.on('transactionConfirmed', (data) => {
            this.handleTransactionConfirmation(data);
        });

        // Block updates for gas optimization
        this.wsManager.on('newBlock', (blockData) => {
            this.handleNewBlock(blockData);
        });

        // Connection status updates
        this.wsManager.on('connected', () => {
            this.logger.info('WebSocket connected - real-time updates enabled');
        });

        this.wsManager.on('disconnected', () => {
            this.logger.warn('WebSocket disconnected - falling back to polling');
        });

        // Error handling to prevent application crash
        this.wsManager.on('error', (error) => {
            this.logger.error('WebSocket error occurred', {
                error: error.message,
                stack: error.stack,
                code: error.code || 'UNKNOWN'
            });
            
            // Don't crash the application, just log and continue
            // The WebSocket manager will handle reconnection automatically
        });

        // Handle max reconnection attempts reached
        this.wsManager.on('maxReconnectAttemptsReached', () => {
            this.logger.warn('WebSocket max reconnection attempts reached - disabling real-time updates');
            // Application continues to work without real-time updates
        });
    }

    /**
     * Send professional buy message with real-time updates
     */
    async sendBuyMessage(chatId, data, options = {}) {
        try {
            const message = this.formatter.formatProcessing('buy', {
                tokenSymbol: data.tokenSymbol,
                amount: data.monAmount
            });

            const keyboard = options.showKeyboard ? 
                this.formatter.createActionKeyboard({ operation: 'buy' }) : undefined;

            const sentMessage = await this.bot.telegram.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });

            // Track message for updates
            this.activeMessages.set(sentMessage.message_id, {
                chatId,
                type: 'buy_processing',
                data,
                lastUpdate: Date.now()
            });

            return sentMessage;
        } catch (error) {
            this.logger.error('Failed to send buy message', error);
            throw error;
        }
    }

    /**
     * Send professional sell message with real-time updates
     */
    async sendSellMessage(chatId, data, options = {}) {
        try {
            const message = this.formatter.formatProcessing('sell', {
                tokenSymbol: data.tokenSymbol,
                amount: data.tokenAmount
            });

            const keyboard = options.showKeyboard ? 
                this.formatter.createActionKeyboard({ operation: 'sell' }) : undefined;

            const sentMessage = await this.bot.telegram.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });

            // Track message for updates
            this.activeMessages.set(sentMessage.message_id, {
                chatId,
                type: 'sell_processing',
                data,
                lastUpdate: Date.now()
            });

            return sentMessage;
        } catch (error) {
            this.logger.error('Failed to send sell message', error);
            throw error;
        }
    }

    /**
     * Update message when transaction is submitted
     */
    async updateMessageWithTransaction(messageId, txHash, operation) {
        try {
            const messageInfo = this.activeMessages.get(messageId);
            if (!messageInfo) return;

            // Track transaction for confirmation updates
            this.pendingTransactions.set(txHash, {
                messageId,
                chatId: messageInfo.chatId,
                operation
            });

            // Subscribe to transaction updates via WebSocket
            if (this.wsManager.isConnected) {
                await this.wsManager.subscribeToTransaction(txHash);
            }

            // Update message to show transaction submitted
            const processingMessage = this.formatter.formatProcessing(operation, {
                ...messageInfo.data,
                txHash,
                status: 'submitted'
            });

            await this.bot.telegram.editMessageText(
                messageInfo.chatId,
                messageId,
                undefined,
                processingMessage,
                { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                }
            );

            // Update tracking data
            messageInfo.data.txHash = txHash;
            messageInfo.lastUpdate = Date.now();

        } catch (error) {
            this.logger.error('Failed to update message with transaction', error);
        }
    }

    /**
     * Handle transaction confirmation from WebSocket
     */
    async handleTransactionConfirmation(data) {
        const { txHash, receipt, status } = data;
        const pendingTx = this.pendingTransactions.get(txHash);
        
        if (!pendingTx) return;

        try {
            const messageInfo = this.activeMessages.get(pendingTx.messageId);
            if (!messageInfo) return;

            let finalMessage;
            let keyboard;

            if (status === 'success') {
                // Format success message
                const successData = {
                    ...messageInfo.data,
                    txHash,
                    gasUsed: parseInt(receipt.gasUsed, 16),
                    timestamp: Date.now()
                };

                if (pendingTx.operation === 'buy') {
                    finalMessage = this.formatter.formatBuySuccess(successData);
                } else if (pendingTx.operation === 'sell') {
                    finalMessage = this.formatter.formatSellSuccess(successData);
                }

                keyboard = this.formatter.createActionKeyboard({
                    txHash,
                    tokenAddress: messageInfo.data.tokenAddress,
                    operation: pendingTx.operation
                });

            } else {
                // Format error message
                finalMessage = this.formatter.formatError(
                    'Transaction failed on blockchain',
                    pendingTx.operation,
                    { txHash }
                );
            }

            // Update the message
            await this.bot.telegram.editMessageText(
                pendingTx.chatId,
                pendingTx.messageId,
                undefined,
                finalMessage,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    disable_web_page_preview: true
                }
            );

            // Clean up tracking
            this.activeMessages.delete(pendingTx.messageId);
            this.pendingTransactions.delete(txHash);

        } catch (error) {
            this.logger.error('Failed to handle transaction confirmation', error);
        }
    }

    /**
     * Send quote message with real-time price updates
     */
    async sendQuoteMessage(chatId, quoteData, options = {}) {
        try {
            const message = this.formatter.formatQuote({
                ...quoteData,
                isRealTime: this.wsManager.isConnected
            });

            const sentMessage = await this.bot.telegram.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

            // If real-time updates are enabled, track for price updates
            if (options.enablePriceUpdates && this.wsManager.isConnected) {
                this.activeMessages.set(sentMessage.message_id, {
                    chatId,
                    type: 'quote',
                    data: quoteData,
                    lastUpdate: Date.now()
                });

                // Subscribe to price updates
                this.subscribeToTokenPriceUpdates(quoteData.fromToken, sentMessage.message_id);
            }

            return sentMessage;
        } catch (error) {
            this.logger.error('Failed to send quote message', error);
            throw error;
        }
    }

    /**
     * Subscribe to token price updates
     */
    async subscribeToTokenPriceUpdates(tokenAddress, messageId) {
        try {
            const updateInterval = await this.wsManager.subscribeToTokenPrice(
                tokenAddress,
                (priceData) => {
                    this.updatePriceInMessage(messageId, priceData);
                }
            );

            // Clean up after 5 minutes
            setTimeout(() => {
                if (updateInterval) {
                    clearInterval(updateInterval);
                }
                this.activeMessages.delete(messageId);
            }, 300000);

        } catch (error) {
            this.logger.error('Failed to subscribe to price updates', error);
        }
    }

    /**
     * Update price in existing message
     */
    async updatePriceInMessage(messageId, priceData) {
        try {
            const messageInfo = this.activeMessages.get(messageId);
            if (!messageInfo) return;

            // Throttle updates (max once per 10 seconds)
            if (Date.now() - messageInfo.lastUpdate < 10000) return;

            const updatedMessage = this.formatter.formatPriceUpdate(priceData);

            await this.bot.telegram.editMessageText(
                messageInfo.chatId,
                messageId,
                undefined,
                updatedMessage,
                {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                }
            );

            messageInfo.lastUpdate = Date.now();

        } catch (error) {
            // Ignore edit errors (message might be too old)
            if (!error.message.includes('message is not modified')) {
                this.logger.error('Failed to update price in message', error);
            }
        }
    }

    /**
     * Handle new block for gas optimization updates
     */
    async handleNewBlock(blockData) {
        // Could be used to update gas price recommendations in real-time
        this.logger.debug('New block received', { blockNumber: blockData.number });
    }

    /**
     * Send error message with professional formatting
     */
    async sendErrorMessage(chatId, error, operation, details = {}) {
        try {
            const message = this.formatter.formatError(error, operation, details);

            return await this.bot.telegram.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (sendError) {
            this.logger.error('Failed to send error message', sendError);
            throw sendError;
        }
    }

    /**
     * Clean up old messages and subscriptions
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 600000; // 10 minutes

        for (const [messageId, messageInfo] of this.activeMessages.entries()) {
            if (now - messageInfo.lastUpdate > maxAge) {
                this.activeMessages.delete(messageId);
            }
        }

        // Clean up old pending transactions
        for (const [txHash, txInfo] of this.pendingTransactions.entries()) {
            const messageInfo = this.activeMessages.get(txInfo.messageId);
            if (!messageInfo) {
                this.pendingTransactions.delete(txHash);
            }
        }
    }

    /**
     * Get status information
     */
    getStatus() {
        return {
            wsStatus: this.wsManager.getStatus(),
            activeMessages: this.activeMessages.size,
            pendingTransactions: this.pendingTransactions.size,
            realTimeEnabled: this.wsManager.isConnected
        };
    }

    /**
     * Shutdown and cleanup
     */
    shutdown() {
        this.wsManager.disconnect();
        this.activeMessages.clear();
        this.pendingTransactions.clear();
    }
}

module.exports = RealTimeMessageUpdater;