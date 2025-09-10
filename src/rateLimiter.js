// Rate limiting and security enhancements for Area51 Bot
const Redis = require('redis');

class RateLimiter {
    constructor(redisClient, monitoring) {
        this.redis = redisClient;
        this.monitoring = monitoring;
        this.defaultLimits = {
            requests: {
                window: 60, // 1 minute
                max: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 60
            },
            transactions: {
                window: 3600, // 1 hour
                max: parseInt(process.env.MAX_TRANSACTIONS_PER_HOUR) || 100
            },
            login: {
                window: 900, // 15 minutes
                max: 5
            }
        };
    }

    async checkLimit(userId, type = 'requests') {
        const limit = this.defaultLimits[type];
        const key = `rate_limit:${type}:${userId}`;
        
        try {
            const current = await this.redis.get(key);
            const count = current ? parseInt(current) : 0;
            
            if (count >= limit.max) {
                this.monitoring.logWarn('Rate limit exceeded', {
                    userId,
                    type,
                    count,
                    limit: limit.max
                });
                return false;
            }
            
            // Increment counter
            const pipeline = this.redis.multi();
            pipeline.incr(key);
            if (!current) {
                pipeline.expire(key, limit.window);
            }
            await pipeline.exec();
            
            return true;
        } catch (error) {
            this.monitoring.logError('Rate limit check failed', error, { userId, type });
            // Fail open - allow request if Redis is down
            return true;
        }
    }

    async getRemainingRequests(userId, type = 'requests') {
        const limit = this.defaultLimits[type];
        const key = `rate_limit:${type}:${userId}`;
        
        try {
            const current = await this.redis.get(key);
            const count = current ? parseInt(current) : 0;
            return Math.max(0, limit.max - count);
        } catch (error) {
            return limit.max; // Fail open
        }
    }

    async resetLimit(userId, type = 'requests') {
        const key = `rate_limit:${type}:${userId}`;
        try {
            await this.redis.del(key);
            this.monitoring.logInfo('Rate limit reset', { userId, type });
        } catch (error) {
            this.monitoring.logError('Rate limit reset failed', error, { userId, type });
        }
    }

    // Middleware for Express/Telegraf
    middleware(type = 'requests') {
        return async (ctx, next) => {
            const userId = ctx.from?.id || 'anonymous';
            
            const allowed = await this.checkLimit(userId, type);
            if (!allowed) {
                const remaining = await this.getRemainingRequests(userId, type);
                const limit = this.defaultLimits[type];
                
                await ctx.reply(
                    `⚠️ Rate limit exceeded. Please wait ${Math.ceil(limit.window / 60)} minutes before trying again.`
                );
                return;
            }
            
            await next();
        };
    }
}

class SecurityEnhancements {
    constructor(monitoring) {
        this.monitoring = monitoring;
        this.suspiciousPatterns = [
            /script/i,
            /javascript/i,
            /eval/i,
            /exec/i,
            /<script/i,
            /on\w+=/i
        ];
        this.blockedUsers = new Set();
        this.warningCounts = new Map();
    }

    validateInput(input) {
        if (typeof input !== 'string') return true;
        
        // Check for suspicious patterns
        for (const pattern of this.suspiciousPatterns) {
            if (pattern.test(input)) {
                return false;
            }
        }
        
        // Check input length
        if (input.length > 1000) {
            return false;
        }
        
        return true;
    }

    validateAddress(address) {
        // Ethereum address validation
        const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
        return ethAddressRegex.test(address);
    }

    validateAmount(amount) {
        // Validate numeric amount
        const num = parseFloat(amount);
        return !isNaN(num) && num > 0 && num < 1e18; // Reasonable upper limit
    }

    async checkSuspiciousActivity(userId, action, data = {}) {
        const key = `suspicious:${userId}`;
        const warnings = this.warningCounts.get(userId) || 0;
        
        // Check for blocked user
        if (this.blockedUsers.has(userId)) {
            this.monitoring.logWarn('Blocked user attempted action', {
                userId,
                action,
                data
            });
            return false;
        }
        
        // Validate input data
        if (data.input && !this.validateInput(data.input)) {
            this.warningCounts.set(userId, warnings + 1);
            this.monitoring.logWarn('Suspicious input detected', {
                userId,
                action,
                input: data.input
            });
            
            if (warnings >= 3) {
                this.blockUser(userId, 'Multiple suspicious inputs');
                return false;
            }
        }
        
        // Check for rapid-fire actions
        if (action === 'transaction') {
            const recentActions = await this.getRecentActions(userId);
            if (recentActions > 10) { // More than 10 transactions in recent period
                this.monitoring.logWarn('Rapid transaction activity detected', {
                    userId,
                    recentActions
                });
                return false;
            }
        }
        
        return true;
    }

    blockUser(userId, reason) {
        this.blockedUsers.add(userId);
        this.monitoring.logError('User blocked', null, {
            userId,
            reason,
            timestamp: new Date().toISOString()
        });
    }

    unblockUser(userId) {
        this.blockedUsers.delete(userId);
        this.warningCounts.delete(userId);
        this.monitoring.logInfo('User unblocked', { userId });
    }

    async getRecentActions(userId) {
        // This would query the database for recent actions
        // Placeholder implementation
        return 0;
    }

