/**
 * Background Refresh Service
 * Keeps cache fresh for active users and handles global price updates
 */
class BackgroundRefreshService {
    constructor(cacheService, database, monorailAPI, monitoring = null) {
        this.cache = cacheService;
        this.database = database;
        this.monorailAPI = monorailAPI;
        this.monitoring = monitoring;
        
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
        
        // Statistics
        this.stats = {
            activeUserRefreshes: 0,
            priceRefreshes: 0,
            portfolioRefreshes: 0,
            errors: 0,
            lastRefresh: null
        };
    }

    /**
     * Start background refresh service
     */
    start() {
        if (this.isRunning) {
            if (this.monitoring) {
                this.monitoring.logWarning('Background refresh service already running');
            }
            return;
        }
        
        this.isRunning = true;
        
        // Start global price refresh
        this.refreshTimers.priceRefresh = setInterval(() => {
            this._refreshGlobalPrices();
        }, this.intervals.globalPriceRefresh);
        
        // Start active user refresh
        this.refreshTimers.activeUserRefresh = setInterval(() => {
            this._refreshActiveUsers();
        }, this.intervals.activeUserRefresh);
        
        // Start portfolio refresh for active users
        this.refreshTimers.portfolioRefresh = setInterval(() => {
            this._refreshActiveUserPortfolios();
        }, this.intervals.portfolioRefresh);
        
        // Start inactive user cleanup
        this.refreshTimers.inactiveUserCleanup = setInterval(() => {
            this._cleanupInactiveUsers();
        }, this.intervals.inactiveUserCleanup);
        
        if (this.monitoring) {
            this.monitoring.logInfo('Background refresh service started');
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
        
        if (this.monitoring) {
            this.monitoring.logInfo('Background refresh service stopped');
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
        try {
            if (this.monitoring) {
                this.monitoring.logInfo('Refreshing global prices');
            }
            
            // Refresh MON price
            const monPrice = await this.monorailAPI.getMONPriceUSD();
            if (monPrice && monPrice.success) {
                await this.cache.set('mon_price_usd', 'global', monPrice);
            } else if (monPrice && monPrice.price) {
                // Handle different response formats
                await this.cache.set('mon_price_usd', 'global', {
                    success: true,
                    price: monPrice.price,
                    timestamp: Date.now()
                });
            }
            
            this.stats.priceRefreshes++;
            this.stats.lastRefresh = Date.now();
            
        } catch (error) {
            this.stats.errors++;
            
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
}

module.exports = BackgroundRefreshService;
