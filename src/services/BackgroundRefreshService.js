const { SUBSCRIPTION_TYPES, PRICE_EVENTS, TRANSACTION_EVENTS, PORTFOLIO_EVENTS } = require('../constants/WebSocketEvents');
const logger = require('../utils/Logger');

/**
 * Background Refresh Service
 * Keeps cache fresh for active users and handles global price updates
 * Enhanced with WebSocket real-time updates
 */
class BackgroundRefreshService {
    constructor(cacheService, database, monorailAPI, rpcManager = null, monitoring = null) {
        this.cache = cacheService;
        this.database = database;
        this.monorailAPI = monorailAPI;
        this.rpcManager = rpcManager;
        this.monitoring = monitoring;
        
        logger.info('BackgroundRefreshService initializing', {
            hasCache: !!cacheService,
            hasDatabase: !!database,
            hasMonorailAPI: !!monorailAPI,
            hasRpcManager: !!rpcManager,
            hasMonitoring: !!monitoring,
            webSocketEnabled: rpcManager && rpcManager.webSocketEnabled
        }, { category: 'background_service' });
        
        // Active users tracking
        this.activeUsers = new Map(); // telegramId -> { lastActivity, walletAddress }
        this.activeUserThreshold = 30 * 60 * 1000; // 30 minutes
        
        // Refresh intervals
        this.intervals = {
            activeUserRefresh: 5 * 60 * 1000,    // 5 minutes
            globalPriceRefresh: 60 * 60 * 1000,  // 1 hour (unified with cache TTL)
            inactiveUserCleanup: 15 * 60 * 1000, // 15 minutes
            portfolioRefresh: 10 * 60 * 1000     // 10 minutes
        };
        
        // Service state
        this.isRunning = false;
        this.refreshTimers = {};
        
        // WebSocket integration
        this.webSocketEnabled = rpcManager && rpcManager.webSocketEnabled;
        this.webSocketSubscriptions = new Map(); // subscriptionId -> { type, callback }
        this.realTimeUpdatesEnabled = false;
        
        // Statistics
        this.stats = {
            activeUserRefreshes: 0,
            priceRefreshes: 0,
            portfolioRefreshes: 0,
            webSocketUpdates: 0,
            realTimeEvents: 0,
            errors: 0,
            lastRefresh: null,
            lastWebSocketUpdate: null
        };
    }

    /**
     * Start background refresh service
     */
    async start() {
        const startTimer = logger.startTimer('background_service_start');
        
        if (this.isRunning) {
            logger.warn('Background refresh service already running', {
                activeTimers: Object.keys(this.refreshTimers).length,
                webSocketEnabled: this.webSocketEnabled
            }, { category: 'background_service' });
            
            if (this.monitoring) {
                this.monitoring.logWarning('Background refresh service already running');
            }
            return;
        }
        
        logger.info('Starting background refresh service', {
            webSocketEnabled: this.webSocketEnabled,
            activeUsers: this.activeUsers.size,
            intervals: this.intervals
        }, { category: 'background_service' });
        
        this.isRunning = true;
        
        // Initialize WebSocket subscriptions if enabled
        if (this.webSocketEnabled) {
            try {
                await this._initializeWebSocketSubscriptions();
                logger.info('WebSocket subscriptions initialized', {
                    subscriptionCount: this.webSocketSubscriptions.size
                }, { category: 'background_service' });
            } catch (error) {
                logger.error('Failed to initialize WebSocket subscriptions', error, {
                    webSocketEnabled: this.webSocketEnabled
                }, { category: 'background_service' });
            }
        }
        
        // Adjust intervals based on WebSocket availability
        const adjustedIntervals = this._getAdjustedIntervals();
        
        // Start global price refresh
        this.refreshTimers.priceRefresh = setInterval(() => {
            this._refreshGlobalPrices();
        }, adjustedIntervals.globalPriceRefresh);
        
        // Start active user refresh
        this.refreshTimers.activeUserRefresh = setInterval(() => {
            this._refreshActiveUsers();
        }, adjustedIntervals.activeUserRefresh);
        
        // Start portfolio refresh for active users
        this.refreshTimers.portfolioRefresh = setInterval(() => {
            this._refreshActiveUserPortfolios();
        }, adjustedIntervals.portfolioRefresh);
        
        // Start inactive user cleanup
        this.refreshTimers.inactiveUserCleanup = setInterval(() => {
            this._cleanupInactiveUsers();
        }, this.intervals.inactiveUserCleanup);
        
        logger.endTimer(startTimer, {
            success: true,
            timersCreated: Object.keys(this.refreshTimers).length,
            adjustedIntervals,
            webSocketSubscriptions: this.webSocketSubscriptions.size
        });
        
        if (this.monitoring) {
            this.monitoring.logInfo('Background refresh service started', {
                webSocketEnabled: this.webSocketEnabled,
                realTimeUpdatesEnabled: this.realTimeUpdatesEnabled,
                adjustedIntervals
            });
        }
    }

