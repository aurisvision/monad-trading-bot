/**
 * WebSocket Event Types and Constants
 * Defines all WebSocket event types, subscription types, and related constants
 * for the Area51 Bot real-time communication system
 */

/**
 * WebSocket Connection Events
 */
const CONNECTION_EVENTS = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    RECONNECTED: 'reconnected',
    ERROR: 'error',
    TIMEOUT: 'timeout',
    HEARTBEAT: 'heartbeat',
    HEARTBEAT_RESPONSE: 'heartbeat_response'
};

/**
 * WebSocket Subscription Types
 */
const SUBSCRIPTION_TYPES = {
    PRICE_FEED: 'price',
    TRANSACTION_MONITOR: 'transaction',
    PORTFOLIO_UPDATES: 'portfolio',
    SYSTEM_STATUS: 'system_status',
    TRADING_SIGNALS: 'trading_signals',
    MARKET_DATA: 'market_data'
};

/**
 * Price Feed Event Types
 */
const PRICE_EVENTS = {
    PRICE_UPDATE: 'price_update',
    PRICE_ALERT: 'price_alert',
    MARKET_OPEN: 'market_open',
    MARKET_CLOSE: 'market_close',
    VOLUME_SPIKE: 'volume_spike',
    PRICE_CHANGE_THRESHOLD: 'price_change_threshold'
};

/**
 * Transaction Event Types
 */
const TRANSACTION_EVENTS = {
    PENDING_TRANSACTION: 'pending_transaction',
    CONFIRMED_TRANSACTION: 'confirmed_transaction',
    FAILED_TRANSACTION: 'failed_transaction',
    TRANSACTION_RECEIPT: 'transaction_receipt',
    GAS_PRICE_UPDATE: 'gas_price_update',
    BALANCE_CHANGE: 'balance_change'
};

/**
 * Portfolio Event Types
 */
const PORTFOLIO_EVENTS = {
    PORTFOLIO_UPDATE: 'portfolio_update',
    NEW_POSITION: 'new_position',
    POSITION_CLOSED: 'position_closed',
    PROFIT_LOSS_UPDATE: 'profit_loss_update',
    ASSET_ALLOCATION_CHANGE: 'asset_allocation_change',
    PORTFOLIO_VALUE_CHANGE: 'portfolio_value_change'
};

/**
 * System Status Event Types
 */
const SYSTEM_EVENTS = {
    BOT_STATUS_UPDATE: 'bot_status_update',
    RPC_STATUS_CHANGE: 'rpc_status_change',
    WEBSOCKET_STATUS_CHANGE: 'websocket_status_change',
    ERROR_ALERT: 'error_alert',
    PERFORMANCE_METRICS: 'performance_metrics',
    HEALTH_CHECK: 'health_check'
};

/**
 * Trading Signal Event Types
 */
const TRADING_EVENTS = {
    BUY_SIGNAL: 'buy_signal',
    SELL_SIGNAL: 'sell_signal',
    AUTO_BUY_EXECUTED: 'auto_buy_executed',
    AUTO_SELL_EXECUTED: 'auto_sell_executed',
    TRADING_OPPORTUNITY: 'trading_opportunity',
    RISK_ALERT: 'risk_alert'
};

/**
 * WebSocket Message Types
 */
const MESSAGE_TYPES = {
    SUBSCRIBE: 'subscribe',
    UNSUBSCRIBE: 'unsubscribe',
    DATA: 'data',
    ERROR: 'error',
    HEARTBEAT: 'heartbeat',
    ACK: 'ack',
    NACK: 'nack'
};

/**
 * WebSocket Connection States
 */
const CONNECTION_STATES = {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTING: 'disconnecting',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    FAILED: 'failed'
};

/**
 * Error Types
 */
const ERROR_TYPES = {
    CONNECTION_ERROR: 'connection_error',
    SUBSCRIPTION_ERROR: 'subscription_error',
    AUTHENTICATION_ERROR: 'authentication_error',
    RATE_LIMIT_ERROR: 'rate_limit_error',
    TIMEOUT_ERROR: 'timeout_error',
    PROTOCOL_ERROR: 'protocol_error',
    UNKNOWN_ERROR: 'unknown_error'
};

/**
 * Priority Levels for Events
 */
