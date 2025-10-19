// Constants and Configuration for Area51 Bot
// This file contains all shared constants, configuration values, and settings

module.exports = {
    // Bot Configuration
    BOT_CONFIG: {
        NAME: 'Area51 Trading Bot',
        VERSION: '1.0.0',
        DESCRIPTION: 'Telegram Trading Bot for Monad Testnet',
        AUTHOR: 'Area51 Team'
    },

    // Network Configuration
    NETWORK: {
        CHAIN_ID: 41454, // Monad Testnet
        NAME: 'Monad Testnet',
        RPC_URL: 'https://lb.drpc.live/monad-testnet/AoOgZcz1jUo2kLGq0kMoG3ovAOf-o9gR8IGdwg8TMB_n',
        EXPLORER_URL: 'https://testnet.monadexplorer.com',
        CURRENCY: 'MON'
    },

    // API Endpoints
    API_ENDPOINTS: {
        MONORAIL_TESTNET_QUOTE: 'https://testnet-pathfinder.monorail.xyz/v4',
        MONORAIL_TESTNET_DATA: 'https://testnet-api.monorail.xyz/v1',
        APP_ID: '2837175649443187'
    },

    // Token Addresses
    TOKENS: {
        MON: '0x0000000000000000000000000000000000000000', // Native MON
        WMON: '0x8fe68e6b1d3b899c2b3ac621e4f4e1d8e8b7f8a9', // Wrapped MON
        USDC: '0xf817257fed379853cde0fa4f97ab987181b1e5ea',
        USDT: '0x5d9ab5522c64e1f6ef5e3627eccc093f56167818'
    },

    // Trading Configuration
    TRADING: {
        DEFAULT_SLIPPAGE: 1, // 1%
        MAX_SLIPPAGE: 50, // 50%
        MIN_SLIPPAGE: 0.1, // 0.1%
        TURBO_SLIPPAGE: 20, // 20% for turbo mode
        DEFAULT_BUY_AMOUNTS: [0.1, 0.5, 1, 5], // MON amounts
        DEFAULT_SELL_PERCENTAGES: [25, 50, 75, 100], // Percentage amounts
        MIN_TRADE_AMOUNT: 0.001, // Minimum MON amount
        MAX_TRADE_AMOUNT: 1000 // Maximum MON amount
    },

    // Gas Configuration
    GAS: {
        NORMAL_MODE: {
            GAS_PRICE: '110000000000', // 110 gwei
            MAX_FEE_PER_GAS: '120000000000', // 120 gwei
            MAX_PRIORITY_FEE_PER_GAS: '10000000000', // 10 gwei
            GAS_LIMIT: 300000
        },
        TURBO_MODE: {
            GAS_PRICE: '210000000000', // 210 gwei
            MAX_FEE_PER_GAS: '220000000000', // 220 gwei
            MAX_PRIORITY_FEE_PER_GAS: '20000000000', // 20 gwei
            GAS_LIMIT: 600000
        }
    },

    // Cache Configuration
    CACHE: {
        TTL: {
            USER_DATA: 86400, // 24 hours
            BALANCE: 60, // 1 minute
            PORTFOLIO: 120, // 2 minutes
            TOKEN_PRICE: 300, // 5 minutes
            MAIN_MENU: 60 // 1 minute
        },
        KEYS: {
            USER: 'user',
            BALANCE: 'balance',
            PORTFOLIO: 'portfolio',
            TOKEN_PRICE: 'token_price',
            MAIN_MENU: 'main_menu',
            MON_PRICE: 'mon_price_usd'
        }
    },

    // Database Configuration
    DATABASE: {
        MAX_CONNECTIONS: 20,
        CONNECTION_TIMEOUT: 30000, // 30 seconds
        IDLE_TIMEOUT: 10000, // 10 seconds
        QUERY_TIMEOUT: 5000 // 5 seconds
    },

    // Rate Limiting
    RATE_LIMITS: {
        REQUESTS_PER_MINUTE: 60,
        REQUESTS_PER_HOUR: 1000,
        MAX_FAILED_ATTEMPTS: 5,
        LOCKOUT_DURATION: 900000 // 15 minutes
    },

    // Security Configuration
    SECURITY: {
        MAX_INPUT_LENGTH: 1000,
        MAX_ADDRESS_LENGTH: 42,
        MAX_AMOUNT_LENGTH: 50,
        MAX_MNEMONIC_LENGTH: 500,
        ENCRYPTION_ALGORITHM: 'aes-256-gcm',
        SUSPICIOUS_PATTERNS: [
            /script/i,
            /javascript/i,
            /eval/i,
            /exec/i,
            /<script/i,
            /on\w+=/i,
            /data:/i,
            /vbscript/i
        ]
    },

    // Portfolio Configuration
    PORTFOLIO: {
        TOKENS_PER_PAGE: 3,
        MIN_VALUE_THRESHOLD: 0.001, // Minimum MON value to show token
        MAX_TOKENS_DISPLAY: 50
    },

    // Message Templates
    MESSAGES: {
        ERRORS: {
            GENERIC: '❌ An error occurred. Please try again or contact support.',
            INSUFFICIENT_FUNDS: '❌ Insufficient balance for this transaction.',
            SLIPPAGE_TOO_HIGH: '❌ Price moved too much. Try increasing slippage tolerance.',
            NETWORK_ERROR: '❌ Network error. Please try again in a moment.',
            TIMEOUT: '❌ Request timed out. Please try again.',
            RATE_LIMIT: '❌ Too many requests. Please wait a moment.',
            INVALID_ADDRESS: '❌ Invalid wallet address format.',
            INVALID_AMOUNT: '❌ Invalid amount. Please enter a valid number.',
            TOKEN_NOT_FOUND: '❌ Token not found. Please try again.',
            USER_NOT_FOUND: '❌ Please start the bot first with /start'
        },
        SUCCESS: {
            TRANSACTION_COMPLETE: '✅ Transaction completed successfully!',
            WALLET_CREATED: '✅ Wallet created successfully!',
            SETTINGS_UPDATED: '✅ Settings updated successfully!',
            CACHE_CLEARED: '✅ Data refreshed successfully!'
        },
        WARNINGS: {
            TURBO_MODE: '⚠️ *WARNING:* Turbo Mode prioritizes speed over safety',
            HIGH_SLIPPAGE: '⚠️ High slippage tolerance may result in significant price impact',
            LARGE_TRANSACTION: '⚠️ Large transaction amount detected'
        }
    },

    // Emoji Sets
    EMOJIS: {
        TRADING: {
            BUY: '💰',
            SELL: '💸',
            PORTFOLIO: '📊',
            WALLET: '👛',
            SETTINGS: '⚙️',
            REFRESH: '🔄',
            BACK: '🔙',
            CONFIRM: '✅',
            CANCEL: '❌'
        },
        STATUS: {
            SUCCESS: '✅',
            ERROR: '❌',
            WARNING: '⚠️',
            INFO: 'ℹ️',
            LOADING: '🔄',
            TURBO: '🚀'
        },
        TOKENS: {
            MON: '🪙',
            USDC: '💵',
            USDT: '💰',
            GENERIC: '🔘'
        }
    },

    // Button Labels
    BUTTONS: {
        MAIN_MENU: {
            BUY: '💰 Buy',
            SELL: '💸 Sell', 
            PORTFOLIO: '📊 Portfolio',
            WALLET: '👛 Wallet',
            TRANSFER: '💸 Transfer',
            CATEGORIES: '📂 Categories',
            SETTINGS: '⚙️ Settings',
            HELP: '❓ Help',
            REFRESH: '🔄 Refresh'
        },
        SETTINGS: {
            SLIPPAGE: '📊 Slippage Settings',
            GAS: '⚡ Gas Settings',
            TURBO: '🚀 Toggle Turbo Mode',
            NOTIFICATIONS: '🔔 Notifications',
            BACK: '🔙 Back to Main'
        },
        TRADING: {
            CONFIRM: '✅ Confirm',
            CANCEL: '❌ Cancel',
            CUSTOM: '📝 Custom Amount',
            BACK: '🔙 Back'
        }
    },

    // Validation Rules
    VALIDATION: {
        WALLET_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
        PRIVATE_KEY: /^[a-fA-F0-9]{64}$/,
        AMOUNT: /^\d+(\.\d+)?$/,
        PERCENTAGE: /^(100|[1-9]?\d)$/
    },

    // Health Check Configuration
    HEALTH_CHECK: {
        PORT: 3001,
        INTERVAL: 30000, // 30 seconds
        TIMEOUT: 5000 // 5 seconds
    },

    // Monitoring Configuration
    MONITORING: {
        LOG_LEVEL: 'info',
        MAX_LOG_SIZE: '10m',
        MAX_LOG_FILES: 5,
        METRICS_PORT: 9090
    }
};
