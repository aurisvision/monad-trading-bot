/**
 * Unified Cache Configuration for Area51 Trading Bot
 * Centralized cache settings with environment-specific overrides
 */

class CacheConfig {
    constructor(environment = 'production') {
        this.environment = environment;
        this.keyPrefix = 'area51:';
        
        // Base cache configuration
        this.cacheTypes = {
            // Permanent cache (no TTL)
            PERMANENT: {
                user_data: { 
                    prefix: 'area51:user:', 
                    ttl: null,
                    description: 'User basic data - permanent until manual update'
                },
                user: { 
                    prefix: 'area51:user:', 
                    ttl: null,
                    description: 'User data - permanent until manual update'
                },
                user_settings: { 
                    prefix: 'area51:settings:', 
                    ttl: null,
                    description: 'User trading settings - permanent until changed'
                },
                session: { 
                    prefix: 'area51:session:', 
                    ttl: 3600,  // 1 hour
                    description: 'User session data'
                },
                user_state: { 
                    prefix: 'area51:state:', 
                    ttl: 1800,  // 30 minutes
                    description: 'User interaction state'
                }
            },
            
            // Medium-term cache (5-15 minutes)
            MEDIUM_TERM: {
                portfolio: { 
                    prefix: 'area51:portfolio:', 
                    ttl: 900,  // 15 minutes
                    description: 'User portfolio data'
                },
                mon_balance: { 
                    prefix: 'area51:balance:', 
                    ttl: 300,  // 5 minutes
                    description: 'MON balance for wallet addresses'
                },
                wallet_balance: { 
                    prefix: 'area51:wallet_balance:', 
                    ttl: 300,  // 5 minutes
                    description: 'Complete wallet balance data from API'
                },
                portfolio_value: { 
                    prefix: 'area51:portfolio_value:', 
                    ttl: 300,  // 5 minutes
                    description: 'Total portfolio value in MON/USD'
                },
                main_menu: { 
                    prefix: 'area51:main_menu:', 
                    ttl: 300,  // 5 minutes (same as underlying data)
                    description: 'Main menu interface data with balance and portfolio'
                },
            },
            
            // Short-term cache (1-5 minutes)
            SHORT_TERM: {
                token_info: { 
                    prefix: 'area51:token_info:', 
                    ttl: 300,  // 5 minutes
                    description: 'Token information and metadata'
                },
                gas_prices: { 
                    prefix: 'area51:gas:', 
                    ttl: 60,   // 1 minute
                    description: 'Current gas prices'
                },
                wallet_instance: { 
                    prefix: 'area51:wallet_instance:', 
                    ttl: 3600, // 1 hour (security marker only)
                    description: 'Wallet instance markers for security'
                },
                mon_price_usd: { 
                    prefix: 'area51:mon_price:', 
                    ttl: 3600,  // 1 hour (unified with background refresh)
                    description: 'MON token price in USD'
                }
            }
        };
        
        // Environment-specific overrides
        this.environmentOverrides = {
            development: {
                // Shorter TTL for development
                portfolio: { ttl: 60 },      // 1 minute
                mon_balance: { ttl: 30 },    // 30 seconds
                wallet_balance: { ttl: 30 }, // 30 seconds
                main_menu: { ttl: 30 }       // 30 seconds
            },
            testing: {
                // Very short TTL for testing
                portfolio: { ttl: 10 },      // 10 seconds
                mon_balance: { ttl: 5 },     // 5 seconds
                wallet_balance: { ttl: 5 },  // 5 seconds
                main_menu: { ttl: 5 }        // 5 seconds
            }
        };
        
        // Apply environment overrides
        this.applyEnvironmentOverrides();
        
        // Cache invalidation rules
        this.invalidationRules = {
            buy_operation: ['mon_balance', 'wallet_balance', 'portfolio', 'portfolio_value', 'main_menu'],
            sell_operation: ['mon_balance', 'wallet_balance', 'portfolio', 'portfolio_value', 'main_menu'],
            auto_buy: ['mon_balance', 'wallet_balance', 'portfolio', 'portfolio_value', 'main_menu'],
            transfer: ['mon_balance', 'wallet_balance', 'main_menu'],
            settings_change: ['user_settings', 'main_menu'],
            wallet_import: ['user_data', 'user_settings', 'wallet_balance', 'main_menu']
        };
    }
    
    /**
     * Apply environment-specific overrides
     */
    applyEnvironmentOverrides() {
        const overrides = this.environmentOverrides[this.environment];
        if (!overrides) return;
        
        // Apply overrides to all cache type categories
        Object.values(this.cacheTypes).forEach(category => {
            Object.keys(category).forEach(key => {
                if (overrides[key]) {
                    Object.assign(category[key], overrides[key]);
                }
            });
        });
    }
    
    /**
     * Get cache configuration for a specific type
     */
    getCacheConfig(type) {
        // Search through all categories
        for (const category of Object.values(this.cacheTypes)) {
            if (category[type]) {
                return category[type];
            }
        }
        return null;
    }
    
    /**
     * Get all cache types for a category
     */
    getCacheCategory(category) {
        return this.cacheTypes[category] || {};
    }
    
    /**
     * Get invalidation rules for an operation
     */
    getInvalidationRules(operation) {
        return this.invalidationRules[operation] || [];
    }
    
    /**
     * Generate cache key
     */
    generateKey(type, identifier) {
        const config = this.getCacheConfig(type);
        if (!config) {
            throw new Error(`Unknown cache type: ${type}`);
        }
        return `${config.prefix}${identifier}`;
    }
    
    /**
     * Get all cache configurations as flat object
     */
    getAllConfigs() {
        const allConfigs = {};
        Object.values(this.cacheTypes).forEach(category => {
            Object.assign(allConfigs, category);
        });
        return allConfigs;
    }
    
    /**
     * Validate cache configuration
     */
    validate() {
        const errors = [];
        const allConfigs = this.getAllConfigs();
        
        Object.entries(allConfigs).forEach(([type, config]) => {
            if (!config.prefix) {
                errors.push(`Missing prefix for cache type: ${type}`);
            }
            if (!config.prefix.startsWith(this.keyPrefix)) {
                errors.push(`Invalid prefix for cache type: ${type} - must start with ${this.keyPrefix}`);
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = CacheConfig;
