/**
 * Gas and Slippage Priority System
 * Implements the priority logic for determining which gas/slippage settings to use
 * based on the last action (turbo mode vs custom settings)
 */
class GasSlippagePriority {
    constructor(database, cacheService = null) {
        this.database = database;
        this.cacheService = cacheService;
    }
    /**
     * Get effective gas price for buy/sell transactions
     * Priority: Last updated setting wins (turbo vs custom)
     */
    async getEffectiveGasPrice(userId, type = 'buy') {
        try {
            const settings = await this.database.getUserSettings(userId);
            if (!settings) {
                // Default: 50 Gwei
                return 50000000000;
            }
            // Compare timestamps to determine priority
            const turboUpdated = new Date(settings.turbo_mode_updated_at || settings.created_at);
            const gasUpdated = new Date(settings.gas_settings_updated_at || settings.created_at);
            // If turbo was updated more recently and is enabled
            if (settings.turbo_mode && turboUpdated >= gasUpdated) {
                return 100000000000; // 100 Gwei for turbo
            }
            // Otherwise use custom/default gas settings
            if (type === 'sell') {
                return settings.sell_gas_price || 50000000000;
            } else {
                return settings.gas_price || 50000000000;
            }
        } catch (error) {
            return 50000000000; // Default fallback
        }
    }
    /**
     * Get effective slippage for buy/sell transactions
     * Priority: Last updated setting wins (turbo vs custom)
     */
    async getEffectiveSlippage(userId, type = 'buy') {
        try {
            const settings = await this.database.getUserSettings(userId);
            if (!settings) {
                // Default: 5%
                return 5.0;
            }
            // Compare timestamps to determine priority
            const turboUpdated = new Date(settings.turbo_mode_updated_at || settings.created_at);
            const slippageUpdated = new Date(settings.slippage_settings_updated_at || settings.created_at);
            // Turbo mode doesn't change slippage, only gas
            // So always use the custom slippage settings
            if (type === 'sell') {
                return settings.sell_slippage_tolerance || 5.0;
            } else {
                return settings.slippage_tolerance || 5.0;
            }
        } catch (error) {
            return 5.0; // Default fallback
        }
    }
    /**
     * Get auto buy settings (completely separate from regular buy/sell)
     */
    async getAutoBuySettings(userId) {
        try {
            const settings = await this.database.getUserSettings(userId);
            if (!settings) {
                return {
                    gas: 50000000000,    // 50 Gwei
                    slippage: 5.0,       // 5%
                    amount: 0.1          // 0.1 MON
                };
            }
            return {
                gas: settings.auto_buy_gas || 50000000000,
                slippage: settings.auto_buy_slippage || 5.0,
                amount: settings.auto_buy_amount || 0.1
            };
        } catch (error) {
            return {
                gas: 50000000000,
                slippage: 5.0,
                amount: 0.1
            };
        }
    }
    /**
     * Update turbo mode and timestamp
     */
    async updateTurboMode(userId, enabled) {
        try {
            await this.database.updateUserSettings(userId, {
                turbo_mode: enabled,
                turbo_mode_updated_at: new Date()
            });
        } catch (error) {
            throw error;
        }
    }
    /**
     * Update gas settings and timestamp
     */
    async updateGasSettings(userId, gasPrice, type = 'buy') {
        try {
            const update = {
                gas_settings_updated_at: new Date()
            };
            if (type === 'sell') {
                update.sell_gas_price = gasPrice;
            } else if (type === 'auto_buy') {
                update.auto_buy_gas = gasPrice;
            } else {
                update.gas_price = gasPrice;
            }
            await this.database.updateUserSettings(userId, update);
            // Force immediate cache invalidation using proper operation
            if (this.cacheService) {
                // Use settings_change operation to clear all related cache
                await this.cacheService.invalidateAfterOperation('settings_change', userId, null);
            }
        } catch (error) {
            throw error;
        }
    }
    /**
     * Update slippage settings and timestamp
     */
    async updateSlippageSettings(userId, slippage, type = 'buy') {
        try {
            const update = {
                slippage_settings_updated_at: new Date()
            };
            if (type === 'sell') {
                update.sell_slippage_tolerance = slippage;
            } else if (type === 'auto_buy') {
                update.auto_buy_slippage = slippage;
            } else {
                update.slippage_tolerance = slippage;
            }
            await this.database.updateUserSettings(userId, update);
            // Force immediate cache invalidation using proper operation
            if (this.cacheService) {
                // Use settings_change operation to clear all related cache
                await this.cacheService.invalidateAfterOperation('settings_change', userId, null);
            }
        } catch (error) {
            throw error;
        }
    }
    /**
     * Update auto buy amount
     */
    async updateAutoBuyAmount(userId, amount) {
        try {
            const update = {
                auto_buy_amount: amount
            };
            await this.database.updateUserSettings(userId, update);
            // Force immediate cache invalidation using proper operation
            if (this.cacheService) {
                // Use settings_change operation to clear all related cache
                await this.cacheService.invalidateAfterOperation('settings_change', userId, null);
            }
        } catch (error) {
            throw error;
        }
    }
    /**
     * Get current priority status for debugging
     */
    async getPriorityStatus(userId) {
        try {
            const settings = await this.database.getUserSettings(userId);
            if (!settings) {
                return {
                    turboMode: false,
                    effectiveGas: 50,
                    effectiveSlippage: 5,
                    lastAction: 'default'
                };
            }
            const turboUpdated = new Date(settings.turbo_mode_updated_at || settings.created_at);
            const gasUpdated = new Date(settings.gas_settings_updated_at || settings.created_at);
            const slippageUpdated = new Date(settings.slippage_settings_updated_at || settings.created_at);
            const effectiveGas = await this.getEffectiveGasPrice(userId, 'buy');
            const effectiveSlippage = await this.getEffectiveSlippage(userId, 'buy');
            let lastAction = 'default';
            if (settings.turbo_mode && turboUpdated >= gasUpdated) {
                lastAction = 'turbo';
            } else if (gasUpdated > turboUpdated) {
                lastAction = 'custom_gas';
            }
            return {
                turboMode: settings.turbo_mode,
                effectiveGas: Math.round(effectiveGas / 1000000000), // Convert to Gwei
                effectiveSlippage: effectiveSlippage,
                lastAction: lastAction,
                timestamps: {
                    turbo: turboUpdated,
                    gas: gasUpdated,
                    slippage: slippageUpdated
                }
            };
        } catch (error) {
            return {
                turboMode: false,
                effectiveGas: 50,
                effectiveSlippage: 5,
                lastAction: 'error'
            };
        }
    }
}
module.exports = GasSlippagePriority;