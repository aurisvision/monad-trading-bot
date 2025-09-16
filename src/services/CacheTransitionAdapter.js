/**
 * Cache Transition Adapter
 * Provides backward compatibility while migrating to UnifiedCacheSystem
 * Ensures zero downtime and maintains performance during transition
 */

class CacheTransitionAdapter {
    constructor(legacyCache, unifiedCache, monitoring = null) {
        this.legacyCache = legacyCache;
        this.unifiedCache = unifiedCache;
        this.monitoring = monitoring;
        
        // Migration settings
        this.migrationConfig = {
            enabled: true,
            fallbackToLegacy: true,
            compareResults: false,  // Set to true for testing phase
            logDifferences: false   // Set to true for debugging
        };
        
        // Performance tracking
        this.transitionMetrics = {
            unifiedCacheUsage: 0,
            legacyCacheUsage: 0,
            fallbacksToLegacy: 0,
            errors: 0
        };
    }

    // ==================== CORE CACHE OPERATIONS ====================
    
    /**
     * Get data with intelligent routing
     */
    async get(type, identifier, fallbackFn = null) {
        try {
            // Try unified cache first
            if (this.migrationConfig.enabled) {
                const result = await this.unifiedCache.get(type, identifier, fallbackFn);
                this.transitionMetrics.unifiedCacheUsage++;
                return result;
            }
            
            // Fallback to legacy cache
            const result = await this.legacyCache.get(type, identifier, fallbackFn);
            this.transitionMetrics.legacyCacheUsage++;
            return result;
            
        } catch (error) {
            this.transitionMetrics.errors++;
            
            if (this.migrationConfig.fallbackToLegacy) {
                this.monitoring?.logWarning('Unified cache failed, falling back to legacy', {
                    type, identifier, error: error.message
                });
                
                try {
                    const result = await this.legacyCache.get(type, identifier, fallbackFn);
                    this.transitionMetrics.fallbacksToLegacy++;
                    return result;
                } catch (legacyError) {
                    this.monitoring?.logError('Both cache systems failed', legacyError, {
                        type, identifier, unifiedError: error.message
                    });
                    throw legacyError;
                }
            }
            
            throw error;
        }
    }
    
    /**
     * Set data with dual writing during transition
     */
    async set(type, identifier, data, customTTL = null) {
        const errors = [];
        
        try {
            // Write to unified cache
            if (this.migrationConfig.enabled) {
                await this.unifiedCache.set(type, identifier, data, customTTL);
            }
        } catch (error) {
            errors.push({ system: 'unified', error });
            this.transitionMetrics.errors++;
        }
        
        try {
            // Write to legacy cache
            await this.legacyCache.set(type, identifier, data, customTTL);
        } catch (error) {
            errors.push({ system: 'legacy', error });
            this.transitionMetrics.errors++;
        }
        
        // If both failed, throw error
        if (errors.length === 2) {
            this.monitoring?.logError('Both cache systems failed during set', null, {
                type, identifier, errors
            });
            throw new Error('Cache set failed in both systems');
        }
        
        // If only one failed, log warning but continue
        if (errors.length === 1) {
            this.monitoring?.logWarning('One cache system failed during set', {
                type, identifier, failedSystem: errors[0].system, error: errors[0].error.message
            });
        }
    }
    
    /**
     * Delete data from both systems
     */
    async delete(type, identifier) {
        const results = [];
        
        try {
            if (this.migrationConfig.enabled) {
                const unifiedResult = await this.unifiedCache.delete(type, identifier);
                results.push(unifiedResult);
            }
        } catch (error) {
            this.monitoring?.logError('Unified cache delete failed', error, { type, identifier });
        }
        
        try {
            const legacyResult = await this.legacyCache.delete(type, identifier);
            results.push(legacyResult);
        } catch (error) {
            this.monitoring?.logError('Legacy cache delete failed', error, { type, identifier });
        }
        
        // Return true if at least one deletion succeeded
        return results.some(result => result === true);
    }
    
    /**
     * Check existence in preferred system
     */
    async exists(type, identifier) {
        try {
            if (this.migrationConfig.enabled) {
                return await this.unifiedCache.exists(type, identifier);
            }
            return await this.legacyCache.exists(type, identifier);
        } catch (error) {
            this.monitoring?.logError('Cache exists check failed', error, { type, identifier });
            return false;
        }
    }

    // ==================== SPECIALIZED OPERATIONS ====================
    
    /**
     * Clear user state from both systems
     */
    async clearUserState(userId) {
        const promises = [];
        
        if (this.migrationConfig.enabled && this.unifiedCache.clearUserState) {
            promises.push(this.unifiedCache.clearUserState(userId));
        }
        
        if (this.legacyCache.clearUserState) {
            promises.push(this.legacyCache.clearUserState(userId));
        }
        
        try {
            await Promise.allSettled(promises);
        } catch (error) {
            this.monitoring?.logError('Failed to clear user state', error, { userId });
        }
    }
    
    /**
     * Invalidate user settings in both systems
     */
    async invalidateUserSettings(userId) {
        const promises = [];
        
        if (this.migrationConfig.enabled && this.unifiedCache.invalidateUserSettings) {
            promises.push(this.unifiedCache.invalidateUserSettings(userId));
        }
        
        if (this.legacyCache.invalidateUserSettings) {
            promises.push(this.legacyCache.invalidateUserSettings(userId));
        }
        
        try {
            await Promise.allSettled(promises);
        } catch (error) {
            this.monitoring?.logError('Failed to invalidate user settings', error, { userId });
        }
    }
    
