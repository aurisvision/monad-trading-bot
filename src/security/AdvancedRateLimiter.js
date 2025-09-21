/**
 * ✅ SECURITY: Advanced Rate Limiter for Sensitive Operations
 * Implements granular rate limiting for different types of sensitive operations
 */

class AdvancedRateLimiter {
    constructor(redis, monitoring) {
        this.redis = redis;
        this.monitoring = monitoring;
        
        // ✅ SECURITY: Different limits for different sensitive operations
        this.sensitiveOperations = {
            'export_private_key': { 
                limit: 3, 
                window: 3600000, // 3 times per hour
                description: 'Private key export'
            },
            'reveal_mnemonic': { 
                limit: 2, 
                window: 3600000, // 2 times per hour
                description: 'Mnemonic reveal'
            },
            'import_wallet': { 
                limit: 5, 
                window: 3600000, // 5 times per hour
                description: 'Wallet import'
            },
            'delete_wallet': { 
                limit: 2, 
                window: 86400000, // 2 times per day
                description: 'Wallet deletion'
            },
            'change_settings': { 
                limit: 10, 
                window: 600000, // 10 times per 10 minutes
                description: 'Settings modification'
            },
            'failed_auth': { 
                limit: 5, 
                window: 900000, // 5 failed attempts per 15 minutes
                description: 'Failed authentication'
            }
        };
        
        // Track suspicious patterns
        this.suspiciousPatterns = new Map();
    }

    /**
     * Check if a sensitive operation is allowed for a user
     * @param {string} userId - User's Telegram ID
     * @param {string} operation - Operation type
     * @param {Object} context - Additional context (IP, timestamp, etc.)
     * @returns {Promise<Object>} - { allowed: boolean, remaining: number, resetTime: number }
     */
    async checkSensitiveOperation(userId, operation, context = {}) {
        try {
            const config = this.sensitiveOperations[operation];
            if (!config) {
                // Unknown operation - allow but log
                this.monitoring.logWarning('Unknown sensitive operation', { userId, operation });
                return { allowed: true, remaining: Infinity, resetTime: 0 };
            }

            const key = `sensitive:${operation}:${userId}`;
            const now = Date.now();
            
            // Get current attempts from Redis
            let attempts = [];
            if (this.redis) {
                try {
                    const stored = await this.redis.get(key);
                    if (stored) {
                        attempts = JSON.parse(stored);
                    }
                } catch (redisError) {
                    this.monitoring.logError('Redis error in rate limiter', { 
                        message: redisError.message, 
                        userId, 
                        operation 
                    });
                    // Fallback to in-memory tracking
                    attempts = this.getInMemoryAttempts(userId, operation);
                }
            } else {
                // Fallback to in-memory tracking
                attempts = this.getInMemoryAttempts(userId, operation);
            }

            // Remove expired attempts
            const validAttempts = attempts.filter(timestamp => now - timestamp < config.window);
            
            // Check if limit exceeded
            if (validAttempts.length >= config.limit) {
                const oldestAttempt = Math.min(...validAttempts);
                const resetTime = oldestAttempt + config.window;
                
                // Log rate limit violation
                this.monitoring.logWarning('Rate limit exceeded', {
                    userId,
                    operation,
                    attempts: validAttempts.length,
                    limit: config.limit,
                    resetTime: new Date(resetTime).toISOString()
                });

                // Track suspicious behavior
                await this.trackSuspiciousActivity(userId, operation, context);
                
                return {
                    allowed: false,
                    remaining: 0,
                    resetTime,
                    message: `Rate limit exceeded for ${config.description}. Try again later.`
                };
            }

            // Add current attempt
            validAttempts.push(now);
            
            // Store updated attempts
            if (this.redis) {
                try {
                    await this.redis.setex(key, Math.ceil(config.window / 1000), JSON.stringify(validAttempts));
                } catch (redisError) {
                    this.monitoring.logError('Redis storage error in rate limiter', { 
                        message: redisError.message, 
                        userId, 
                        operation 
                    });
                    // Store in memory as fallback
                    this.setInMemoryAttempts(userId, operation, validAttempts);
                }
            } else {
                this.setInMemoryAttempts(userId, operation, validAttempts);
            }

            const remaining = config.limit - validAttempts.length;
            const resetTime = now + config.window;

            return {
                allowed: true,
                remaining,
                resetTime,
                message: `${remaining} attempts remaining for ${config.description}`
            };

        } catch (error) {
            this.monitoring.logError('Rate limiter error', { 
                message: error.message, 
                userId, 
                operation 
            });
            
            // Fail open for availability, but log the error
            return { 
                allowed: true, 
                remaining: 0, 
                resetTime: 0,
                message: 'Rate limiter temporarily unavailable'
            };
        }
    }

    /**
     * Track suspicious activity patterns
     * @param {string} userId - User's Telegram ID
     * @param {string} operation - Operation type
     * @param {Object} context - Additional context
     */
    async trackSuspiciousActivity(userId, operation, context) {
        try {
            const key = `suspicious:${userId}`;
            const now = Date.now();
            
            let activities = [];
            if (this.redis) {
                try {
                    const stored = await this.redis.get(key);
                    if (stored) {
                        activities = JSON.parse(stored);
                    }
                } catch (redisError) {
                    // Use in-memory fallback
                    activities = this.suspiciousPatterns.get(userId) || [];
                }
            } else {
                activities = this.suspiciousPatterns.get(userId) || [];
            }

            // Add current suspicious activity
            activities.push({
                operation,
                timestamp: now,
                context: {
                    userAgent: context.userAgent,
                    ip: context.ip,
                    sessionId: context.sessionId
                }
            });

            // Keep only last 24 hours of activities
            const dayAgo = now - 86400000;
            activities = activities.filter(activity => activity.timestamp > dayAgo);

            // Store updated activities
            if (this.redis) {
                try {
                    await this.redis.setex(key, 86400, JSON.stringify(activities)); // 24 hours
                } catch (redisError) {
                    this.suspiciousPatterns.set(userId, activities);
                }
            } else {
                this.suspiciousPatterns.set(userId, activities);
            }

            // Check for patterns that indicate potential abuse
            await this.analyzeSuspiciousPatterns(userId, activities);

        } catch (error) {
            this.monitoring.logError('Suspicious activity tracking error', { 
                message: error.message, 
                userId, 
                operation 
            });
        }
    }

