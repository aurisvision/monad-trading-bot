const { ethers } = require('ethers');
const WebSocketManager = require('./WebSocketManager');
const { secureLogger } = require('./secureLogger');

class RPCManager {
    constructor() {
        // RPC endpoints ordered by priority
        this.rpcEndpoints = [
             process.env.MONAD_RPC_URL || 'https://lb.drpc.live/monad-testnet/AoOgZcz1jUo2kLGq0kMoG3ovAOf-o9gR8IGdwg8TMB_n'
        ];
        
        // Track status of each RPC
        this.rpcStatus = {};
        this.currentRpcIndex = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        
        // Network configuration
        this.networkConfig = {
            chainId: parseInt(process.env.CHAIN_ID) || 10143,
            name: 'monad-testnet'
        };
        
        // WebSocket integration
        this.webSocketEnabled = process.env.WEBSOCKET_ENABLED === 'true';
        this.webSocketManager = null;
        
        if (this.webSocketEnabled) {
            this.initializeWebSocketManager();
        }
        
        // Initialize RPC endpoints status
        this.initializeRpcStatus();
        
        console.log('RPCManager initialized', {
            endpoints: this.rpcEndpoints.length,
            primaryRpc: this.rpcEndpoints[0],
            webSocketEnabled: this.webSocketEnabled
        });
    }
    
