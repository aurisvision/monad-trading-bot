/**
 * Enhanced WebSocket Manager for Real-time Trading Updates
 * Provides real-time price feeds, transaction monitoring, and live updates
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const Logger = require('./Logger');

class EnhancedWebSocketManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.wsUrl = options.wsUrl || process.env.MONAD_WSS_URL;
        this.enabled = options.enabled !== false && process.env.WSS_ENABLED !== 'false';
        this.reconnectInterval = options.reconnectInterval || parseInt(process.env.WSS_RECONNECT_INTERVAL) || 5000;
        this.maxReconnectAttempts = options.maxReconnectAttempts || parseInt(process.env.WSS_MAX_RECONNECT_ATTEMPTS) || 10;
        this.heartbeatInterval = options.heartbeatInterval || parseInt(process.env.WSS_HEARTBEAT_INTERVAL) || 30000;
        
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.subscriptions = new Map();
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        
        this.logger = Logger;
        
        // Initialize if enabled
        if (this.enabled && this.wsUrl) {
            this.connect();
        }
    }

    /**
     * Connect to WebSocket
     */
    async connect() {
        if (!this.wsUrl) {
            this.logger.warn('WebSocket URL not configured');
            return false;
        }

        try {
            this.logger.info('Connecting to WebSocket', { url: this.wsUrl });
            
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.on('open', () => {
                this.logger.info('WebSocket connected successfully');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.resubscribeAll();
                this.emit('connected');
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code, reason) => {
                this.logger.warn('WebSocket disconnected', { code, reason: reason.toString() });
                this.isConnected = false;
                this.stopHeartbeat();
                this.scheduleReconnect();
                this.emit('disconnected', { code, reason });
            });

            this.ws.on('error', (error) => {
                this.logger.error('WebSocket error', error);
                this.emit('error', error);
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to connect WebSocket', error);
            this.scheduleReconnect();
            return false;
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            // Handle different message types
            switch (message.method) {
                case 'eth_subscription':
                    this.handleSubscriptionMessage(message);
                    break;
                case 'eth_newBlockHeaders':
                    this.emit('newBlock', message.params);
                    break;
                case 'eth_pendingTransactions':
                    this.emit('pendingTransaction', message.params);
                    break;
                default:
                    this.emit('message', message);
            }
        } catch (error) {
            this.logger.error('Failed to parse WebSocket message', error);
        }
    }

    /**
     * Handle subscription messages
     */
    handleSubscriptionMessage(message) {
        const { subscription, result } = message.params;
        
        if (this.subscriptions.has(subscription)) {
            const subInfo = this.subscriptions.get(subscription);
            this.emit(subInfo.event, result, subInfo.data);
        }
    }

    /**
     * Subscribe to new block headers
     */
    async subscribeToBlocks() {
        if (!this.isConnected) return null;

        const subscriptionId = await this.sendRequest({
            id: this.generateId(),
            method: 'eth_subscribe',
            params: ['newHeads']
        });

        if (subscriptionId) {
            this.subscriptions.set(subscriptionId, {
                type: 'newHeads',
                event: 'newBlock'
            });
        }

        return subscriptionId;
    }

    /**
     * Subscribe to pending transactions
     */
    async subscribeToPendingTransactions() {
        if (!this.isConnected) return null;

        const subscriptionId = await this.sendRequest({
            id: this.generateId(),
            method: 'eth_subscribe',
            params: ['newPendingTransactions']
        });

        if (subscriptionId) {
            this.subscriptions.set(subscriptionId, {
                type: 'pendingTransactions',
                event: 'pendingTransaction'
            });
        }

        return subscriptionId;
    }

    /**
     * Subscribe to specific transaction
     */
    async subscribeToTransaction(txHash) {
        if (!this.isConnected) return null;

        // Monitor transaction status changes
        const checkTransaction = async () => {
            try {
                const receipt = await this.sendRequest({
                    id: this.generateId(),
                    method: 'eth_getTransactionReceipt',
                    params: [txHash]
                });

                if (receipt) {
                    this.emit('transactionConfirmed', {
                        txHash,
                        receipt,
                        status: receipt.status === '0x1' ? 'success' : 'failed'
                    });
                    return true;
                }
                return false;
            } catch (error) {
                this.logger.error('Error checking transaction', error);
                return false;
            }
        };

        // Check immediately and then poll
        const confirmed = await checkTransaction();
        if (!confirmed) {
            const interval = setInterval(async () => {
                const confirmed = await checkTransaction();
                if (confirmed) {
                    clearInterval(interval);
                }
            }, 2000);

            // Clear interval after 5 minutes
            setTimeout(() => clearInterval(interval), 300000);
        }
    }

    /**
     * Subscribe to token price updates (simulated for now)
     */
    async subscribeToTokenPrice(tokenAddress, callback) {
        // This would integrate with a price feed WebSocket
        // For now, we'll simulate with periodic updates
        const priceUpdateInterval = setInterval(async () => {
            try {
                // In real implementation, this would come from price feed WebSocket
                const mockPriceData = {
                    tokenAddress,
                    price: Math.random() * 100,
                    change24h: (Math.random() - 0.5) * 20,
                    volume24h: Math.random() * 1000000,
                    timestamp: Date.now()
                };
                
                callback(mockPriceData);
            } catch (error) {
                this.logger.error('Error in price update', error);
            }
        }, 10000); // Update every 10 seconds

        return priceUpdateInterval;
    }

    /**
     * Send WebSocket request
     */
    async sendRequest(request) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('WebSocket not connected'));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 10000);

            const messageHandler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id === request.id) {
                        clearTimeout(timeout);
                        this.ws.off('message', messageHandler);
                        
                        if (response.error) {
                            reject(new Error(response.error.message));
                        } else {
                            resolve(response.result);
                        }
                    }
                } catch (error) {
                    // Ignore parsing errors for other messages
                }
            };

            this.ws.on('message', messageHandler);
            this.ws.send(JSON.stringify(request));
        });
    }

    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                this.ws.ping();
            }
        }, this.heartbeatInterval);
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Schedule reconnection
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('Max reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

        this.logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Resubscribe to all active subscriptions
     */
    async resubscribeAll() {
        const subscriptionTypes = Array.from(this.subscriptions.values());
        this.subscriptions.clear();

        for (const sub of subscriptionTypes) {
            try {
                switch (sub.type) {
                    case 'newHeads':
                        await this.subscribeToBlocks();
                        break;
                    case 'pendingTransactions':
                        await this.subscribeToPendingTransactions();
                        break;
                }
            } catch (error) {
                this.logger.error('Failed to resubscribe', error);
            }
        }
    }

    /**
     * Generate unique request ID
     */
    generateId() {
        return Math.floor(Math.random() * 1000000);
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        this.enabled = false;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.stopHeartbeat();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.subscriptions.clear();
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            enabled: this.enabled,
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            subscriptions: this.subscriptions.size,
            url: this.wsUrl
        };
    }
}

module.exports = EnhancedWebSocketManager;