    /**
     * Analyze suspicious patterns and trigger alerts
     * @param {string} userId - User's Telegram ID
     * @param {Array} activities - Recent suspicious activities
     */
    async analyzeSuspiciousPatterns(userId, activities) {
        try {
            const now = Date.now();
            const hourAgo = now - 3600000;
            const recentActivities = activities.filter(activity => activity.timestamp > hourAgo);

            // Pattern 1: Too many different sensitive operations in short time
            const uniqueOperations = new Set(recentActivities.map(a => a.operation));
            if (uniqueOperations.size >= 3 && recentActivities.length >= 5) {
                await this.triggerSecurityAlert(userId, 'MULTIPLE_SENSITIVE_OPERATIONS', {
                    operations: Array.from(uniqueOperations),
                    count: recentActivities.length,
                    timeframe: '1 hour'
                });
            }

            // Pattern 2: Repeated failed attempts on same operation
            const operationCounts = {};
            recentActivities.forEach(activity => {
                operationCounts[activity.operation] = (operationCounts[activity.operation] || 0) + 1;
            });

            for (const [operation, count] of Object.entries(operationCounts)) {
                if (count >= 3) {
                    await this.triggerSecurityAlert(userId, 'REPEATED_RATE_LIMIT_VIOLATIONS', {
                        operation,
                        count,
                        timeframe: '1 hour'
                    });
                }
            }

        } catch (error) {
            this.monitoring.logError('Pattern analysis error', { 
                message: error.message, 
                userId 
            });
        }
    }

    /**
     * Trigger security alert for suspicious behavior
     * @param {string} userId - User's Telegram ID
     * @param {string} alertType - Type of security alert
     * @param {Object} details - Alert details
     */
    async triggerSecurityAlert(userId, alertType, details) {
        try {
            const alert = {
                userId,
                alertType,
                details,
                timestamp: new Date().toISOString(),
                severity: 'HIGH'
            };

            // Log the security alert
            this.monitoring.logWarning('Security Alert Triggered', alert);

            // Store alert for further analysis
            if (this.redis) {
                const alertKey = `security_alert:${userId}:${Date.now()}`;
                await this.redis.setex(alertKey, 604800, JSON.stringify(alert)); // 7 days
            }

            // TODO: Implement additional alert mechanisms (email, Telegram admin notification, etc.)
            
        } catch (error) {
            this.monitoring.logError('Security alert error', { 
                message: error.message, 
                userId, 
                alertType 
            });
        }
    }

    /**
     * In-memory fallback for when Redis is unavailable
     */
    getInMemoryAttempts(userId, operation) {
        const key = `${userId}:${operation}`;
        return this.inMemoryAttempts?.get(key) || [];
    }

    setInMemoryAttempts(userId, operation, attempts) {
        if (!this.inMemoryAttempts) {
            this.inMemoryAttempts = new Map();
        }
        const key = `${userId}:${operation}`;
        this.inMemoryAttempts.set(key, attempts);
    }

    /**
     * Get rate limit status for a user and operation
     * @param {string} userId - User's Telegram ID
     * @param {string} operation - Operation type
     * @returns {Promise<Object>} - Current rate limit status
     */
    async getRateLimitStatus(userId, operation) {
        const config = this.sensitiveOperations[operation];
        if (!config) {
            return { exists: false };
        }

        const key = `sensitive:${operation}:${userId}`;
        let attempts = [];
        
        if (this.redis) {
            try {
                const stored = await this.redis.get(key);
                if (stored) {
                    attempts = JSON.parse(stored);
                }
            } catch (error) {
                attempts = this.getInMemoryAttempts(userId, operation);
            }
        } else {
            attempts = this.getInMemoryAttempts(userId, operation);
        }

        const now = Date.now();
        const validAttempts = attempts.filter(timestamp => now - timestamp < config.window);
        const remaining = Math.max(0, config.limit - validAttempts.length);
        const resetTime = validAttempts.length > 0 ? 
            Math.min(...validAttempts) + config.window : now;

        return {
            exists: true,
            operation: config.description,
            limit: config.limit,
            used: validAttempts.length,
            remaining,
            resetTime,
            windowMs: config.window
        };
    }

    /**
     * Reset rate limit for a user and operation (admin function)
     * @param {string} userId - User's Telegram ID
     * @param {string} operation - Operation type
     * @returns {Promise<boolean>} - Success status
     */
    async resetRateLimit(userId, operation) {
        try {
            const key = `sensitive:${operation}:${userId}`;
            
            if (this.redis) {
                await this.redis.del(key);
            }
            
            if (this.inMemoryAttempts) {
                const memKey = `${userId}:${operation}`;
                this.inMemoryAttempts.delete(memKey);
            }

            this.monitoring.logInfo('Rate limit reset', { userId, operation });
            return true;
            
        } catch (error) {
            this.monitoring.logError('Rate limit reset error', { 
                message: error.message, 
                userId, 
                operation 
            });
            return false;
        }
    }
}

module.exports = AdvancedRateLimiter;