    /**
     * Initialize WebSocket Manager with configuration
     */
    initializeWebSocketManager() {
        try {
            const webSocketConfig = {
                maxReconnectAttempts: parseInt(process.env.WEBSOCKET_MAX_RECONNECT_ATTEMPTS) || 10,
                reconnectDelay: parseInt(process.env.WEBSOCKET_RECONNECT_DELAY) || 5000,
                heartbeatInterval: parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL) || 30000,
                connectionTimeout: parseInt(process.env.WEBSOCKET_CONNECTION_TIMEOUT) || 10000,
                maxSubscriptions: parseInt(process.env.WEBSOCKET_MAX_SUBSCRIPTIONS) || 100
            };
            
            this.webSocketManager = new WebSocketManager(webSocketConfig);
            
            // Setup WebSocket event handlers
            this.webSocketManager.on('connected', (endpoint) => {
                secureLogger.info('WebSocket connected', { endpoint });
            });
            
            this.webSocketManager.on('disconnected', (endpoint) => {
                secureLogger.warn('WebSocket disconnected', { endpoint });
            });
            
            this.webSocketManager.on('error', (endpoint, error) => {
                secureLogger.error('WebSocket error', { endpoint, error: error.message });
            });
            
            this.webSocketManager.on('reconnectionFailed', (endpoint) => {
                console.error('WebSocket reconnection failed', { endpoint });
            });
            
            console.log('WebSocketManager initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize WebSocketManager', { error: error.message });
            this.webSocketEnabled = false;
        }
    }

    /**
     * Initialize RPC endpoints status
     */
    initializeRpcStatus() {
        this.rpcEndpoints.forEach((endpoint, index) => {
            this.rpcStatus[endpoint] = {
                isHealthy: true,
                lastError: null,
                errorCount: 0,
                lastChecked: Date.now(),
                responseTime: 0
            };
        });
    }
    
    /**
     * Get provider with fallback support
     */
    async getProvider() {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            const rpcUrl = this.getCurrentRpc();
            
            try {
                const provider = new ethers.JsonRpcProvider(rpcUrl, this.networkConfig);
                
                // Test connection
                const startTime = Date.now();
                await provider.getNetwork();
                const responseTime = Date.now() - startTime;
                
                // Update RPC status
                this.updateRpcStatus(rpcUrl, true, null, responseTime);
                
                secureLogger.debug('RPC connection successful', {
                    rpcUrl: this.maskRpcUrl(rpcUrl),
                    responseTime,
                    attempt: attempt + 1
                });
                
                return provider;
                
            } catch (error) {
                secureLogger.warn('RPC connection failed', {
                    rpcUrl: this.maskRpcUrl(rpcUrl),
                    error: error.message,
                    attempt: attempt + 1
                });
                
                // Update RPC status
                this.updateRpcStatus(rpcUrl, false, error.message);
                
                // Switch to next RPC
                this.switchToNextRpc();
                
                // Wait before next attempt
                if (attempt < this.maxRetries - 1) {
                    await this.delay(this.retryDelay * (attempt + 1));
                }
            }
        }
        
        throw new Error('All RPC endpoints failed after maximum retries');
    }
    
    /**
     * Execute request with fallback support
     */
    async executeWithFallback(operation, operationName = 'RPC_OPERATION') {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const provider = await this.getProvider();
                const startTime = Date.now();
                
                const result = await operation(provider);
                
                const responseTime = Date.now() - startTime;
                secureLogger.debug(`${operationName} successful`, {
                    rpcUrl: this.maskRpcUrl(this.getCurrentRpc()),
                    responseTime,
                    attempt: attempt + 1
                });
                
                return result;
                
            } catch (error) {
                const isRateLimitError = this.isRateLimitError(error);
                const isNetworkError = this.isNetworkError(error);
                
                secureLogger.warn(`${operationName} failed`, {
                    rpcUrl: this.maskRpcUrl(this.getCurrentRpc()),
                    error: error.message,
                    isRateLimitError,
                    isNetworkError,
                    attempt: attempt + 1
                });
                
                // If rate limiting, switch immediately to next RPC
                if (isRateLimitError) {
                    this.markRpcAsRateLimited(this.getCurrentRpc());
                    this.switchToNextRpc();
                    
                    // Shorter wait for rate limiting
                    if (attempt < this.maxRetries - 1) {
                        await this.delay(500);
                    }
                    continue;
                }
                
                // For other errors, try next RPC
                if (isNetworkError && attempt < this.maxRetries - 1) {
                    this.switchToNextRpc();
                    await this.delay(this.retryDelay * (attempt + 1));
                    continue;
                }
                
                // If last attempt, throw error
                if (attempt === this.maxRetries - 1) {
                    throw error;
                }
            }
        }
    }
    
    /**
     * Check if error is rate limiting
     */
    isRateLimitError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return errorMessage.includes('rate limit') || 
               errorMessage.includes('too many requests') ||
               errorMessage.includes('request limit reached') ||
               error.code === -32007;
    }
    
    /**
     * Check if error is network error
     */
    isNetworkError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return errorMessage.includes('network') ||
               errorMessage.includes('timeout') ||
               errorMessage.includes('connection') ||
               errorMessage.includes('fetch');
    }
    
    /**
     * Mark RPC as rate limited
     */
    markRpcAsRateLimited(rpcUrl) {
        if (this.rpcStatus[rpcUrl]) {
            this.rpcStatus[rpcUrl].isHealthy = false;
            this.rpcStatus[rpcUrl].lastError = 'Rate limited';
            this.rpcStatus[rpcUrl].errorCount++;
            
            // Re-enable RPC after 60 seconds
            setTimeout(() => {
                if (this.rpcStatus[rpcUrl]) {
                    this.rpcStatus[rpcUrl].isHealthy = true;
                    this.rpcStatus[rpcUrl].lastError = null;
                    secureLogger.info('RPC re-enabled after rate limit cooldown', {
                        rpcUrl: this.maskRpcUrl(rpcUrl)
                    });
                }
            }, 60000); // 60 seconds
        }
    }
    
    /**
     * Update RPC status
     */
    updateRpcStatus(rpcUrl, isHealthy, error = null, responseTime = 0) {
        if (this.rpcStatus[rpcUrl]) {
            this.rpcStatus[rpcUrl].isHealthy = isHealthy;
            this.rpcStatus[rpcUrl].lastError = error;
            this.rpcStatus[rpcUrl].lastChecked = Date.now();
            this.rpcStatus[rpcUrl].responseTime = responseTime;
            
            if (!isHealthy) {
                this.rpcStatus[rpcUrl].errorCount++;
            } else {
                this.rpcStatus[rpcUrl].errorCount = 0;
            }
        }
    }
    
    /**
     * Get current RPC endpoint
     */
    getCurrentRpc() {
        return this.rpcEndpoints[this.currentRpcIndex];
    }
    
    /**
     * Switch to next RPC endpoint
     */
    switchToNextRpc() {
        const previousRpc = this.getCurrentRpc();
        this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcEndpoints.length;
        const newRpc = this.getCurrentRpc();
        
        secureLogger.info('Switching RPC endpoint', {
            from: this.maskRpcUrl(previousRpc),
            to: this.maskRpcUrl(newRpc)
        });
    }
    
    /**
     * Mask URL for security in logs
     */
    maskRpcUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}`;
        } catch {
            return 'unknown';
        }
    }
    
    /**
     * Wait for specified duration
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get status of all RPC endpoints
     */
    getRpcStatus() {
        return Object.entries(this.rpcStatus).map(([url, status]) => ({
            url: this.maskRpcUrl(url),
            isHealthy: status.isHealthy,
            lastError: status.lastError,
            errorCount: status.errorCount,
            responseTime: status.responseTime,
            lastChecked: new Date(status.lastChecked).toISOString()
        }));
    }
    
    /**
     * Reset status of all RPC endpoints
     */
    resetAllRpcStatus() {
        this.initializeRpcStatus();
        this.currentRpcIndex = 0;
        secureLogger.info('All RPC status reset');
    }

    /**
     * Subscribe to real-time price feeds via WebSocket
     * @param {Array} symbols - Array of trading symbols to monitor
     * @param {Function} callback - Callback function for price updates
     * @returns {Promise<string>} - Subscription ID
     */
    async subscribeToPriceFeeds(symbols, callback) {
        if (!this.webSocketEnabled || !this.webSocketManager) {
            throw new Error('WebSocket is not enabled or initialized');
        }

        try {
            const endpoint = process.env.WEBSOCKET_PRICE_FEED_URL;
            if (!endpoint) {
                throw new Error('WEBSOCKET_PRICE_FEED_URL not configured');
            }

            const subscriptionId = await this.webSocketManager.subscribe(
                endpoint,
                'price',
                { symbols },
                callback
            );

            secureLogger.info('Subscribed to price feeds', { 
                symbols, 
                subscriptionId,
                endpoint: this.maskRpcUrl(endpoint)
            });

            return subscriptionId;

        } catch (error) {
            secureLogger.error('Failed to subscribe to price feeds', { 
                symbols, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Subscribe to real-time transaction monitoring via WebSocket
     * @param {string} address - Wallet address to monitor
     * @param {Function} callback - Callback function for transaction updates
     * @returns {Promise<string>} - Subscription ID
     */
    async subscribeToTransactionMonitoring(address, callback) {
        if (!this.webSocketEnabled || !this.webSocketManager) {
            throw new Error('WebSocket is not enabled or initialized');
        }

        try {
            const endpoint = process.env.WEBSOCKET_TRANSACTION_MONITOR_URL;
            if (!endpoint) {
                throw new Error('WEBSOCKET_TRANSACTION_MONITOR_URL not configured');
            }

            const subscriptionId = await this.webSocketManager.subscribe(
                endpoint,
                'transaction',
                { address },
                callback
            );

            secureLogger.info('Subscribed to transaction monitoring', { 
                address, 
                subscriptionId,
                endpoint: this.maskRpcUrl(endpoint)
            });

            return subscriptionId;

        } catch (error) {
            secureLogger.error('Failed to subscribe to transaction monitoring', { 
                address, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Subscribe to real-time portfolio updates via WebSocket
     * @param {string} userId - User ID for portfolio monitoring
     * @param {Function} callback - Callback function for portfolio updates
     * @returns {Promise<string>} - Subscription ID
     */
    async subscribeToPortfolioUpdates(userId, callback) {
        if (!this.webSocketEnabled || !this.webSocketManager) {
            throw new Error('WebSocket is not enabled or initialized');
        }

        try {
            const endpoint = process.env.WEBSOCKET_PORTFOLIO_UPDATES_URL;
            if (!endpoint) {
                throw new Error('WEBSOCKET_PORTFOLIO_UPDATES_URL not configured');
            }

            const subscriptionId = await this.webSocketManager.subscribe(
                endpoint,
                'portfolio',
                { userId },
                callback
            );

            secureLogger.info('Subscribed to portfolio updates', { 
                userId, 
                subscriptionId,
                endpoint: this.maskRpcUrl(endpoint)
            });

            return subscriptionId;

        } catch (error) {
            secureLogger.error('Failed to subscribe to portfolio updates', { 
                userId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Unsubscribe from WebSocket subscription
     * @param {string} subscriptionId - Subscription ID to unsubscribe
     */
    unsubscribeFromWebSocket(subscriptionId) {
        if (!this.webSocketEnabled || !this.webSocketManager) {
            secureLogger.warn('WebSocket is not enabled - cannot unsubscribe', { subscriptionId });
            return;
        }

        try {
            this.webSocketManager.unsubscribe(subscriptionId);
            secureLogger.info('Unsubscribed from WebSocket', { subscriptionId });
        } catch (error) {
            secureLogger.error('Failed to unsubscribe from WebSocket', { 
                subscriptionId, 
                error: error.message 
            });
        }
    }

    /**
     * Get WebSocket metrics and status
     * @returns {Object} - WebSocket metrics
     */
    getWebSocketMetrics() {
        if (!this.webSocketEnabled || !this.webSocketManager) {
            return { enabled: false, message: 'WebSocket not enabled or initialized' };
        }

        return {
            enabled: true,
            ...this.webSocketManager.getMetrics()
        };
    }

    /**
     * Get comprehensive status including RPC and WebSocket
     * @returns {Object} - Complete status information
     */
    getComprehensiveStatus() {
        return {
            rpc: {
                endpoints: this.getRpcStatus(),
                currentEndpoint: this.maskRpcUrl(this.getCurrentRpc()),
                totalEndpoints: this.rpcEndpoints.length
            },
            webSocket: this.getWebSocketMetrics(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Cleanup all connections and subscriptions
     */
    cleanup() {
        secureLogger.info('RPCManager cleanup initiated');
        
        if (this.webSocketManager) {
            this.webSocketManager.cleanup();
        }
        
        secureLogger.info('RPCManager cleanup completed');
    }
}

module.exports = RPCManager;