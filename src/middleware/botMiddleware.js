// Bot Middleware for Area51 Bot
const UnifiedErrorHandler = require('./UnifiedErrorHandler');
class BotMiddleware {
    constructor(database, monitoring, redis = null, cacheService = null) {
        this.database = database;
        this.errorHandler = new UnifiedErrorHandler(monitoring);
        this.monitoring = monitoring;
        this.redis = redis;
        this.cacheService = cacheService;
        this.userSessions = new Map();
        this.rateLimitMap = new Map();
    }
    // Rate limiting middleware
    rateLimitMiddleware() {
        return async (ctx, next) => {
            const userId = ctx.from.id;
            const now = Date.now();
            const windowMs = 60000; // 1 minute
            const maxRequests = 30; // 30 requests per minute
            if (!this.rateLimitMap.has(userId)) {
                this.rateLimitMap.set(userId, []);
            }
            const userRequests = this.rateLimitMap.get(userId);
            // Remove old requests outside the window
            const validRequests = userRequests.filter(timestamp => now - timestamp < windowMs);
            if (validRequests.length >= maxRequests) {
                this.monitoring.logWarning('Rate limit exceeded', { userId, requests: validRequests.length });
                await ctx.reply('⚠️ Too many requests. Please wait a moment before trying again.');
                return;
            }
            // Add current request
            validRequests.push(now);
            this.rateLimitMap.set(userId, validRequests);
            return next();
        };
    }
    // User authentication middleware
    authMiddleware() {
        return async (ctx, next) => {
            const userId = ctx.from.id;
            try {
                // Skip auth for start command and wallet creation
                if (ctx.message && ctx.message.text === '/start') {
                    return next();
                }
                if (ctx.callbackQuery && ['generate_wallet', 'import_wallet'].includes(ctx.callbackQuery.data)) {
                    return next();
                }
                
                // Skip auth for group messages - allow group functionality without requiring wallets
                if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
                    return next();
                }
                
                // Skip auth for inline queries - allow inline functionality
                if (ctx.inlineQuery) {
                    return next();
                }
                // Check if user exists in database
                let user = null;
                // Try unified cache first
                if (this.cacheService) {
                    try {
                        // Try cache first
                        user = await this.cacheService.get('user', userId);
                        // If not in cache, get from database and cache it
                        if (!user) {
                            user = await this.database.getUserByTelegramId(userId);
                            if (user) {
                                // Cache the user data for future requests
                                await this.cacheService.set('user', userId, user);
                            }
                        }
                    } catch (cacheError) {
                        this.monitoring.logError('Unified cache auth read failed', cacheError, { userId });
                        // Fallback to database
                        user = await this.database.getUserByTelegramId(userId);
                    }
                } else {
                    // Fallback to database
                    user = await this.database.getUserByTelegramId(userId);
                }
                if (!user) {
                    // Check if user is in importing_wallet state - allow them to proceed
                    try {
                        const userState = await this.database.getUserState(userId);
                        if (userState && userState.state === 'importing_wallet') {
                            // User is importing wallet, allow them to proceed without user record
                            return next();
                        }
                    } catch (stateError) {
                        // If we can't check state, continue with normal flow
                    }
                    await ctx.reply('❌ Please start the bot first with /start to create or import a wallet.');
                    return;
                }
                // Add user to context for handlers
                ctx.user = user;
                return next();
            } catch (error) {
                this.monitoring.logError('Auth middleware failed', error, { userId });
                await ctx.reply('⚠️ Authentication error. Please try /start again.');
                return;
            }
        };
    }
    // Session management middleware
    sessionMiddleware() {
        return async (ctx, next) => {
            const userId = ctx.from.id;
            try {
                // Create or update session
                const sessionData = {
                    userId,
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                    lastActivity: new Date(),
                    messageCount: (this.userSessions.get(userId)?.messageCount || 0) + 1
                };
                this.userSessions.set(userId, sessionData);
                // Store in unified cache if available
                if (this.cacheService) {
                    try {
                        await this.cacheService.set('session', userId, sessionData, 3600); // 1 hour TTL
                    } catch (cacheError) {
                        this.monitoring.logError('Session unified cache storage failed', cacheError, { userId });
                    }
                }
                ctx.session = sessionData;
                return next();
            } catch (error) {
                this.monitoring.logError('Session middleware failed', error, { userId });
                return next(); // Continue even if session fails
            }
        };
    }
    // Error handling middleware using unified error handler
    errorMiddleware() {
        return this.errorHandler.asyncHandler(async (ctx, next) => {
            return await next();
        });
    }
    // Get unified error handler instance
    getErrorHandler() {
        return this.errorHandler;
    }
    // Input validation middleware
    inputValidationMiddleware() {
        return async (ctx, next) => {
            try {
                // Validate message length
                if (ctx.message && ctx.message.text && ctx.message.text.length > 1000) {
                    await ctx.reply('❌ Message too long. Please keep it under 1000 characters.');
                    return;
                }
                // Validate callback data
                if (ctx.callbackQuery && ctx.callbackQuery.data && ctx.callbackQuery.data.length > 200) {
                    await ctx.answerCbQuery('❌ Invalid action');
                    return;
                }
                // Basic XSS protection
                if (ctx.message && ctx.message.text) {
                    const text = ctx.message.text;
                    if (text.includes('<script>') || text.includes('javascript:') || text.includes('onload=')) {
                        await ctx.reply('❌ Invalid input detected.');
                        return;
                    }
                }
                return next();
            } catch (error) {
                this.monitoring.logError('Input validation failed', error, { userId: ctx.from?.id });
                return next();
            }
        };
    }
    // Logging middleware
    loggingMiddleware() {
        return async (ctx, next) => {
            const startTime = Date.now();
            const userId = ctx.from?.id || 'unknown';
            try {
                this.monitoring.logInfo('Bot request started', {
                    userId,
                    updateType: ctx.updateType,
                    callbackData: ctx.callbackQuery?.data,
                    messageText: ctx.message?.text?.substring(0, 100) // First 100 chars only
                });
                await next();
                const duration = Date.now() - startTime;
                this.monitoring.logInfo('Bot request completed', { userId, duration });
            } catch (error) {
                const duration = Date.now() - startTime;
                this.monitoring.logError('Bot request failed', error, { userId, duration });
                throw error;
            }
        };
    }
    // Cleanup old sessions periodically
    startSessionCleanup() {
        setInterval(() => {
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            for (const [userId, session] of this.userSessions.entries()) {
                if (now - new Date(session.lastActivity).getTime() > maxAge) {
                    this.userSessions.delete(userId);
                }
            }
            // Clean rate limit map
            for (const [userId, requests] of this.rateLimitMap.entries()) {
                const validRequests = requests.filter(timestamp => now - timestamp < 60000);
                if (validRequests.length === 0) {
                    this.rateLimitMap.delete(userId);
                } else {
                    this.rateLimitMap.set(userId, validRequests);
                }
            }
        }, 5 * 60 * 1000); // Run every 5 minutes
    }
    // Get all middleware in order
    getAllMiddleware() {
        return [
            this.loggingMiddleware(),
            this.inputValidationMiddleware(),
            this.rateLimitMiddleware(),
            this.sessionMiddleware(),
            this.authMiddleware(),
            this.errorMiddleware()
        ];
    }
}
module.exports = BotMiddleware;
// Factory function for backward compatibility
module.exports.createBotMiddleware = function(database, monitoring, redis = null, cacheService = null) {
    const middleware = new BotMiddleware(database, monitoring, redis, cacheService);
    return middleware.getAllMiddleware();
};
