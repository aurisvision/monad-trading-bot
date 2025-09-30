/**
 * BaseHandler - Base class for all handlers
 * Eliminates code duplication and provides common functionality
 * 
 * SAFETY: This is a NEW file that doesn't modify existing functionality
 */

class BaseHandler {
    constructor(dependencies = {}) {
        // Core dependencies
        this.bot = dependencies.bot;
        this.database = dependencies.database;
        this.monitoring = dependencies.monitoring;
        this.redis = dependencies.redis;
        this.cacheService = dependencies.cacheService;
        
        // Optional dependencies
        this.walletManager = dependencies.walletManager;
        this.monorailAPI = dependencies.monorailAPI;
        this.accessCodeSystem = dependencies.accessCodeSystem;
        this.security = dependencies.security;
        
        // Initialize metrics
        this.metrics = {
            handlerCalls: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Common user operations - eliminates duplication
     */
    async getUser(telegramId) {
        try {
            this.metrics.handlerCalls++;
            return await this.database.getUserByTelegramId(telegramId);
        } catch (error) {
            this.logError('Failed to get user', { telegramId, error: error.message });
            throw error;
        }
    }

    async getUserSettings(telegramId) {
        try {
            this.metrics.handlerCalls++;
            return await this.database.getUserSettings(telegramId);
        } catch (error) {
            this.logError('Failed to get user settings', { telegramId, error: error.message });
            throw error;
        }
    }

    async setUserState(telegramId, state, data = null) {
        try {
            this.metrics.handlerCalls++;
            return await this.database.setUserState(telegramId, state, data);
        } catch (error) {
            this.logError('Failed to set user state', { telegramId, state, error: error.message });
            throw error;
        }
    }

    async getUserState(telegramId) {
        try {
            this.metrics.handlerCalls++;
            return await this.database.getUserState(telegramId);
        } catch (error) {
            this.logError('Failed to get user state', { telegramId, error: error.message });
            return null;
        }
    }

    async clearUserState(telegramId) {
        try {
            this.metrics.handlerCalls++;
            return await this.database.clearUserState(telegramId);
        } catch (error) {
            this.logError('Failed to clear user state', { telegramId, error: error.message });
        }
    }

    /**
     * Common validation operations
     */
    async validateUser(ctx) {
        const userId = ctx.from?.id;
        if (!userId) {
            throw new Error('Invalid user context');
        }

        const user = await this.getUser(userId);
        if (!user) {
            throw new Error('User not found');
        }

        return { userId, user };
    }

    async validateUserAccess(ctx) {
        const { userId, user } = await this.validateUser(ctx);
        
        // Check if user has access (if access system is available)
        if (this.accessCodeSystem) {
            const hasAccess = await this.database.getUserAccess(userId);
            if (!hasAccess) {
                throw new Error('User access denied');
            }
        }

        return { userId, user };
    }

    /**
     * Common error handling and logging
     */
    logError(message, context = {}) {
        this.metrics.errors++;
        if (this.monitoring?.logError) {
            this.monitoring.logError(message, context);
        } else {
            console.error(`[${this.constructor.name}] ${message}:`, context);
        }
    }

    logInfo(message, context = {}) {
        if (this.monitoring?.logInfo) {
            this.monitoring.logInfo(message, context);
        } else {
            console.log(`[${this.constructor.name}] ${message}:`, context);
        }
    }

    logWarn(message, context = {}) {
        if (this.monitoring?.logWarn) {
            this.monitoring.logWarn(message, context);
        } else {
            console.warn(`[${this.constructor.name}] ${message}:`, context);
        }
    }

    /**
     * Common response helpers
     */
    async sendError(ctx, message, showRetry = false) {
        try {
            const keyboard = showRetry ? {
                inline_keyboard: [[
                    { text: '🔄 Try Again', callback_data: 'retry' },
                    { text: '🏠 Main Menu', callback_data: 'main' }
                ]]
            } : {
                inline_keyboard: [[
                    { text: '🏠 Main Menu', callback_data: 'main' }
                ]]
            };

            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
                await ctx.editMessageText(message, { reply_markup: keyboard });
            } else {
                await ctx.reply(message, { reply_markup: keyboard });
            }
        } catch (error) {
            this.logError('Failed to send error message', { error: error.message });
        }
    }

    async sendSuccess(ctx, message, additionalButtons = []) {
        try {
            const keyboard = {
                inline_keyboard: [
                    ...additionalButtons,
                    [{ text: '🏠 Main Menu', callback_data: 'main' }]
                ]
            };

            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
                await ctx.editMessageText(message, { reply_markup: keyboard });
            } else {
                await ctx.reply(message, { reply_markup: keyboard });
            }
        } catch (error) {
            this.logError('Failed to send success message', { error: error.message });
        }
    }

    /**
     * Common cache operations
     */
    async getCacheData(key, userId = null) {
        try {
            if (this.cacheService) {
                this.metrics.cacheHits++;
                return await this.cacheService.get(key, userId);
            }
            this.metrics.cacheMisses++;
            return null;
        } catch (error) {
            this.metrics.cacheMisses++;
            this.logError('Cache get failed', { key, userId, error: error.message });
            return null;
        }
    }

    async setCacheData(key, userId, data, ttl = null) {
        try {
            if (this.cacheService) {
                await this.cacheService.set(key, userId, data, ttl);
                return true;
            }
            return false;
        } catch (error) {
            this.logError('Cache set failed', { key, userId, error: error.message });
            return false;
        }
    }

    async clearCacheData(key, userId = null) {
        try {
            if (this.cacheService) {
                await this.cacheService.delete(key, userId);
                return true;
            }
            return false;
        } catch (error) {
            this.logError('Cache clear failed', { key, userId, error: error.message });
            return false;
        }
    }

    /**
     * Common security checks
     */
    async checkRateLimit(userId, action) {
        try {
            if (this.security?.checkRateLimit) {
                return await this.security.checkRateLimit(userId, action);
            }
            return true; // Allow if no security system
        } catch (error) {
            this.logError('Rate limit check failed', { userId, action, error: error.message });
            return false;
        }
    }

    /**
     * Get handler metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            handlerName: this.constructor.name,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Health check for handler
     */
    async healthCheck() {
        try {
            const checks = {
                database: !!this.database,
                monitoring: !!this.monitoring,
                cache: !!this.cacheService,
                metrics: this.metrics
            };

            return {
                status: 'healthy',
                checks,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = BaseHandler;