const PRIORITY_LEVELS = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
};

/**
 * Default Configuration Values
 */
const DEFAULT_CONFIG = {
    RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 5000,
    HEARTBEAT_INTERVAL: 30000,
    CONNECTION_TIMEOUT: 10000,
    MAX_SUBSCRIPTIONS: 50,
    MESSAGE_QUEUE_SIZE: 1000,
    RETRY_BACKOFF_MULTIPLIER: 1.5,
    MAX_RETRY_DELAY: 60000
};

/**
 * WebSocket URL Patterns
 */
const URL_PATTERNS = {
    PRICE_FEED: '/ws/price-feed',
    TRANSACTION_MONITOR: '/ws/transaction-monitor',
    PORTFOLIO_UPDATES: '/ws/portfolio-updates',
    SYSTEM_STATUS: '/ws/system-status',
    TRADING_SIGNALS: '/ws/trading-signals'
};

/**
 * Data Validation Schemas
 */
const VALIDATION_SCHEMAS = {
    PRICE_DATA: {
        required: ['symbol', 'price', 'timestamp'],
        optional: ['volume', 'change', 'changePercent']
    },
    TRANSACTION_DATA: {
        required: ['hash', 'from', 'to', 'value', 'status'],
        optional: ['gasUsed', 'gasPrice', 'blockNumber', 'timestamp']
    },
    PORTFOLIO_DATA: {
        required: ['userId', 'totalValue', 'timestamp'],
        optional: ['positions', 'profitLoss', 'allocation']
    }
};

/**
 * Rate Limiting Configuration
 */
const RATE_LIMITS = {
    SUBSCRIPTION_REQUESTS_PER_MINUTE: 60,
    MESSAGE_RATE_PER_SECOND: 100,
    HEARTBEAT_RATE_PER_MINUTE: 2,
    ERROR_REPORT_RATE_PER_MINUTE: 10
};

/**
 * Utility function to create standardized WebSocket message
 * @param {string} type - Message type
 * @param {string} subscriptionType - Subscription type
 * @param {Object} data - Message data
 * @param {string} priority - Message priority
 * @returns {Object} - Standardized message object
 */
function createWebSocketMessage(type, subscriptionType, data, priority = PRIORITY_LEVELS.MEDIUM) {
    return {
        id: generateMessageId(),
        type,
        subscriptionType,
        data,
        priority,
        timestamp: new Date().toISOString(),
        version: '1.0'
    };
}

/**
 * Generate unique message ID
 * @returns {string} - Unique message identifier
 */
function generateMessageId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate message structure
 * @param {Object} message - Message to validate
 * @param {string} expectedType - Expected message type
 * @returns {boolean} - Validation result
 */
function validateMessage(message, expectedType) {
    if (!message || typeof message !== 'object') {
        return false;
    }

    const requiredFields = ['id', 'type', 'timestamp'];
    return requiredFields.every(field => message.hasOwnProperty(field)) &&
           (!expectedType || message.type === expectedType);
}

/**
 * Get event category by event type
 * @param {string} eventType - Event type to categorize
 * @returns {string} - Event category
 */
function getEventCategory(eventType) {
    if (Object.values(PRICE_EVENTS).includes(eventType)) return 'price';
    if (Object.values(TRANSACTION_EVENTS).includes(eventType)) return 'transaction';
    if (Object.values(PORTFOLIO_EVENTS).includes(eventType)) return 'portfolio';
    if (Object.values(SYSTEM_EVENTS).includes(eventType)) return 'system';
    if (Object.values(TRADING_EVENTS).includes(eventType)) return 'trading';
    return 'unknown';
}

module.exports = {
    CONNECTION_EVENTS,
    SUBSCRIPTION_TYPES,
    PRICE_EVENTS,
    TRANSACTION_EVENTS,
    PORTFOLIO_EVENTS,
    SYSTEM_EVENTS,
    TRADING_EVENTS,
    MESSAGE_TYPES,
    CONNECTION_STATES,
    ERROR_TYPES,
    PRIORITY_LEVELS,
    DEFAULT_CONFIG,
    URL_PATTERNS,
    VALIDATION_SCHEMAS,
    RATE_LIMITS,
    createWebSocketMessage,
    generateMessageId,
    validateMessage,
    getEventCategory
};