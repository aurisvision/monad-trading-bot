/**
 * Transaction Speed Optimizer
 * Integrates with InstantTransactionCache to provide lightning-fast transaction execution
 * Eliminates database queries during transaction flow for maximum speed
 */

const InstantTransactionCache = require('./instantTransactionCache');

class TransactionSpeedOptimizer {
    constructor(cacheService, database, monitoring) {
        this.cacheService = cacheService;
        this.database = database;
        this.monitoring = monitoring;
        
        // Initialize instant transaction cache
        this.instantCache = new InstantTransactionCache(cacheService, database, monitoring);
        
        // Performance tracking
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            avgResponseTime: 0,
            transactionCount: 0
        };
    }

    /**
     * Initialize optimizer - pre-warm caches for active users
     */
    async initialize() {
        try {
            // Get active users from database
            const activeUsers = await this.database.query(
                'SELECT telegram_id FROM users WHERE last_activity > NOW() - INTERVAL \'24 hours\' LIMIT 100'
            );

            // Pre-warm settings cache for all active users
            const warmPromises = activeUsers.rows.map(user => 
                this.instantCache.preWarmUserSettings(user.telegram_id)
            );
            
            await Promise.all(warmPromises);
            
            this.monitoring?.logInfo('Transaction Speed Optimizer initialized', {
                preWarmedUsers: activeUsers.rows.length
            });
            
            return true;
        } catch (error) {
            this.monitoring?.logError('Failed to initialize Transaction Speed Optimizer', error);
            return false;
        }
    }

    /**
     * Get optimized transaction parameters instantly
     * Target: <10ms response time
     */
    async getOptimizedTransactionParams(userId, transactionType = 'buy') {
        const startTime = Date.now();
        
        try {
            // Get transaction bundle from instant cache
            const bundle = await this.instantCache.getTransactionBundle(userId);
            
            if (!bundle) {
                this.metrics.cacheMisses++;
                this.monitoring?.logWarning('Transaction bundle cache miss', { userId, transactionType });
                return null;
            }

            this.metrics.cacheHits++;
            
            // Build optimized parameters based on transaction type
            let params = {};
            
            switch (transactionType) {
                case 'buy':
                    params = {
                        gasPrice: bundle.buyGas,
                        slippage: bundle.buySlippage,
                        customAmounts: bundle.customBuyAmounts.split(',').map(a => parseFloat(a.trim())),
                        turboMode: bundle.turboMode
                    };
                    break;
                    
                case 'sell':
                    params = {
                        gasPrice: bundle.sellGas,
                        slippage: bundle.sellSlippage,
                        customPercentages: bundle.customSellPercentages.split(',').map(p => parseInt(p.trim())),
                        turboMode: bundle.turboMode
                    };
                    break;
                    
                case 'auto_buy':
                    if (!bundle.autoBuyEnabled) {
                        return null; // Auto buy disabled
                    }
                    params = {
                        gasPrice: bundle.autoBuyGas,
                        slippage: bundle.autoBuySlippage,
                        amount: bundle.autoBuyAmount,
                        enabled: bundle.autoBuyEnabled,
                        turboMode: bundle.turboMode
                    };
                    break;
                    
                default:
                    this.monitoring?.logError('Unknown transaction type', null, { userId, transactionType });
                    return null;
            }

            const responseTime = Date.now() - startTime;
            this.updateMetrics(responseTime);
            
            this.monitoring?.logInfo('Optimized transaction params retrieved', {
                userId,
                transactionType,
                responseTime: `${responseTime}ms`,
                fromCache: true
            });

            return {
                ...params,
                userId,
                transactionType,
                retrievedAt: new Date().toISOString(),
                responseTime
            };
            
        } catch (error) {
            this.metrics.cacheMisses++;
            this.monitoring?.logError('Failed to get optimized transaction params', error, { userId, transactionType });
            return null;
        }
    }

    /**
     * CRITICAL: Update cache immediately when user changes settings
     * This is called from all settings update handlers
     */
    async updateUserSettings(userId, settingType, newValue, additionalSettings = {}) {
        try {
            // Prepare update object
            const updateData = { ...additionalSettings };
            
            // Map setting type to database field
            switch (settingType) {
                case 'gas_buy':
                    updateData.gas_price = newValue;
                    break;
                case 'gas_sell':
                    updateData.sell_gas_price = newValue;
                    break;
                case 'gas_auto_buy':
                    updateData.auto_buy_gas = newValue;
                    break;
                case 'slippage_buy':
                    updateData.slippage_tolerance = newValue;
                    break;
                case 'slippage_sell':
                    updateData.sell_slippage_tolerance = newValue;
                    break;
                case 'slippage_auto_buy':
                    updateData.auto_buy_slippage = newValue;
                    break;
                case 'auto_buy_amount':
                    updateData.auto_buy_amount = newValue;
                    break;
                case 'auto_buy_toggle':
                    updateData.auto_buy_enabled = newValue;
                    break;
                case 'turbo_mode':
                    updateData.turbo_mode = newValue;
                    break;
                case 'custom_buy_amounts':
                    updateData.custom_buy_amounts = newValue;
                    break;
                case 'custom_sell_percentages':
                    updateData.custom_sell_percentages = newValue;
                    break;
                default:
                    updateData[settingType] = newValue;
            }

            // Update database first
            await this.database.updateUserSettings(userId, updateData);
            
            // CRITICAL: Update instant cache immediately
            const cacheUpdated = await this.instantCache.updateInstantCache(userId, updateData);
            
            if (!cacheUpdated) {
                this.monitoring?.logError('CRITICAL: Failed to update instant cache after settings change', null, {
                    userId,
                    settingType,
                    newValue
                });
                
                // Force emergency refresh
                await this.instantCache.emergencyRefresh(userId);
            }

            this.monitoring?.logInfo('User settings updated with instant cache refresh', {
                userId,
                settingType,
                newValue,
                cacheUpdated
            });

            return true;
            
        } catch (error) {
            this.monitoring?.logError('Failed to update user settings', error, {
                userId,
                settingType,
                newValue
            });
            return false;
        }
    }

    /**
     * Validate transaction readiness - ensures all required data is cached
     */
    async validateTransactionReadiness(userId, transactionType) {
        try {
            // Check cache integrity
            const integrityValid = await this.instantCache.validateCacheIntegrity(userId);
            
            if (!integrityValid) {
                this.monitoring?.logWarning('Cache integrity validation failed, refreshing', { userId });
                await this.instantCache.emergencyRefresh(userId);
            }

            // Get transaction params to verify availability
            const params = await this.getOptimizedTransactionParams(userId, transactionType);
            
            return {
                ready: params !== null,
                params,
                cacheIntegrity: integrityValid,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            this.monitoring?.logError('Transaction readiness validation failed', error, { userId, transactionType });
            return {
                ready: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Performance monitoring and metrics
     */
    updateMetrics(responseTime) {
        this.metrics.transactionCount++;
        this.metrics.avgResponseTime = (
            (this.metrics.avgResponseTime * (this.metrics.transactionCount - 1)) + responseTime
        ) / this.metrics.transactionCount;
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
        const hitRatio = totalRequests > 0 ? (this.metrics.cacheHits / totalRequests * 100) : 0;

        return {
            cacheHitRatio: `${hitRatio.toFixed(2)}%`,
            avgResponseTime: `${this.metrics.avgResponseTime.toFixed(2)}ms`,
            totalTransactions: this.metrics.transactionCount,
            cacheHits: this.metrics.cacheHits,
            cacheMisses: this.metrics.cacheMisses
        };
    }

    /**
     * Emergency cache refresh for all active users
     */
    async emergencyRefreshAll() {
        try {
            const activeUsers = await this.database.query(
                'SELECT telegram_id FROM users WHERE last_activity > NOW() - INTERVAL \'1 hour\' LIMIT 50'
            );

            const refreshPromises = activeUsers.rows.map(user => 
                this.instantCache.emergencyRefresh(user.telegram_id)
            );
            
            await Promise.all(refreshPromises);
            
            this.monitoring?.logInfo('Emergency cache refresh completed for all active users', {
                refreshedUsers: activeUsers.rows.length
            });
            
            return true;
        } catch (error) {
            this.monitoring?.logError('Emergency cache refresh failed', error);
            return false;
        }
    }
}

module.exports = TransactionSpeedOptimizer;