    /**
     * Stop background refresh service
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.isRunning = false;
        
        // Clear all timers
        Object.values(this.refreshTimers).forEach(timer => {
            if (timer) clearInterval(timer);
        });
        
        this.refreshTimers = {};
        
        // Cleanup WebSocket subscriptions
        this._cleanupWebSocketSubscriptions();
        
        if (this.monitoring) {
            this.monitoring.logInfo('Background refresh service stopped', {
                webSocketSubscriptionsCleanedUp: this.webSocketSubscriptions.size
            });
        }
    }

    /**
     * Mark user as active
     */
    markUserActive(telegramId, walletAddress = null) {
        this.activeUsers.set(telegramId, {
            lastActivity: Date.now(),
            walletAddress: walletAddress
        });
        
        if (this.monitoring) {
            this.monitoring.logInfo('User marked as active', { telegramId, walletAddress });
        }
    }

    /**
     * Get active users count
     */
    getActiveUsersCount() {
        return this.activeUsers.size;
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            activeUsers: this.activeUsers.size,
            uptime: this.isRunning ? Date.now() - (this.stats.startTime || Date.now()) : 0
        };
    }

    /**
     * Force refresh for specific user
     */
    async forceRefreshUser(telegramId, walletAddress) {
        try {
            if (this.monitoring) {
                this.monitoring.logInfo('Force refreshing user data', { telegramId, walletAddress });
            }
            
            // Mark user as active
            this.markUserActive(telegramId, walletAddress);
            
            // Refresh user data
            await this._refreshUserData(telegramId, walletAddress);
            
            return true;
        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Force refresh user failed', error, { telegramId, walletAddress });
            }
            
            return false;
        }
    }

    /**
     * Refresh global prices (MON price, etc.)
     */
    async _refreshGlobalPrices() {
        const refreshTimer = logger.startTimer('global_price_refresh');
        
        try {
            logger.info('Starting global price refresh', {
                lastRefresh: this.stats.lastRefresh,
                totalRefreshes: this.stats.priceRefreshes,
                webSocketEnabled: this.webSocketEnabled
            }, { category: 'background_service' });
            
            if (this.monitoring) {
                this.monitoring.logInfo('Refreshing global prices');
            }
            
            // Refresh MON price
            const apiTimer = logger.startTimer('monorail_api_price_call');
            const monPrice = await this.monorailAPI.getMONPriceUSD();
            logger.endTimer(apiTimer, {
                success: !!monPrice,
                hasPrice: !!(monPrice && (monPrice.success || monPrice.price))
            });
            
            if (monPrice && monPrice.success) {
                await this.cache.set('mon_price_usd', 'global', monPrice);
                logger.info('MON price cached successfully', {
                    price: monPrice.price,
                    format: 'success_format',
                    timestamp: monPrice.timestamp || Date.now()
                }, { category: 'background_service' });
            } else if (monPrice && monPrice.price) {
                // Handle different response formats
                const formattedPrice = {
                    success: true,
                    price: monPrice.price,
                    timestamp: Date.now()
                };
                await this.cache.set('mon_price_usd', 'global', formattedPrice);
                logger.info('MON price cached successfully', {
                    price: monPrice.price,
                    format: 'price_only_format',
                    timestamp: formattedPrice.timestamp
                }, { category: 'background_service' });
            } else {
                logger.warn('Invalid MON price response', {
                    response: monPrice,
                    hasSuccess: !!(monPrice && monPrice.success),
                    hasPrice: !!(monPrice && monPrice.price)
                }, { category: 'background_service' });
            }
            
            this.stats.priceRefreshes++;
            this.stats.lastRefresh = Date.now();
            
            logger.endTimer(refreshTimer, {
                success: true,
                totalRefreshes: this.stats.priceRefreshes,
                priceUpdated: !!(monPrice && (monPrice.success || monPrice.price))
            });
            
        } catch (error) {
            this.stats.errors++;
            
            logger.error('Global price refresh failed', error, {
                totalErrors: this.stats.errors,
                lastSuccessfulRefresh: this.stats.lastRefresh,
                totalRefreshes: this.stats.priceRefreshes
            }, { category: 'background_service' });
            
            logger.endTimer(refreshTimer, {
                success: false,
                error: error.message
            });
            
            if (this.monitoring) {
                this.monitoring.logError('Global price refresh failed', error);
            }
        }
    }

    /**
     * Refresh active users data
     */
    async _refreshActiveUsers() {
        if (this.activeUsers.size === 0) {
            return;
        }
        
        try {
            if (this.monitoring) {
                this.monitoring.logInfo(`Refreshing ${this.activeUsers.size} active users`);
            }
            
            const refreshPromises = [];
            
            for (const [telegramId, userData] of this.activeUsers.entries()) {
                if (userData.walletAddress) {
                    refreshPromises.push(
                        this._refreshUserData(telegramId, userData.walletAddress)
                    );
                }
            }
            
            await Promise.allSettled(refreshPromises);
            
            this.stats.activeUserRefreshes++;
            
        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Active users refresh failed', error);
            }
        }
    }

    /**
     * Refresh portfolios for active users
     */
    async _refreshActiveUserPortfolios() {
        if (this.activeUsers.size === 0) {
            return;
        }
        
        try {
            const refreshPromises = [];
            
            for (const [telegramId, userData] of this.activeUsers.entries()) {
                if (userData.walletAddress) {
                    refreshPromises.push(
                        this._refreshUserPortfolio(telegramId, userData.walletAddress)
                    );
                }
            }
            
            await Promise.allSettled(refreshPromises);
            
            this.stats.portfolioRefreshes++;
            
        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Portfolio refresh failed', error);
            }
        }
    }

    /**
     * Refresh individual user data
     */
    async _refreshUserData(telegramId, walletAddress) {
        try {
            // Refresh wallet balance
            const balance = await this.monorailAPI.getMONBalance(walletAddress);
            if (balance !== null) {
                await this.cache.set('wallet_balance', walletAddress, balance);
            }
            
            // Refresh main menu (will be regenerated on next access)
            await this.cache.delete('main_menu', telegramId);
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('User data refresh failed', error, { telegramId, walletAddress });
            }
        }
    }

    /**
     * Refresh individual user portfolio
     */
    async _refreshUserPortfolio(telegramId, walletAddress) {
        try {
            // Get fresh portfolio data
            const portfolio = await this.monorailAPI.getPortfolio(walletAddress);
            if (portfolio) {
                await this.cache.set('portfolio', telegramId, portfolio);
            }
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Portfolio refresh failed', error, { telegramId, walletAddress });
            }
        }
    }

    /**
     * Clean up inactive users from tracking
     */
    _cleanupInactiveUsers() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [telegramId, userData] of this.activeUsers.entries()) {
            if (now - userData.lastActivity > this.activeUserThreshold) {
                this.activeUsers.delete(telegramId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0 && this.monitoring) {
            this.monitoring.logInfo(`Cleaned up ${cleanedCount} inactive users`);
        }
    }

    /**
     * Preload cache for new user
     */
    async preloadUserCache(telegramId, walletAddress) {
        try {
            if (this.monitoring) {
                this.monitoring.logInfo('Preloading cache for new user', { telegramId, walletAddress });
            }
            
            // Mark as active
            this.markUserActive(telegramId, walletAddress);
            
            // Preload essential data
            const preloadPromises = [
                // User data
                this.database.getUserByTelegramId(telegramId).then(user => {
                    if (user) this.cache.set('user', telegramId, user);
                }),
                
                // User settings
                this.database.getUserSettings(telegramId).then(settings => {
                    if (settings) this.cache.set('user_settings', telegramId, settings);
                }),
                
                // Wallet balance
                this.monorailAPI.getMONBalance(walletAddress).then(balance => {
                    if (balance !== null) this.cache.set('wallet_balance', walletAddress, balance);
                }),
                
                // Portfolio
                this.monorailAPI.getPortfolio(walletAddress).then(portfolio => {
                    if (portfolio) this.cache.set('portfolio', telegramId, portfolio);
                })
            ];
            
            await Promise.allSettled(preloadPromises);
            
            return true;
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Cache preload failed', error, { telegramId, walletAddress });
            }
            
            return false;
        }
    }

    /**
     * Warm up cache with frequently accessed data
     */
    async warmUpCache() {
        try {
            if (this.monitoring) {
                this.monitoring.logInfo('Warming up cache');
            }
            
            // Get recent active users from database
            const recentUsers = await this.database.getRecentActiveUsers(50); // Get last 50 active users
            
            if (recentUsers && recentUsers.length > 0) {
                const warmupPromises = recentUsers.map(user => 
                    this.preloadUserCache(user.telegram_id, user.wallet_address)
                );
                
                await Promise.allSettled(warmupPromises);
                
                if (this.monitoring) {
                    this.monitoring.logInfo(`Cache warmed up for ${recentUsers.length} users`);
                }
            }
            
            // Refresh global prices
            await this._refreshGlobalPrices();
            
            return true;
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Cache warmup failed', error);
            }
            
            return false;
        }
    }

    /**
     * Get refresh recommendations based on usage patterns
     */
    getRefreshRecommendations() {
        const recommendations = [];
        const stats = this.getStats();
        
        if (stats.activeUsers > 100) {
            recommendations.push({
                type: 'high_load',
                message: `High number of active users (${stats.activeUsers})`,
                suggestion: 'Consider reducing refresh intervals or implementing user-based prioritization'
            });
        }
        
        if (stats.errors > stats.activeUserRefreshes * 0.1) {
            recommendations.push({
                type: 'high_error_rate',
                message: `High error rate in background refresh (${stats.errors} errors)`,
                suggestion: 'Check API connectivity and implement better error handling'
            });
        }
        
        if (!this.isRunning) {
            recommendations.push({
                type: 'service_stopped',
                message: 'Background refresh service is not running',
                suggestion: 'Start the service to maintain cache freshness'
            });
        }
        
        return recommendations;
    }

    /**
     * Initialize WebSocket subscriptions for real-time updates
     */
    async _initializeWebSocketSubscriptions() {
        if (!this.rpcManager || !this.webSocketEnabled) {
            return;
        }

        try {
            // Subscribe to global price feeds
            const priceSubscriptionId = await this.rpcManager.subscribeToPriceFeeds(
                ['MON/USD'], // Monitor MON price
                this._handlePriceUpdate.bind(this)
            );
            
            this.webSocketSubscriptions.set(priceSubscriptionId, {
                type: SUBSCRIPTION_TYPES.PRICE_FEED,
                callback: this._handlePriceUpdate.bind(this)
            });

            this.realTimeUpdatesEnabled = true;

            if (this.monitoring) {
                this.monitoring.logInfo('WebSocket subscriptions initialized', {
                    priceSubscriptionId,
                    totalSubscriptions: this.webSocketSubscriptions.size
                });
            }

        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Failed to initialize WebSocket subscriptions', error);
            }
        }
    }

    /**
     * Subscribe to transaction monitoring for active users
     */
    async subscribeToUserTransactions(telegramId, walletAddress) {
        if (!this.rpcManager || !this.webSocketEnabled) {
            return null;
        }

        try {
            const subscriptionId = await this.rpcManager.subscribeToTransactionMonitoring(
                walletAddress,
                (data) => this._handleTransactionUpdate(telegramId, walletAddress, data)
            );

            this.webSocketSubscriptions.set(subscriptionId, {
                type: SUBSCRIPTION_TYPES.TRANSACTION_MONITOR,
                telegramId,
                walletAddress,
                callback: (data) => this._handleTransactionUpdate(telegramId, walletAddress, data)
            });

            if (this.monitoring) {
                this.monitoring.logInfo('Subscribed to user transactions', {
                    telegramId,
                    walletAddress,
                    subscriptionId
                });
            }

            return subscriptionId;

        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Failed to subscribe to user transactions', error, {
                    telegramId,
                    walletAddress
                });
            }

            return null;
        }
    }

    /**
     * Subscribe to portfolio updates for active users
     */
    async subscribeToUserPortfolio(telegramId) {
        if (!this.rpcManager || !this.webSocketEnabled) {
            return null;
        }

        try {
            const subscriptionId = await this.rpcManager.subscribeToPortfolioUpdates(
                telegramId,
                (data) => this._handlePortfolioUpdate(telegramId, data)
            );

            this.webSocketSubscriptions.set(subscriptionId, {
                type: SUBSCRIPTION_TYPES.PORTFOLIO_UPDATES,
                telegramId,
                callback: (data) => this._handlePortfolioUpdate(telegramId, data)
            });

            if (this.monitoring) {
                this.monitoring.logInfo('Subscribed to user portfolio updates', {
                    telegramId,
                    subscriptionId
                });
            }

            return subscriptionId;

        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Failed to subscribe to user portfolio', error, {
                    telegramId
                });
            }

            return null;
        }
    }

    /**
     * Handle real-time price updates
     */
    async _handlePriceUpdate(data) {
        try {
            this.stats.webSocketUpdates++;
            this.stats.realTimeEvents++;
            this.stats.lastWebSocketUpdate = Date.now();

            if (data.symbol === 'MON/USD' && data.price) {
                // Update cached MON price
                await this.cache.set('mon_price_usd', 'global', {
                    success: true,
                    price: data.price,
                    timestamp: Date.now(),
                    source: 'websocket'
                });

                // Invalidate main menus for active users to trigger refresh
                for (const [telegramId] of this.activeUsers.entries()) {
                    await this.cache.delete('main_menu', telegramId);
                }

                if (this.monitoring) {
                    this.monitoring.logInfo('Real-time price update processed', {
                        symbol: data.symbol,
                        price: data.price,
                        activeUsersNotified: this.activeUsers.size
                    });
                }
            }

        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Failed to handle price update', error, { data });
            }
        }
    }

    /**
     * Handle real-time transaction updates
     */
    async _handleTransactionUpdate(telegramId, walletAddress, data) {
        try {
            this.stats.webSocketUpdates++;
            this.stats.realTimeEvents++;
            this.stats.lastWebSocketUpdate = Date.now();

            // Update wallet balance cache
            if (data.type === TRANSACTION_EVENTS.CONFIRMED_TRANSACTION) {
                // Refresh balance for this wallet
                const balance = await this.monorailAPI.getMONBalance(walletAddress);
                if (balance !== null) {
                    await this.cache.set('wallet_balance', walletAddress, balance);
                }

                // Invalidate main menu and portfolio cache
                await this.cache.delete('main_menu', telegramId);
                await this.cache.delete('portfolio', telegramId);

                if (this.monitoring) {
                    this.monitoring.logInfo('Real-time transaction update processed', {
                        telegramId,
                        walletAddress,
                        transactionHash: data.hash,
                        type: data.type
                    });
                }
            }

        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Failed to handle transaction update', error, {
                    telegramId,
                    walletAddress,
                    data
                });
            }
        }
    }

    /**
     * Handle real-time portfolio updates
     */
    async _handlePortfolioUpdate(telegramId, data) {
        try {
            this.stats.webSocketUpdates++;
            this.stats.realTimeEvents++;
            this.stats.lastWebSocketUpdate = Date.now();

            // Update portfolio cache
            if (data.portfolio) {
                await this.cache.set('portfolio', telegramId, data.portfolio);
            }

            // Invalidate main menu to reflect portfolio changes
            await this.cache.delete('main_menu', telegramId);

            if (this.monitoring) {
                this.monitoring.logInfo('Real-time portfolio update processed', {
                    telegramId,
                    totalValue: data.portfolio?.totalValue
                });
            }

        } catch (error) {
            this.stats.errors++;
            
            if (this.monitoring) {
                this.monitoring.logError('Failed to handle portfolio update', error, {
                    telegramId,
                    data
                });
            }
        }
    }

    /**
     * Get adjusted refresh intervals based on WebSocket availability
     */
    _getAdjustedIntervals() {
        if (this.realTimeUpdatesEnabled) {
            // Reduce polling frequency when WebSocket is providing real-time updates
            return {
                globalPriceRefresh: this.intervals.globalPriceRefresh * 2, // 2 hours instead of 1
                activeUserRefresh: this.intervals.activeUserRefresh * 1.5, // 7.5 minutes instead of 5
                portfolioRefresh: this.intervals.portfolioRefresh * 2 // 20 minutes instead of 10
            };
        }
        
        return this.intervals;
    }

    /**
     * Cleanup WebSocket subscriptions
     */
    _cleanupWebSocketSubscriptions() {
        if (!this.rpcManager) {
            return;
        }

        for (const [subscriptionId] of this.webSocketSubscriptions.entries()) {
            try {
                this.rpcManager.unsubscribeFromWebSocket(subscriptionId);
            } catch (error) {
                if (this.monitoring) {
                    this.monitoring.logError('Failed to cleanup WebSocket subscription', error, {
                        subscriptionId
                    });
                }
            }
        }

        this.webSocketSubscriptions.clear();
        this.realTimeUpdatesEnabled = false;
    }

    /**
     * Get WebSocket status and metrics
     */
    getWebSocketStatus() {
        return {
            enabled: this.webSocketEnabled,
            realTimeUpdatesEnabled: this.realTimeUpdatesEnabled,
            activeSubscriptions: this.webSocketSubscriptions.size,
            subscriptions: Array.from(this.webSocketSubscriptions.entries()).map(([id, sub]) => ({
                id,
                type: sub.type,
                telegramId: sub.telegramId,
                walletAddress: sub.walletAddress
            })),
            metrics: {
                webSocketUpdates: this.stats.webSocketUpdates,
                realTimeEvents: this.stats.realTimeEvents,
                lastWebSocketUpdate: this.stats.lastWebSocketUpdate
            }
        };
    }
}

module.exports = BackgroundRefreshService;