    // Middleware for input validation
    inputValidationMiddleware() {
        return async (ctx, next) => {
            const userId = ctx.from?.id;
            const text = ctx.message?.text || '';
            
            const isValid = await this.checkSuspiciousActivity(userId, 'input', {
                input: text
            });
            
            if (!isValid) {
                await ctx.reply('⚠️ Invalid input detected. Please try again.');
                return;
            }
            
            await next();
        };
    }

    // Transaction validation middleware
    transactionValidationMiddleware() {
        return async (ctx, next) => {
            const userId = ctx.from?.id;
            
            const isValid = await this.checkSuspiciousActivity(userId, 'transaction');
            
            if (!isValid) {
                await ctx.reply('⚠️ Transaction blocked due to security concerns.');
                return;
            }
            
            await next();
        };
    }
}

class SessionManager {
    constructor(redisClient, monitoring) {
        this.redis = redisClient;
        this.monitoring = monitoring;
        this.sessionTimeout = 3600; // 1 hour
    }

    async createSession(userId, data = {}) {
        const sessionId = `session:${userId}:${Date.now()}`;
        const sessionData = {
            userId,
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            ...data
        };
        
        try {
            // Use Redis v4+ setEx method
            await this.redis.setEx(sessionId, this.sessionTimeout, JSON.stringify(sessionData));
            this.monitoring.logInfo('Session created', { userId, sessionId });
            return sessionId;
        } catch (error) {
            this.monitoring.logError('Session creation failed', error, { userId });
            throw error;
        }
    }

    async getSession(sessionId) {
        try {
            const data = await this.redis.get(sessionId);
            if (!data) return null;
            
            const session = JSON.parse(data);
            
            // Update last activity
            session.lastActivity = new Date().toISOString();
            await this.redis.setEx(sessionId, this.sessionTimeout, JSON.stringify(session));
            
            return session;
        } catch (error) {
            this.monitoring.logError('Session retrieval failed', error, { sessionId });
            return null;
        }
    }

    async updateSession(sessionId, data) {
        try {
            const existing = await this.getSession(sessionId);
            if (!existing) return false;
            
            const updated = {
                ...existing,
                ...data,
                lastActivity: new Date().toISOString()
            };
            
            await this.redis.setEx(sessionId, this.sessionTimeout, JSON.stringify(updated));
            return true;
        } catch (error) {
            this.monitoring.logError('Session update failed', error, { sessionId });
            return false;
        }
    }

    async destroySession(sessionId) {
        try {
            await this.redis.del(sessionId);
            this.monitoring.logInfo('Session destroyed', { sessionId });
        } catch (error) {
            this.monitoring.logError('Session destruction failed', error, { sessionId });
        }
    }

    async cleanupExpiredSessions() {
        // This would be called periodically to clean up expired sessions
        this.monitoring.logInfo('Session cleanup completed');
    }
}

// Memory-based fallbacks for when Redis is not available
class MemoryRateLimiter {
    constructor(monitoring) {
        this.monitoring = monitoring;
        this.limits = new Map();
        this.defaultLimits = {
            requests: { window: 60, max: 60 },
            transactions: { window: 3600, max: 100 },
            login: { window: 900, max: 5 }
        };
    }

    async checkLimit(userId, type = 'requests') {
        const limit = this.defaultLimits[type];
        const key = `${type}:${userId}`;
        const now = Date.now();
        
        if (!this.limits.has(key)) {
            this.limits.set(key, { count: 1, resetTime: now + (limit.window * 1000) });
            return true;
        }
        
        const data = this.limits.get(key);
        if (now > data.resetTime) {
            this.limits.set(key, { count: 1, resetTime: now + (limit.window * 1000) });
            return true;
        }
        
        if (data.count >= limit.max) {
            this.monitoring.logWarn('Rate limit exceeded (memory)', { userId, type, count: data.count });
            return false;
        }
        
        data.count++;
        return true;
    }

    async resetLimit(userId, type = 'requests') {
        const key = `${type}:${userId}`;
        this.limits.delete(key);
    }
}

class MemorySessionManager {
    constructor(monitoring) {
        this.monitoring = monitoring;
        this.sessions = new Map();
        this.sessionTimeout = 3600000; // 1 hour in milliseconds
    }

    async createSession(userId, data = {}) {
        const sessionId = `session:${userId}:${Date.now()}`;
        const sessionData = {
            userId,
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            expiresAt: Date.now() + this.sessionTimeout,
            ...data
        };
        
        this.sessions.set(sessionId, sessionData);
        this.monitoring.logInfo('Session created (memory)', { userId, sessionId });
        return sessionId;
    }

    async getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        
        if (Date.now() > session.expiresAt) {
            this.sessions.delete(sessionId);
            return null;
        }
        
        return session;
    }

    async updateSession(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (!session) return false;
        
        if (Date.now() > session.expiresAt) {
            this.sessions.delete(sessionId);
            return false;
        }
        
        Object.assign(session, data, { lastActivity: new Date().toISOString() });
        return true;
    }

    async deleteSession(sessionId) {
        return this.sessions.delete(sessionId);
    }

    async getUserSessions(userId) {
        const userSessions = [];
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.userId === userId && Date.now() <= session.expiresAt) {
                userSessions.push({ sessionId, ...session });
            }
        }
        return userSessions;
    }

    async cleanup() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now > session.expiresAt) {
                this.sessions.delete(sessionId);
            }
        }
    }
}

module.exports = {
    RateLimiter,
    SecurityEnhancements,
    SessionManager,
    MemoryRateLimiter,
    MemorySessionManager
};
