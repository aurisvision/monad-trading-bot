const EventEmitter = require('events');
const WebSocket = require('ws');
const logger = require('./Logger');

/**
 * WebSocketManager - Centralized WebSocket connection and subscription management
 * Provides real-time data streaming for price feeds, transaction monitoring, and portfolio updates
 */
class WebSocketManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Configuration with defaults
        this.config = {
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
            reconnectDelay: config.reconnectDelay || 5000,
            heartbeatInterval: config.heartbeatInterval || 30000,
            connectionTimeout: config.connectionTimeout || 10000,
            maxSubscriptions: config.maxSubscriptions || 100,
            ...config
        };
        
        // Connection state
        this.connections = new Map(); // endpoint -> WebSocket instance
        this.subscriptions = new Map(); // subscriptionId -> subscription details
        this.reconnectAttempts = new Map(); // endpoint -> attempt count
        this.heartbeatIntervals = new Map(); // endpoint -> interval ID
        
        // Metrics for monitoring
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            totalSubscriptions: 0,
            messagesReceived: 0,
            messagesSent: 0,
            reconnectCount: 0,
            lastError: null,
            uptime: Date.now()
        };
        
        // Event handlers
        this.setupEventHandlers();
        
        logger.info('WebSocketManager initialized', {
            config: this.config,
            maxSubscriptions: this.config.maxSubscriptions,
            connectionTimeout: this.config.connectionTimeout
        }, { category: 'websocket' });
    }
    
    /**
     * Connect to a WebSocket endpoint
     * @param {string} endpoint - WebSocket URL
     * @param {Object} options - Connection options
     * @returns {Promise<boolean>} - Connection success status
     */
    async connect(endpoint, options = {}) {
        const operationId = logger.webSocketConnect(endpoint, {
            options,
            activeConnections: this.metrics.activeConnections,
            totalConnections: this.metrics.totalConnections
        });
        
        try {
            if (this.connections.has(endpoint)) {
                logger.warn('WebSocket connection already exists', {
                    endpoint,
                    activeConnections: this.metrics.activeConnections
                }, { category: 'websocket' });
                return true;
            }
            
            const ws = new WebSocket(endpoint, {
                handshakeTimeout: this.config.connectionTimeout,
                ...options
            });
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.terminate();
                    const timeoutError = new Error(`Connection timeout to ${endpoint}`);
                    logger.webSocketError(endpoint, timeoutError, {
                        operationId,
                        timeout: this.config.connectionTimeout,
                        reason: 'connection_timeout'
                    });
                    reject(timeoutError);
                }, this.config.connectionTimeout);
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    this.connections.set(endpoint, ws);
                    this.metrics.totalConnections++;
                    this.metrics.activeConnections++;
                    this.reconnectAttempts.delete(endpoint);
                    
                    this.setupWebSocketHandlers(endpoint, ws);
                    this.startHeartbeat(endpoint);
                    
                    logger.webSocketConnected(operationId, endpoint, {
                        totalConnections: this.metrics.totalConnections,
                        activeConnections: this.metrics.activeConnections,
                        heartbeatInterval: this.config.heartbeatInterval
                    });
                    
                    this.emit('connected', endpoint);
                    resolve(true);
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    this.metrics.lastError = error.message;
                    
                    logger.webSocketError(endpoint, error, {
                        operationId,
                        phase: 'connection',
                        totalAttempts: this.metrics.totalConnections
                    });
                    
                    reject(error);
                });
            });
            
        } catch (error) {
            this.metrics.lastError = error.message;
            
            logger.webSocketError(endpoint, error, {
                operationId,
                phase: 'initialization',
                config: this.config
            });
            
            return false;
        }
    }
    
    /**
     * Disconnect from a WebSocket endpoint
     * @param {string} endpoint - WebSocket URL
     */
    disconnect(endpoint) {
        const ws = this.connections.get(endpoint);
        if (ws) {
            const subscriptionsRemoved = [];
            
            // Remove related subscriptions
            for (const [subId, sub] of this.subscriptions.entries()) {
                if (sub.endpoint === endpoint) {
                    subscriptionsRemoved.push({ id: subId, type: sub.type });
                    this.subscriptions.delete(subId);
                    this.metrics.totalSubscriptions--;
                }
            }
            
            this.stopHeartbeat(endpoint);
            ws.close();
            this.connections.delete(endpoint);
            this.metrics.activeConnections--;
            
            logger.webSocketDisconnect(endpoint, 'manual_disconnect', {
                subscriptionsRemoved: subscriptionsRemoved.length,
                removedSubscriptions: subscriptionsRemoved,
                activeConnections: this.metrics.activeConnections,
                totalSubscriptions: this.metrics.totalSubscriptions
            });
            
            this.emit('disconnected', endpoint);
        } else {
            logger.warn('Attempted to disconnect from non-existent WebSocket', {
                endpoint,
                activeConnections: this.metrics.activeConnections
            }, { category: 'websocket' });
        }
    }
    
    /**
     * Subscribe to real-time data
     * @param {string} endpoint - WebSocket URL
     * @param {string} type - Subscription type (price, transaction, portfolio)
     * @param {Object} params - Subscription parameters
     * @param {Function} callback - Data callback function
     * @returns {string} - Subscription ID
     */
    async subscribe(endpoint, type, params = {}, callback) {
        try {
            // Ensure connection exists
            if (!this.connections.has(endpoint)) {
                const connected = await this.connect(endpoint);
                if (!connected) {
                    throw new Error(`Failed to connect to ${endpoint}`);
                }
            }
            
            // Check subscription limits
            if (this.subscriptions.size >= this.config.maxSubscriptions) {
                throw new Error('Maximum subscriptions limit reached');
            }
            
            const subscriptionId = this.generateSubscriptionId(type, params);
            const subscription = {
                id: subscriptionId,
                endpoint,
                type,
                params,
                callback,
                createdAt: Date.now(),
                active: true
            };
            
            this.subscriptions.set(subscriptionId, subscription);
            this.metrics.totalSubscriptions++;
            
            // Send subscription message
            const subscribeMessage = this.createSubscriptionMessage(type, params, subscriptionId);
            this.send(endpoint, subscribeMessage);
            
            console.log(`[WebSocketManager] Subscribed to ${type} on ${endpoint} with ID: ${subscriptionId}`);
            this.emit('subscribed', subscriptionId, subscription);
            
            return subscriptionId;
            
        } catch (error) {
            console.error(`[WebSocketManager] Subscription failed:`, error.message);
            this.metrics.lastError = error.message;
            throw error;
        }
    }
    
    /**
     * Unsubscribe from real-time data
     * @param {string} subscriptionId - Subscription ID
     */
    unsubscribe(subscriptionId) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription) {
            // Send unsubscribe message
            const unsubscribeMessage = this.createUnsubscriptionMessage(subscription);
            this.send(subscription.endpoint, unsubscribeMessage);
            
            this.subscriptions.delete(subscriptionId);
            this.metrics.totalSubscriptions--;
            
            console.log(`[WebSocketManager] Unsubscribed from ${subscriptionId}`);
            this.emit('unsubscribed', subscriptionId);
        }
    }
    
    /**
     * Send message to WebSocket endpoint
     * @param {string} endpoint - WebSocket URL
     * @param {Object} message - Message to send
     */
    send(endpoint, message) {
        const ws = this.connections.get(endpoint);
        if (ws && ws.readyState === WebSocket.OPEN) {
            const messageStr = JSON.stringify(message);
            ws.send(messageStr);
            this.metrics.messagesSent++;
            console.log(`[WebSocketManager] Sent message to ${endpoint}:`, message);
        } else {
            console.warn(`[WebSocketManager] Cannot send message - no active connection to ${endpoint}`);
        }
    }
    
    /**
     * Setup WebSocket event handlers for a connection
     * @param {string} endpoint - WebSocket URL
     * @param {WebSocket} ws - WebSocket instance
     */
    setupWebSocketHandlers(endpoint, ws) {
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.metrics.messagesReceived++;
                
                logger.webSocketMessage(endpoint, 'received', message.type || 'unknown', {
                    messageSize: data.length,
                    totalMessagesReceived: this.metrics.messagesReceived,
                    hasData: !!message.data
                });
                
                this.handleMessage(endpoint, message);
            } catch (error) {
                logger.webSocketError(endpoint, error, {
                    operation: 'message_parsing',
                    dataLength: data.length,
                    rawData: data.toString().substring(0, 100)
                });
            }
        });
        
        ws.on('close', (code, reason) => {
            logger.webSocketDisconnect(endpoint, reason || 'unknown', {
                closeCode: code,
                wasClean: code === 1000,
                activeConnections: this.metrics.activeConnections - 1
            });
            this.handleDisconnection(endpoint);
        });
        
        ws.on('error', (error) => {
            this.metrics.lastError = error.message;
            logger.webSocketError(endpoint, error, {
                operation: 'websocket_error',
                activeConnections: this.metrics.activeConnections,
                totalErrors: this.metrics.lastError ? 1 : 0
            });
            this.emit('error', endpoint, error);
        });
        
        ws.on('pong', () => {
            logger.debug('WebSocket pong received', {
                endpoint,
                heartbeatActive: this.heartbeatIntervals.has(endpoint)
            }, { category: 'websocket' });
        });
    }
    
    /**
     * Handle incoming WebSocket messages
     * @param {string} endpoint - WebSocket URL
     * @param {Object} message - Parsed message
     */
    handleMessage(endpoint, message) {
        const matchedSubscriptions = [];
        const callbackErrors = [];
        
        // Route message to appropriate subscriptions
        for (const [subId, subscription] of this.subscriptions.entries()) {
            if (subscription.endpoint === endpoint && subscription.active) {
                if (this.messageMatchesSubscription(message, subscription)) {
                    matchedSubscriptions.push({ id: subId, type: subscription.type });
                    
                    try {
                        const callbackTimer = logger.startTimer(`callback_${subscription.type}`, {
                            subscriptionId: subId,
                            messageType: message.type
                        });
                        
                        subscription.callback(message, subscription);
                        
                        logger.endTimer(callbackTimer, {
                            success: true,
                            subscriptionType: subscription.type
                        });
                        
                    } catch (error) {
                        callbackErrors.push({ subscriptionId: subId, error: error.message });
                        
                        logger.error('WebSocket callback error', error, {
                            subscriptionId: subId,
                            subscriptionType: subscription.type,
                            messageType: message.type,
                            endpoint
                        }, { category: 'websocket' });
                    }
                }
            }
        }
        
        logger.debug('WebSocket message processed', {
            endpoint,
            messageType: message.type,
            matchedSubscriptions: matchedSubscriptions.length,
            subscriptionDetails: matchedSubscriptions,
            callbackErrors: callbackErrors.length,
            errorDetails: callbackErrors
        }, { category: 'websocket' });
        
        this.emit('message', endpoint, message);
    }
    
    /**
     * Handle WebSocket disconnection
     * @param {string} endpoint - WebSocket URL
     */
    handleDisconnection(endpoint) {
        this.stopHeartbeat(endpoint);
        this.connections.delete(endpoint);
        this.metrics.activeConnections--;
        
        // Attempt reconnection if configured
        this.attemptReconnection(endpoint);
        
        this.emit('disconnected', endpoint);
    }
    
    /**
     * Attempt to reconnect to an endpoint
     * @param {string} endpoint - WebSocket URL
     */
    async attemptReconnection(endpoint) {
        const attempts = this.reconnectAttempts.get(endpoint) || 0;
        
        if (attempts < this.config.maxReconnectAttempts) {
            this.reconnectAttempts.set(endpoint, attempts + 1);
            this.metrics.reconnectCount++;
            
            console.log(`[WebSocketManager] Attempting reconnection to ${endpoint} (${attempts + 1}/${this.config.maxReconnectAttempts})`);
            
            setTimeout(async () => {
                try {
                    await this.connect(endpoint);
                    
                    // Resubscribe to active subscriptions
                    for (const [subId, subscription] of this.subscriptions.entries()) {
                        if (subscription.endpoint === endpoint && subscription.active) {
                            const subscribeMessage = this.createSubscriptionMessage(
                                subscription.type, 
                                subscription.params, 
                                subscription.id
                            );
                            this.send(endpoint, subscribeMessage);
                        }
                    }
                    
                } catch (error) {
                    console.error(`[WebSocketManager] Reconnection failed to ${endpoint}:`, error.message);
                    this.attemptReconnection(endpoint);
                }
            }, this.config.reconnectDelay);
        } else {
            console.error(`[WebSocketManager] Max reconnection attempts reached for ${endpoint}`);
            this.reconnectAttempts.delete(endpoint);
            this.emit('reconnectionFailed', endpoint);
        }
    }
    
    /**
     * Start heartbeat for connection
     * @param {string} endpoint - WebSocket URL
     */
    startHeartbeat(endpoint) {
        const interval = setInterval(() => {
            const ws = this.connections.get(endpoint);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.ping();
            } else {
                this.stopHeartbeat(endpoint);
            }
        }, this.config.heartbeatInterval);
        
        this.heartbeatIntervals.set(endpoint, interval);
    }
    
    /**
     * Stop heartbeat for connection
     * @param {string} endpoint - WebSocket URL
     */
    stopHeartbeat(endpoint) {
        const interval = this.heartbeatIntervals.get(endpoint);
        if (interval) {
            clearInterval(interval);
            this.heartbeatIntervals.delete(endpoint);
        }
    }
    
    /**
     * Generate unique subscription ID
     * @param {string} type - Subscription type
     * @param {Object} params - Subscription parameters
     * @returns {string} - Unique subscription ID
     */
    generateSubscriptionId(type, params) {
        const timestamp = Date.now();
        const paramStr = JSON.stringify(params);
        const hash = require('crypto').createHash('md5').update(`${type}-${paramStr}-${timestamp}`).digest('hex');
        return `${type}_${hash.substring(0, 8)}`;
    }
    
    /**
     * Create subscription message for WebSocket
     * @param {string} type - Subscription type
     * @param {Object} params - Subscription parameters
     * @param {string} subscriptionId - Subscription ID
     * @returns {Object} - Subscription message
     */
    createSubscriptionMessage(type, params, subscriptionId) {
        return {
            method: 'subscribe',
            id: subscriptionId,
            type: type,
            params: params
        };
    }
    
    /**
     * Create unsubscription message for WebSocket
     * @param {Object} subscription - Subscription details
     * @returns {Object} - Unsubscription message
     */
    createUnsubscriptionMessage(subscription) {
        return {
            method: 'unsubscribe',
            id: subscription.id,
            type: subscription.type
        };
    }
    
    /**
     * Check if message matches subscription criteria
     * @param {Object} message - WebSocket message
     * @param {Object} subscription - Subscription details
     * @returns {boolean} - Match status
     */
    messageMatchesSubscription(message, subscription) {
        // Basic matching logic - can be extended based on specific protocols
        return message.type === subscription.type || 
               message.subscription === subscription.id ||
               message.id === subscription.id;
    }
    
    /**
     * Setup global event handlers
     */
    setupEventHandlers() {
        this.on('error', (endpoint, error) => {
            console.error(`[WebSocketManager] Global error handler - ${endpoint}:`, error.message);
        });
        
        this.on('reconnectionFailed', (endpoint) => {
            console.error(`[WebSocketManager] Reconnection failed for ${endpoint} - removing all subscriptions`);
            // Clean up subscriptions for failed endpoint
            for (const [subId, subscription] of this.subscriptions.entries()) {
                if (subscription.endpoint === endpoint) {
                    this.subscriptions.delete(subId);
                    this.metrics.totalSubscriptions--;
                }
            }
        });
    }
    
    /**
     * Get current metrics and status
     * @returns {Object} - Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeConnections: this.connections.size,
            totalSubscriptions: this.subscriptions.size,
            uptime: Date.now() - this.metrics.uptime,
            connections: Array.from(this.connections.keys()),
            subscriptions: Array.from(this.subscriptions.keys())
        };
    }
    
    /**
     * Get subscription details
     * @param {string} subscriptionId - Subscription ID
     * @returns {Object|null} - Subscription details
     */
    getSubscription(subscriptionId) {
        return this.subscriptions.get(subscriptionId) || null;
    }
    
    /**
     * Get all active subscriptions for an endpoint
     * @param {string} endpoint - WebSocket URL
     * @returns {Array} - Array of subscriptions
     */
    getSubscriptionsForEndpoint(endpoint) {
        const subscriptions = [];
        for (const [subId, subscription] of this.subscriptions.entries()) {
            if (subscription.endpoint === endpoint && subscription.active) {
                subscriptions.push(subscription);
            }
        }
        return subscriptions;
    }
    
    /**
     * Cleanup and close all connections
     */
    cleanup() {
        console.log('[WebSocketManager] Cleaning up all connections...');
        
        // Clear all heartbeat intervals
        for (const interval of this.heartbeatIntervals.values()) {
            clearInterval(interval);
        }
        this.heartbeatIntervals.clear();
        
        // Close all WebSocket connections
        for (const [endpoint, ws] of this.connections.entries()) {
            ws.close();
        }
        this.connections.clear();
        
        // Clear all subscriptions
        this.subscriptions.clear();
        
        // Reset metrics
        this.metrics.activeConnections = 0;
        this.metrics.totalSubscriptions = 0;
        
        console.log('[WebSocketManager] Cleanup completed');
    }
}

module.exports = WebSocketManager;