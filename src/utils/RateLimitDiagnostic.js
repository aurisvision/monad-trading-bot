/**
 * 🔧 Rate Limit Diagnostic Tool
 * Helps diagnose and fix stuck rate limit timers
 */

class RateLimitDiagnostic {
    constructor(redis, rateLimiter) {
        this.redis = redis;
        this.rateLimiter = rateLimiter;
    }

    /**
     * Diagnose rate limit status for a user
     * @param {string} userId - User's Telegram ID
     * @param {string} operation - Operation type (e.g., 'export_private_key')
     * @returns {Promise<Object>} Diagnostic information
     */
    async diagnoseRateLimit(userId, operation) {
        try {
            const now = Date.now();
            const key = `sensitive:${operation}:${userId}`;
            
            // Get raw data from Redis
            let rawData = null;
            let attempts = [];
            
            if (this.redis) {
                try {
                    rawData = await this.redis.get(key);
                    if (rawData) {
                        attempts = JSON.parse(rawData);
                    }
                } catch (error) {
                    console.error('Redis error:', error.message);
                }
            }

            // Get configuration
            const config = this.rateLimiter.sensitiveOperations[operation];
            if (!config) {
                return { error: `Unknown operation: ${operation}` };
            }

            // Calculate valid attempts (not expired)
            const validAttempts = attempts.filter(timestamp => now - timestamp < config.window);
            const expiredAttempts = attempts.filter(timestamp => now - timestamp >= config.window);

            // Calculate reset times using both methods
            const currentResetTime = validAttempts.length > 0 ? 
                Math.min(...validAttempts) + config.window : now;
            
            const correctResetTime = validAttempts.length > 0 ? 
                Math.max(...validAttempts) + config.window : now;

            // Time until reset
            const timeUntilReset = Math.max(0, correctResetTime - now);
            const minutesUntilReset = Math.ceil(timeUntilReset / 60000);

            return {
                userId,
                operation,
                currentTime: new Date(now).toISOString(),
                config: {
                    limit: config.limit,
                    windowMs: config.window,
                    windowMinutes: config.window / 60000
                },
                rawData: {
                    redisKey: key,
                    storedData: rawData,
                    allAttempts: attempts.map(t => new Date(t).toISOString())
                },
                analysis: {
                    totalAttempts: attempts.length,
                    validAttempts: validAttempts.length,
                    expiredAttempts: expiredAttempts.length,
                    remaining: Math.max(0, config.limit - validAttempts.length),
                    isBlocked: validAttempts.length >= config.limit
                },
                resetTimes: {
                    currentCalculation: {
                        timestamp: currentResetTime,
                        iso: new Date(currentResetTime).toISOString(),
                        isPast: currentResetTime < now
                    },
                    correctCalculation: {
                        timestamp: correctResetTime,
                        iso: new Date(correctResetTime).toISOString(),
                        isPast: correctResetTime < now
                    }
                },
                timeUntilReset: {
                    milliseconds: timeUntilReset,
                    minutes: minutesUntilReset,
                    isStuck: currentResetTime < now && validAttempts.length >= config.limit
                },
                recommendation: this.getRecommendation(validAttempts, config, now, currentResetTime)
            };

        } catch (error) {
            return {
                error: `Diagnostic failed: ${error.message}`,
                userId,
                operation
            };
        }
    }

    /**
     * Get recommendation for fixing the issue
     */
    getRecommendation(validAttempts, config, now, currentResetTime) {
        if (validAttempts.length >= config.limit && currentResetTime < now) {
            return {
                issue: 'STUCK_TIMER',
                description: 'Reset time is in the past, causing permanent block',
                solution: 'Fix the reset time calculation logic or manually reset the rate limit',
                severity: 'CRITICAL'
            };
        }
        
        if (validAttempts.length >= config.limit) {
            const timeLeft = currentResetTime - now;
            return {
                issue: 'RATE_LIMITED',
                description: 'User is properly rate limited',
                solution: `Wait ${Math.ceil(timeLeft / 60000)} minutes for automatic reset`,
                severity: 'NORMAL'
            };
        }

        return {
            issue: 'NONE',
            description: 'Rate limiting is working correctly',
            solution: 'No action needed',
            severity: 'OK'
        };
    }

    /**
     * Fix stuck rate limit by resetting it
     * @param {string} userId - User's Telegram ID
     * @param {string} operation - Operation type
     * @returns {Promise<Object>} Reset result
     */
    async fixStuckRateLimit(userId, operation) {
        try {
            const diagnostic = await this.diagnoseRateLimit(userId, operation);
            
            if (diagnostic.timeUntilReset?.isStuck) {
                const success = await this.rateLimiter.resetRateLimit(userId, operation);
                return {
                    success,
                    message: success ? 'Rate limit reset successfully' : 'Failed to reset rate limit',
                    diagnostic
                };
            } else {
                return {
                    success: false,
                    message: 'Rate limit is not stuck, no reset needed',
                    diagnostic
                };
            }
        } catch (error) {
            return {
                success: false,
                message: `Fix failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Generate a user-friendly status message
     * @param {Object} diagnostic - Diagnostic result
     * @returns {string} Formatted message
     */
    generateStatusMessage(diagnostic) {
        if (diagnostic.error) {
            return `❌ خطأ في التشخيص: ${diagnostic.error}`;
        }

        const { analysis, timeUntilReset, recommendation } = diagnostic;
        
        let message = `🔍 **تشخيص نظام الحماية**\n\n`;
        message += `👤 المستخدم: ${diagnostic.userId}\n`;
        message += `🔧 العملية: ${diagnostic.operation}\n`;
        message += `📊 الحد المسموح: ${diagnostic.config.limit} مرة/ساعة\n`;
        message += `📈 المحاولات المستخدمة: ${analysis.validAttempts}/${diagnostic.config.limit}\n`;
        message += `⏳ المحاولات المتبقية: ${analysis.remaining}\n\n`;

        if (recommendation.issue === 'STUCK_TIMER') {
            message += `🚨 **مشكلة مكتشفة: ${recommendation.issue}**\n`;
            message += `📝 الوصف: ${recommendation.description}\n`;
            message += `💡 الحل: ${recommendation.solution}\n`;
        } else if (analysis.isBlocked) {
            message += `⏰ وقت إعادة التعيين: ${timeUntilReset.minutes} دقيقة\n`;
        } else {
            message += `✅ النظام يعمل بشكل طبيعي\n`;
        }

        return message;
    }
}

module.exports = RateLimitDiagnostic;