/**
 * MiddlewareManager - Handles all middleware setup for Area51 Bot
 * Extracted from main bot file for better modularity and maintainability
 */

class MiddlewareManager {
    constructor(bot, database, monitoring, simpleAccessCode) {
        this.bot = bot;
        this.database = database;
        this.monitoring = monitoring;
        this.simpleAccessCode = simpleAccessCode;
    }

    /**
     * Setup all middleware in the correct order
     */
    setupMiddleware() {
        console.log('🔧 Setting up middleware...');

        // 1. Access Control Middleware (first priority)
        this.setupAccessControl();

        // 2. Error Handling Middleware
        this.setupErrorHandling();

        // 3. Monitoring Middleware
        this.setupMonitoring();

        // 4. User Activity Tracking
        this.setupUserActivityTracking();

        console.log('✅ All middleware setup complete');
    }

    /**
     * Setup access control middleware
     */
    setupAccessControl() {
        this.bot.use(async (ctx, next) => {
            try {
                const userId = ctx.from?.id;
                
                if (!userId) {
                    console.log('❌ No user ID found in context');
                    return;
                }

                // Check if user has access
                const hasAccess = await this.simpleAccessCode.checkAccess(userId);
                
                if (!hasAccess) {
                    // User doesn't have access, show access code prompt
                    await this.simpleAccessCode.showAccessPrompt(ctx);
                    return;
                }

                // User has access, continue to next middleware
                await next();
                
            } catch (error) {
                this.monitoring?.logError('Access control middleware error', error, { 
                    userId: ctx.from?.id,
                    updateType: ctx.updateType 
                });
                
                await ctx.reply('❌ Access verification failed. Please try again.');
            }
        });

        console.log('✅ Access control middleware setup');
    }

    /**
     * Setup error handling middleware
     */
    setupErrorHandling() {
        this.bot.catch(async (err, ctx) => {
            try {
                const userId = ctx.from?.id;
                const updateType = ctx.updateType;
                const errorMessage = err.message || 'Unknown error';
                
                // Log the error with context
                this.monitoring?.logError('Bot error caught by middleware', err, {
                    userId,
                    updateType,
                    errorMessage,
                    stack: err.stack
                });

                // Determine appropriate user message based on error type
                let userMessage = '❌ An error occurred. Please try again.';
                
                if (errorMessage.includes('message is not modified')) {
                    // Silent error - don't notify user
                    return;
                }
                
                if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
                    userMessage = '🌐 Network error. Please check your connection and try again.';
                } else if (errorMessage.includes('database') || errorMessage.includes('sql')) {
                    userMessage = '💾 Database error. Please try again in a moment.';
                } else if (errorMessage.includes('api') || errorMessage.includes('request')) {
                    userMessage = '🔌 API error. Please try again later.';
                }

                // Try to send error message to user
                try {
                    if (ctx.callbackQuery) {
                        await ctx.answerCbQuery(userMessage);
                    } else {
                        await ctx.reply(userMessage);
                    }
                } catch (sendError) {
                    // If we can't send to user, just log it
                    this.monitoring?.logError('Failed to send error message to user', sendError, { userId });
                }

            } catch (handlerError) {
                // Last resort error logging
                console.error('Error in error handler:', handlerError);
                this.monitoring?.logError('Error handler failed', handlerError, { 
                    originalError: err.message,
                    userId: ctx.from?.id 
                });
            }
        });

