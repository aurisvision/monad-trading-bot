/**
 * Instant Transaction Cache System
 * Pre-loads and caches all user settings for lightning-fast transaction execution
 * Critical: Cache MUST be updated instantly when user changes any setting
 */

class InstantTransactionCache {
    constructor(cacheService, database, monitoring) {
        this.cacheService = cacheService;
        this.database = database;
        this.monitoring = monitoring;
        
        // Critical settings that affect transaction speed
        this.criticalSettings = [
            'gas_price',
            'slippage_tolerance', 
            'sell_gas_price',
            'sell_slippage_tolerance',
            'auto_buy_enabled',
            'auto_buy_amount',
            'auto_buy_gas',
            'auto_buy_slippage',
            'custom_buy_amounts',
            'custom_sell_percentages',
            'turbo_mode'
        ];
    }

    /**
     * Pre-warm user settings cache for instant access
     * Called during bot startup and periodically
     */
    async preWarmUserSettings(userId) {
        try {
            const userSettings = await this.database.getUserSettings(userId);
            if (!userSettings) return false;

            // Store in persistent cache (no TTL)
            const cacheKey = `instant_settings:${userId}`;
            await this.cacheService.redis.set(cacheKey, JSON.stringify(userSettings));
            
            this.monitoring?.logInfo('User settings pre-warmed for instant access', { userId });
            return true;
        } catch (error) {
            this.monitoring?.logError('Failed to pre-warm user settings', error, { userId });
            return false;
        }
    }

    /**
     * Get user settings instantly from cache
     * CRITICAL: This must be sub-10ms for transaction speed
     */
    async getInstantSettings(userId) {
        try {
            const cacheKey = `instant_settings:${userId}`;
            const cached = await this.cacheService.redis.get(cacheKey);
            
            if (cached) {
                this.monitoring?.logInfo('Instant settings cache hit', { userId, responseTime: '~1ms' });
                return JSON.parse(cached);
            }

            // Cache miss - load from database and cache immediately
            const settings = await this.database.getUserSettings(userId);
            if (settings) {
                await this.cacheService.redis.set(cacheKey, JSON.stringify(settings));
                this.monitoring?.logInfo('Settings loaded and cached for future instant access', { userId });
            }
            
            return settings;
        } catch (error) {
            this.monitoring?.logError('Failed to get instant settings', error, { userId });
            // Fallback to database
            return await this.database.getUserSettings(userId);
        }
    }

    /**
     * CRITICAL: Instantly update cache when user changes ANY setting
     * This prevents stale data that could cause wrong transaction parameters
     */
    async updateInstantCache(userId, updatedSettings) {
        try {
            const cacheKey = `instant_settings:${userId}`;
            
            // Get current cached settings
            let currentSettings = {};
            const cached = await this.cacheService.redis.get(cacheKey);
            if (cached) {
                currentSettings = JSON.parse(cached);
            }

            // Merge with updated settings
            const newSettings = { ...currentSettings, ...updatedSettings };
            
            // Update cache immediately
            await this.cacheService.redis.set(cacheKey, JSON.stringify(newSettings));
            
            // Also invalidate related caches
            await Promise.all([
                this.cacheService.invalidateUserSettings(userId),
                this.cacheService.invalidateMainMenu(userId)
            ]);

            this.monitoring?.logInfo('CRITICAL: Instant cache updated after settings change', { 
                userId, 
                updatedFields: Object.keys(updatedSettings),
                timestamp: new Date().toISOString()
            });

            return true;
        } catch (error) {
            this.monitoring?.logError('CRITICAL: Failed to update instant cache', error, { 
                userId, 
                updatedSettings 
            });
            return false;
        }
    }

    /**
     * Get transaction-ready settings bundle
     * Returns all settings needed for immediate transaction execution
     */
    async getTransactionBundle(userId) {
        try {
            const settings = await this.getInstantSettings(userId);
            if (!settings) return null;

            return {
                // Buy settings
                buyGas: settings.gas_price || 50000000000,
                buySlippage: settings.slippage_tolerance || 5.0,
                customBuyAmounts: settings.custom_buy_amounts || '0.1,0.5,1,5',
                
                // Sell settings  
                sellGas: settings.sell_gas_price || 50000000000,
                sellSlippage: settings.sell_slippage_tolerance || 5.0,
                customSellPercentages: settings.custom_sell_percentages || '25,50,75,100',
                
                // Auto buy settings
                autoBuyEnabled: settings.auto_buy_enabled || false,
                autoBuyAmount: settings.auto_buy_amount || 0.1,
                autoBuyGas: settings.auto_buy_gas || 50000000000,
                autoBuySlippage: settings.auto_buy_slippage || 5.0,
                
                // Speed settings
                turboMode: settings.turbo_mode || false,
                
                // Metadata
                userId,
                cachedAt: new Date().toISOString()
            };
        } catch (error) {
            this.monitoring?.logError('Failed to get transaction bundle', error, { userId });
            return null;
        }
    }

    /**
     * Validate cache integrity - ensures no stale data
     */
    async validateCacheIntegrity(userId) {
        try {
            const cachedSettings = await this.getInstantSettings(userId);
            const dbSettings = await this.database.getUserSettings(userId);
            
            if (!cachedSettings || !dbSettings) return false;

            // Check critical settings for mismatches
            for (const setting of this.criticalSettings) {
                if (cachedSettings[setting] !== dbSettings[setting]) {
                    this.monitoring?.logError('CRITICAL: Cache integrity violation detected', null, {
                        userId,
                        setting,
                        cached: cachedSettings[setting],
                        database: dbSettings[setting]
                    });
                    
                    // Force cache refresh
                    await this.updateInstantCache(userId, dbSettings);
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.monitoring?.logError('Cache integrity validation failed', error, { userId });
            return false;
        }
    }

    /**
     * Emergency cache refresh - use when integrity is compromised
     */
    async emergencyRefresh(userId) {
        try {
            const settings = await this.database.getUserSettings(userId);
            if (settings) {
                await this.updateInstantCache(userId, settings);
                this.monitoring?.logInfo('Emergency cache refresh completed', { userId });
                return true;
            }
            return false;
        } catch (error) {
            this.monitoring?.logError('Emergency cache refresh failed', error, { userId });
            return false;
        }
    }
}

module.exports = InstantTransactionCache;
