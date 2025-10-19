/**
 * /**
 * Trading Configuration - Unified Trading System Settings
 * Contains all settings and constants for different types of trading
 */

class TradingConfig {
    constructor() {
        // Settings for different trading types
        this.tradeTypes = {
            normal: {
                name: 'Normal Trading',
                validations: ['balance', 'token', 'quote'],
                slippage: { 
                    default: 1, 
                    min: 0.1, 
                    max: 50 
                },
                gas: { 
                    default: 110000000000, // 110 Gwei
                    min: 20000000000,      // 20 Gwei
                    max: 250000000000      // 250 Gwei
                },
                timeouts: {
                    validation: 5000,     // 5 seconds
                    execution: 30000      // 30 seconds
                }
            },
            turbo: {
                name: 'Turbo Trading',
                validations: [], // No validations for maximum speed
                slippage: { 
                    fixed: 20 // 20% fixed for speed
                },
                gas: { 
                    fixed: 210000000000 // 210 Gwei fixed
                },
                timeouts: {
                    execution: 10000 // 10 seconds max
                }
            }
        };

        // Cache settings
        this.cacheConfig = {
            // Permanent data (no TTL)
            permanent: {
                user_data: {
                    prefix: 'area51:user:',
                    ttl: null
                },
                user_settings: {
                    prefix: 'area51:user_settings:',
                    ttl: null
                },
                wallet_instance: {
                    prefix: 'area51:wallet_instance:',
                    ttl: null
                }
            },
            // Temporary data (with TTL)
            temporary: {
                mon_balance: {
                    prefix: 'area51:wallet_balance:',
                    ttl: 30 // 30 seconds
                },
                token_info: {
                    prefix: 'area51:token_info:',
                    ttl: 300 // 5 minutes
                },
                portfolio: {
                    prefix: 'area51:portfolio:',
                    ttl: 60 // 1 minute
                },
                gas_prices: {
                    prefix: 'area51:gas:',
                    ttl: 60 // 1 minute
                },
                quotes: {
                    prefix: 'area51:quote:',
                    ttl: 10 // 10 seconds only
                }
            }
        };

        // Unified error messages
        this.errorMessages = {
            USER_NOT_FOUND: 'User not found. Please start with /start',
            INSUFFICIENT_BALANCE: 'Insufficient balance to complete transaction',
            INVALID_TOKEN: 'Invalid token address',
            INVALID_AMOUNT: 'Invalid amount',
            WALLET_ERROR: 'Wallet access error',
            NETWORK_ERROR: 'Network error. Please try again',
            SLIPPAGE_TOO_HIGH: 'Slippage too high',
            AUTO_BUY_DISABLED: 'Auto buy is disabled',
            TURBO_MODE_ERROR: 'Turbo mode error',
            TRANSACTION_FAILED: 'Transaction execution failed'
        };

        // Security settings
        this.security = {
            maxTransactionAmount: 1000, // 1000 MON maximum
            gasBuffer: 0.05, // 0.05 MON buffer for gas
            minBalance: 0.01, // 0.01 MON minimum balance
            maxSlippage: 50, // 50% maximum slippage
            retryAttempts: 3, // Number of retry attempts
            timeoutBuffer: 5000 // 5 seconds buffer for timeout
        };
    }

    /**
     * Get trading type configuration
     */
    getTradeConfig(type) {
        return this.tradeTypes[type] || this.tradeTypes.normal;
    }

    /**
     * Get cache configuration for data type
     */
    getCacheConfig(dataType) {
        return this.cacheConfig.permanent[dataType] || 
               this.cacheConfig.temporary[dataType] || 
               { prefix: 'area51:default:', ttl: 300 };
    }

    /**
     * Get error message
     */
    getErrorMessage(errorType) {
        return this.errorMessages[errorType] || 'An unexpected error occurred';
    }

    /**
     * Validate trading type
     */
    isValidTradeType(type) {
        return Object.keys(this.tradeTypes).includes(type);
    }

    /**
     * Get security configuration
     */
    getSecurityConfig() {
        return this.security;
    }

    /**
     * Determine if trading type requires security validations
     */
    requiresValidation(type, validationType) {
        const config = this.getTradeConfig(type);
        return config.validations.includes(validationType);
    }

    /**
     * Get slippage value for trading type with user settings
     */
    getSlippageValue(type, userSettings = null) {
        const config = this.getTradeConfig(type);
        
        // For turbo: use fixed 20%
        if (config.slippage.fixed !== undefined) {
            return config.slippage.fixed;
        }
        
        // For normal: use user settings
        if (userSettings) {
            // Use slippage_tolerance from user settings
            return userSettings.slippage_tolerance || config.slippage.default;
        }
        
        return config.slippage.default || 1;
    }

    /**
     * Get gas value for trading type with user settings
     */
    getGasValue(type, userSettings = null) {
        const config = this.getTradeConfig(type);
        
        // For turbo: use fixed 100 Gwei
        if (config.gas.fixed !== undefined) {
            return config.gas.fixed;
        }
        
        // For normal: use user settings with priority logic
        if (userSettings) {
            // Check if turbo is enabled and recently updated
            const turboUpdated = new Date(userSettings.turbo_mode_updated_at || userSettings.created_at);
            const gasUpdated = new Date(userSettings.gas_settings_updated_at || userSettings.created_at);
            
            // If turbo is enabled and updated more recently than gas settings
            if (userSettings.turbo_mode && turboUpdated >= gasUpdated) {
                return 210000000000; // 210 Gwei for turbo
            }
            
            // Otherwise use custom gas settings
            return userSettings.gas_price || config.gas.default;
        }
        
        return config.gas.default || 50000000000;
    }

    /**
     * Get timeout for trading type
     */
    getTimeout(type, operation = 'execution') {
        const config = this.getTradeConfig(type);
        return config.timeouts[operation] || 30000;
    }
}

module.exports = TradingConfig;