        console.log('✅ Error handling middleware setup');
    }

    /**
     * Setup monitoring middleware
     */
    setupMonitoring() {
        this.bot.use(async (ctx, next) => {
            const startTime = Date.now();
            const userId = ctx.from?.id;
            const updateType = ctx.updateType;
            
            try {
                // Log incoming request
                this.monitoring?.logActivity('request_received', {
                    userId,
                    updateType,
                    timestamp: new Date().toISOString()
                });

                // Continue to next middleware/handler
                await next();

                // Log successful completion
                const duration = Date.now() - startTime;
                this.monitoring?.logActivity('request_completed', {
                    userId,
                    updateType,
                    duration,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                // Log error with timing
                const duration = Date.now() - startTime;
                this.monitoring?.logError('Request failed in monitoring middleware', error, {
                    userId,
                    updateType,
                    duration,
                    timestamp: new Date().toISOString()
                });
                
                // Re-throw error to be handled by error middleware
                throw error;
            }
        });

        console.log('✅ Monitoring middleware setup');
    }

    /**
     * Setup user activity tracking
     */
    setupUserActivityTracking() {
        this.bot.use(async (ctx, next) => {
            try {
                const userId = ctx.from?.id;
                
                if (userId) {
                    // Update user's last activity
                    await this.updateUserActivity(userId, ctx);
                }

                // Continue to next middleware/handler
                await next();
                
            } catch (error) {
                this.monitoring?.logError('User activity tracking error', error, { 
                    userId: ctx.from?.id 
                });
                
                // Don't block request for activity tracking errors
                await next();
            }
        });

        console.log('✅ User activity tracking middleware setup');
    }

    /**
     * Update user activity in database
     */
    async updateUserActivity(userId, ctx) {
        try {
            const activityData = {
                last_activity: new Date(),
                last_update_type: ctx.updateType,
                total_interactions: 1 // Will be incremented in database
            };

            // Add specific data based on update type
            if (ctx.message) {
                activityData.last_message_type = ctx.message.text ? 'text' : 'other';
            } else if (ctx.callbackQuery) {
                activityData.last_callback_data = ctx.callbackQuery.data;
            }

            // Update user activity in database
            await this.database.updateUserActivity(userId, activityData);
            
        } catch (error) {
            this.monitoring?.logError('Failed to update user activity', error, { userId });
        }
    }

    /**
     * Setup rate limiting middleware (optional)
     */
    setupRateLimiting() {
        const userRequests = new Map();
        const RATE_LIMIT = 30; // requests per minute
        const WINDOW_MS = 60 * 1000; // 1 minute

        this.bot.use(async (ctx, next) => {
            try {
                const userId = ctx.from?.id;
                
                if (!userId) {
                    await next();
                    return;
                }

                const now = Date.now();
                const userKey = userId.toString();
                
                // Get user's request history
                if (!userRequests.has(userKey)) {
                    userRequests.set(userKey, []);
                }
                
                const requests = userRequests.get(userKey);
                
                // Remove old requests outside the window
                const validRequests = requests.filter(time => now - time < WINDOW_MS);
                
                // Check if user exceeded rate limit
                if (validRequests.length >= RATE_LIMIT) {
                    this.monitoring?.logActivity('rate_limit_exceeded', {
                        userId,
                        requestCount: validRequests.length,
                        timestamp: new Date().toISOString()
                    });
                    
                    await ctx.reply('⏰ Too many requests. Please wait a moment before trying again.');
                    return;
                }
                
                // Add current request
                validRequests.push(now);
                userRequests.set(userKey, validRequests);
                
                // Continue to next middleware
                await next();
                
            } catch (error) {
                this.monitoring?.logError('Rate limiting middleware error', error, { 
                    userId: ctx.from?.id 
                });
                
                // Don't block request for rate limiting errors
                await next();
            }
        });

        console.log('✅ Rate limiting middleware setup');
    }

    /**
     * Setup session management middleware (optional)
     */
    setupSessionManagement() {
        this.bot.use(async (ctx, next) => {
            try {
                const userId = ctx.from?.id;
                
                if (userId) {
                    // Initialize or update user session
                    ctx.session = await this.getOrCreateSession(userId);
                }

                await next();
                
            } catch (error) {
                this.monitoring?.logError('Session management error', error, { 
                    userId: ctx.from?.id 
                });
                
                // Continue without session if there's an error
                await next();
            }
        });

        console.log('✅ Session management middleware setup');
    }

    /**
     * Get or create user session
     */
    async getOrCreateSession(userId) {
        try {
            // Try to get existing session from database or cache
            let session = await this.database.getUserSession(userId);
            
            if (!session) {
                // Create new session
                session = {
                    userId,
                    createdAt: new Date(),
                    lastActivity: new Date(),
                    data: {}
                };
                
                await this.database.createUserSession(userId, session);
            } else {
                // Update last activity
                session.lastActivity = new Date();
                await this.database.updateUserSession(userId, session);
            }
            
            return session;
            
        } catch (error) {
            this.monitoring?.logError('Failed to manage user session', error, { userId });
            
            // Return minimal session on error
            return {
                userId,
                createdAt: new Date(),
                lastActivity: new Date(),
                data: {}
            };
        }
    }

    /**
     * Setup security middleware (optional)
     */
    setupSecurityMiddleware() {
        this.bot.use(async (ctx, next) => {
            try {
                const userId = ctx.from?.id;
                const message = ctx.message?.text || ctx.callbackQuery?.data || '';
                
                // Basic security checks
                if (this.containsSuspiciousContent(message)) {
                    this.monitoring?.logActivity('suspicious_content_detected', {
                        userId,
                        content: message.substring(0, 100), // Log first 100 chars only
                        timestamp: new Date().toISOString()
                    });
                    
                    await ctx.reply('⚠️ Suspicious content detected. Please contact support if this is an error.');
                    return;
                }

                await next();
                
            } catch (error) {
                this.monitoring?.logError('Security middleware error', error, { 
                    userId: ctx.from?.id 
                });
                
                // Continue for security middleware errors
                await next();
            }
        });

        console.log('✅ Security middleware setup');
    }

    /**
     * Check for suspicious content
     */
    containsSuspiciousContent(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }

        const suspiciousPatterns = [
            /script\s*>/i,
            /<\s*iframe/i,
            /javascript:/i,
            /data:text\/html/i,
            /eval\s*\(/i,
            /document\./i,
            /window\./i
        ];

        return suspiciousPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Setup all optional middleware
     */
    setupOptionalMiddleware() {
        console.log('🔧 Setting up optional middleware...');
        
        this.setupRateLimiting();
        this.setupSessionManagement();
        this.setupSecurityMiddleware();
        
        console.log('✅ Optional middleware setup complete');
    }
}

module.exports = MiddlewareManager;