    /**
     * Invalidate after trading operations
     */
    async invalidateAfterTrade(userId, walletAddress, operation = 'trade') {
        const promises = [];
        
        if (this.migrationConfig.enabled && this.unifiedCache.invalidateAfterTrade) {
            promises.push(this.unifiedCache.invalidateAfterTrade(userId, walletAddress, operation));
        }
        
        if (this.legacyCache.invalidateAfterBuy || this.legacyCache.invalidateAfterTransfer) {
            // Legacy system has separate methods
            if (operation === 'buy' && this.legacyCache.invalidateAfterBuy) {
                promises.push(this.legacyCache.invalidateAfterBuy(userId, walletAddress));
            } else if (operation === 'transfer' && this.legacyCache.invalidateAfterTransfer) {
                promises.push(this.legacyCache.invalidateAfterTransfer(userId, null, walletAddress, null));
            }
        }
        
        try {
            await Promise.allSettled(promises);
        } catch (error) {
            this.monitoring?.logError('Failed to invalidate after trade', error, { 
                userId, walletAddress, operation 
            });
        }
    }

    // ==================== MIGRATION CONTROL ====================
    
    /**
     * Enable unified cache system
     */
    enableUnifiedCache() {
        this.migrationConfig.enabled = true;
        this.monitoring?.logInfo('Unified cache system enabled');
    }
    
    /**
     * Disable unified cache system (fallback to legacy)
     */
    disableUnifiedCache() {
        this.migrationConfig.enabled = false;
        this.monitoring?.logInfo('Unified cache system disabled, using legacy only');
    }
    
    /**
     * Enable comparison mode for testing
     */
    enableComparisonMode() {
        this.migrationConfig.compareResults = true;
        this.migrationConfig.logDifferences = true;
        this.monitoring?.logInfo('Cache comparison mode enabled');
    }
    
    /**
     * Get transition metrics
     */
    getTransitionMetrics() {
        const total = this.transitionMetrics.unifiedCacheUsage + this.transitionMetrics.legacyCacheUsage;
        
        return {
            ...this.transitionMetrics,
            totalOperations: total,
            unifiedCachePercentage: total > 0 ? (this.transitionMetrics.unifiedCacheUsage / total * 100).toFixed(1) : 0,
            errorRate: total > 0 ? (this.transitionMetrics.errors / total * 100).toFixed(2) : 0,
            fallbackRate: this.transitionMetrics.unifiedCacheUsage > 0 ? 
                (this.transitionMetrics.fallbacksToLegacy / this.transitionMetrics.unifiedCacheUsage * 100).toFixed(2) : 0
        };
    }
    
    /**
     * Reset transition metrics
     */
    resetMetrics() {
        this.transitionMetrics = {
            unifiedCacheUsage: 0,
            legacyCacheUsage: 0,
            fallbacksToLegacy: 0,
            errors: 0
        };
    }

    // ==================== PERFORMANCE MONITORING ====================
    
    /**
     * Get performance comparison
     */
    async getPerformanceComparison() {
        const unifiedMetrics = this.unifiedCache.getOverallMetrics ? 
            this.unifiedCache.getOverallMetrics() : null;
            
        const legacyMetrics = this.legacyCache.metrics || null;
        
        return {
            unified: unifiedMetrics,
            legacy: legacyMetrics,
            transition: this.getTransitionMetrics()
        };
    }
    
    /**
     * Warm cache in both systems
     */
    async warmCache() {
        const promises = [];
        
        if (this.migrationConfig.enabled && this.unifiedCache.warmActiveUsersCache) {
            promises.push(this.unifiedCache.warmActiveUsersCache());
        }
        
        if (this.legacyCache.warmActiveUsersCache) {
            promises.push(this.legacyCache.warmActiveUsersCache());
        }
        
        try {
            await Promise.allSettled(promises);
            this.monitoring?.logInfo('Cache warming completed for both systems');
        } catch (error) {
            this.monitoring?.logError('Cache warming failed', error);
        }
    }

    // ==================== COMPATIBILITY METHODS ====================
    
    /**
     * Provide backward compatibility for getKey method
     */
    getKey(type, identifier) {
        if (this.migrationConfig.enabled && this.unifiedCache.getKey) {
            return this.unifiedCache.getKey(type, identifier);
        }
        return this.legacyCache.getKey(type, identifier);
    }
    
    /**
     * Get metrics from active system
     */
    get metrics() {
        if (this.migrationConfig.enabled && this.unifiedCache.metrics) {
            return this.unifiedCache.metrics;
        }
        return this.legacyCache.metrics;
    }
    
    /**
     * Initialize method for compatibility
     */
    async initialize() {
        // Both systems should already be initialized
        this.monitoring?.logInfo('Cache transition adapter initialized');
    }

    // ==================== CLEANUP ====================
    
    /**
     * Destroy both cache systems
     */
    destroy() {
        if (this.unifiedCache && this.unifiedCache.destroy) {
            this.unifiedCache.destroy();
        }
        
        if (this.legacyCache && this.legacyCache.destroy) {
            this.legacyCache.destroy();
        }
        
        this.monitoring?.logInfo('Cache transition adapter destroyed');
    }
}

module.exports = CacheTransitionAdapter;

