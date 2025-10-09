/**
 * 🛠️ Admin Rate Limit Manager
 * Administrative tool for managing rate limits and fixing stuck timers
 */

const RateLimitDiagnostic = require('./RateLimitDiagnostic');

class AdminRateLimitManager {
    constructor(redis, rateLimiter, monitoring) {
        this.redis = redis;
        this.rateLimiter = rateLimiter;
        this.monitoring = monitoring;
        this.diagnostic = new RateLimitDiagnostic(redis, rateLimiter);
    }

    /**
     * Check and fix all stuck rate limits
     * @returns {Promise<Object>} Results of the operation
     */
    async fixAllStuckRateLimits() {
        try {
            const results = {
                checked: 0,
                fixed: 0,
                errors: 0,
                details: []
            };

            if (!this.redis) {
                return {
                    success: false,
                    message: 'Redis not available - cannot scan for stuck rate limits'
                };
            }

            // Get all rate limit keys from Redis
            const pattern = 'sensitive:*';
            const keys = await this.redis.keys(pattern);
            
            for (const key of keys) {
                try {
                    // Parse key to extract operation and userId
                    const parts = key.split(':');
                    if (parts.length >= 3) {
                        const operation = parts[1];
                        const userId = parts[2];
                        
                        results.checked++;
                        
                        // Diagnose this rate limit
                        const diagnostic = await this.diagnostic.diagnoseRateLimit(userId, operation);
                        
                        if (diagnostic.timeUntilReset?.isStuck) {
                            // Fix the stuck rate limit
                            const fixResult = await this.diagnostic.fixStuckRateLimit(userId, operation);
                            
                            if (fixResult.success) {
                                results.fixed++;
                                results.details.push({
                                    userId,
                                    operation,
                                    status: 'FIXED',
                                    message: 'Stuck rate limit reset successfully'
                                });
                                
                                // Log the fix
                                this.monitoring.logInfo('Stuck rate limit fixed', {
                                    userId,
                                    operation,
                                    adminAction: true
                                });
                            } else {
                                results.errors++;
                                results.details.push({
                                    userId,
                                    operation,
                                    status: 'ERROR',
                                    message: fixResult.message
                                });
                            }
                        } else {
                            results.details.push({
                                userId,
                                operation,
                                status: 'OK',
                                message: 'Rate limit working correctly'
                            });
                        }
                    }
                } catch (error) {
                    results.errors++;
                    results.details.push({
                        key,
                        status: 'ERROR',
                        message: error.message
                    });
                }
            }

            return {
                success: true,
                results,
                summary: `Checked ${results.checked} rate limits, fixed ${results.fixed} stuck timers, ${results.errors} errors`
            };

        } catch (error) {
            return {
                success: false,
                message: `Failed to fix stuck rate limits: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Reset rate limit for a specific user and operation
     * @param {string} userId - User's Telegram ID
     * @param {string} operation - Operation type
     * @returns {Promise<Object>} Reset result
     */
    async resetUserRateLimit(userId, operation) {
        try {
            // First diagnose the current state
            const diagnostic = await this.diagnostic.diagnoseRateLimit(userId, operation);
            
            // Reset the rate limit
            const success = await this.rateLimiter.resetRateLimit(userId, operation);
            
            if (success) {
                // Log the admin action
                this.monitoring.logInfo('Admin rate limit reset', {
                    userId,
                    operation,
                    adminAction: true,
                    previousState: diagnostic
                });
            }

            return {
                success,
                message: success ? 'Rate limit reset successfully' : 'Failed to reset rate limit',
                diagnostic
            };

        } catch (error) {
            return {
                success: false,
                message: `Reset failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Get comprehensive rate limit report for a user
     * @param {string} userId - User's Telegram ID
     * @returns {Promise<Object>} Comprehensive report
     */
    async getUserRateLimitReport(userId) {
        try {
            const operations = Object.keys(this.rateLimiter.sensitiveOperations);
            const report = {
                userId,
                timestamp: new Date().toISOString(),
                operations: {}
            };

            for (const operation of operations) {
                try {
                    const diagnostic = await this.diagnostic.diagnoseRateLimit(userId, operation);
                    report.operations[operation] = diagnostic;
                } catch (error) {
                    report.operations[operation] = {
                        error: error.message
                    };
                }
            }

            return {
                success: true,
                report
            };

        } catch (error) {
            return {
                success: false,
                message: `Report generation failed: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Generate admin command for Telegram bot
     * @param {string} command - Admin command
     * @param {Array} args - Command arguments
     * @returns {Promise<string>} Response message
     */
    async handleAdminCommand(command, args = []) {
        try {
            switch (command) {
                case 'fix_stuck':
                    const fixResult = await this.fixAllStuckRateLimits();
                    return fixResult.success ? 
                        `✅ ${fixResult.summary}` : 
                        `❌ ${fixResult.message}`;

                case 'reset_user':
                    if (args.length < 2) {
                        return '❌ Usage: /admin reset_user <userId> <operation>';
                    }
                    const [userId, operation] = args;
                    const resetResult = await this.resetUserRateLimit(userId, operation);
                    return resetResult.success ? 
                        `✅ Rate limit reset for user ${userId}, operation ${operation}` : 
                        `❌ ${resetResult.message}`;

                case 'check_user':
                    if (args.length < 1) {
                        return '❌ Usage: /admin check_user <userId>';
                    }
                    const checkUserId = args[0];
                    const reportResult = await this.getUserRateLimitReport(checkUserId);
                    if (reportResult.success) {
                        let message = `📊 **Rate Limit Report for User ${checkUserId}**\n\n`;
                        for (const [op, data] of Object.entries(reportResult.report.operations)) {
                            if (data.error) {
                                message += `❌ ${op}: Error - ${data.error}\n`;
                            } else {
                                const status = data.analysis?.isBlocked ? '🔒 BLOCKED' : '✅ OK';
                                message += `${status} ${op}: ${data.analysis?.validAttempts}/${data.config?.limit}\n`;
                            }
                        }
                        return message;
                    } else {
                        return `❌ ${reportResult.message}`;
                    }

                default:
                    return `❌ Unknown admin command: ${command}\n\nAvailable commands:\n- fix_stuck: Fix all stuck rate limits\n- reset_user <userId> <operation>: Reset specific rate limit\n- check_user <userId>: Check user's rate limit status`;
            }

        } catch (error) {
            return `❌ Admin command failed: ${error.message}`;
        }
    }
}

module.exports = AdminRateLimitManager;