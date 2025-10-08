/**
 * Message Configuration
 * Centralized configuration for professional trading messages
 */

class MessageConfig {
    constructor() {
        this.config = {
            // Real-time updates configuration
            realTime: {
                enabled: process.env.ENABLE_REALTIME_UPDATES !== 'false',
                wsUrl: process.env.MONAD_WS_URL || 'wss://testnet-rpc.monad.xyz',
                reconnectInterval: 5000,
                maxReconnectAttempts: 10,
                priceUpdateThrottle: 10000, // 10 seconds
                messageCleanupInterval: 600000 // 10 minutes
            },

            // Explorer URLs
            explorer: {
                testnet: 'https://testnet.monadexplorer.com',
                mainnet: 'https://monadexplorer.com',
                current: process.env.NODE_ENV === 'production' ? 
                    'https://monadexplorer.com' : 
                    'https://testnet.monadexplorer.com'
            },

            // Message formatting options
            formatting: {
                useEmojis: true,
                showTimestamps: true,
                showGasInfo: true,
                showPriceImpact: true,
                showSlippage: true,
                truncateAddresses: true,
                addressLength: 8,
                hashLength: 12,
                decimalPlaces: 6,
                currencySymbol: 'MON'
            },

            // Message templates
            templates: {
                buy: {
                    processing: '🔄 **Processing Buy Order**',
                    success: '✅ **Buy Order Completed**',
                    error: '❌ **Buy Order Failed**'
                },
                sell: {
                    processing: '🔄 **Processing Sell Order**',
                    success: '✅ **Sell Order Completed**',
                    error: '❌ **Sell Order Failed**'
                },
                quote: {
                    header: '💱 **Trading Quote**',
                    realTimeIndicator: '🔴 **LIVE**',
                    staticIndicator: '📊 **QUOTE**'
                }
            },

            // Emoji sets
            emojis: {
                status: {
                    processing: '🔄',
                    success: '✅',
                    error: '❌',
                    warning: '⚠️',
                    info: 'ℹ️'
                },
                trading: {
                    buy: '🟢',
                    sell: '🔴',
                    quote: '💱',
                    portfolio: '💼',
                    balance: '💰',
                    price: '💲',
                    gas: '⛽',
                    time: '⏰',
                    link: '🔗',
                    explorer: '🔍'
                },
                indicators: {
                    up: '📈',
                    down: '📉',
                    stable: '➡️',
                    high: '🔥',
                    low: '❄️',
                    live: '🔴',
                    offline: '⚫'
                }
            },

            // Button configurations
            buttons: {
                maxPerRow: 3,
                styles: {
                    primary: '🟢',
                    secondary: '🔵',
                    danger: '🔴',
                    warning: '🟡',
                    info: '⚪'
                }
            },

            // Performance settings
            performance: {
                enableCaching: true,
                cacheTimeout: 300000, // 5 minutes
                batchUpdates: true,
                maxConcurrentUpdates: 5,
                updateThrottle: 1000 // 1 second
            },

            // Error handling
            errorHandling: {
                retryAttempts: 3,
                retryDelay: 1000,
                fallbackToSimple: true,
                logErrors: true
            }
        };
    }

    /**
     * Get configuration value
     */
    get(path) {
        return this.getNestedValue(this.config, path);
    }

    /**
     * Set configuration value
     */
    set(path, value) {
        this.setNestedValue(this.config, path, value);
    }

    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Set nested value in object using dot notation
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    /**
     * Get explorer URL for transaction
     */
    getExplorerUrl(txHash, type = 'tx') {
        const baseUrl = this.get('explorer.current');
        return `${baseUrl}/${type}/${txHash}`;
    }

    /**
     * Get emoji for status
     */
    getStatusEmoji(status) {
        return this.get(`emojis.status.${status}`) || '•';
    }

    /**
     * Get emoji for trading operation
     */
    getTradingEmoji(operation) {
        return this.get(`emojis.trading.${operation}`) || '•';
    }

    /**
     * Get indicator emoji
     */
    getIndicatorEmoji(indicator) {
        return this.get(`emojis.indicators.${indicator}`) || '•';
    }

    /**
     * Check if real-time updates are enabled
     */
    isRealTimeEnabled() {
        return this.get('realTime.enabled');
    }

    /**
     * Get WebSocket URL
     */
    getWebSocketUrl() {
        return this.get('realTime.wsUrl');
    }

    /**
     * Get formatting options
     */
    getFormattingOptions() {
        return this.get('formatting');
    }

    /**
     * Get template for message type
     */
    getTemplate(type, subtype) {
        return this.get(`templates.${type}.${subtype}`);
    }

    /**
     * Update configuration from environment variables
     */
    updateFromEnv() {
        // Update real-time settings
        if (process.env.ENABLE_REALTIME_UPDATES !== undefined) {
            this.set('realTime.enabled', process.env.ENABLE_REALTIME_UPDATES !== 'false');
        }

        if (process.env.MONAD_WS_URL) {
            this.set('realTime.wsUrl', process.env.MONAD_WS_URL);
        }

        // Update explorer URL based on environment
        if (process.env.NODE_ENV === 'production') {
            this.set('explorer.current', this.get('explorer.mainnet'));
        }

        // Update currency symbol if specified
        if (process.env.CURRENCY_SYMBOL) {
            this.set('formatting.currencySymbol', process.env.CURRENCY_SYMBOL);
        }
    }

    /**
     * Validate configuration
     */
    validate() {
        const required = [
            'realTime.wsUrl',
            'explorer.current',
            'formatting.currencySymbol'
        ];

        const missing = required.filter(path => !this.get(path));
        
        if (missing.length > 0) {
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }

        return true;
    }

    /**
     * Get full configuration object
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Reset to default configuration
     */
    reset() {
        this.config = new MessageConfig().config;
    }
}

module.exports = MessageConfig;