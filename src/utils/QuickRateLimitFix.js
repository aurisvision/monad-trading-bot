// Quick Rate Limit Fix Script
// This script provides immediate fixes for stuck rate limit timers

const Redis = require('ioredis');

class QuickRateLimitFix {
    constructor(redis) {
        this.redis = redis;
    }

    /**
     * Fix all stuck rate limits in the system
     */
    async fixAllStuckLimits() {
        try {
            console.log('🔍 Scanning for stuck rate limits...');
            
            // Get all rate limit keys
            const keys = await this.redis.keys('rate_limit:*');
            let fixedCount = 0;
            let totalChecked = 0;
            
            for (const key of keys) {
                totalChecked++;
                const data = await this.redis.get(key);
                
                if (!data) continue;
                
                try {
                    const rateLimitData = JSON.parse(data);
                    const now = Date.now();
                    
                    // Check if any attempts are older than 1 hour (3600000 ms)
                    const validAttempts = rateLimitData.attempts.filter(
                        attempt => (now - attempt.timestamp) < 3600000
                    );
                    
                    // If we have fewer valid attempts, update the data
                    if (validAttempts.length < rateLimitData.attempts.length) {
                        rateLimitData.attempts = validAttempts;
                        await this.redis.set(key, JSON.stringify(rateLimitData));
                        fixedCount++;
                        console.log(`✅ Fixed stuck rate limit: ${key}`);
                    }
                    
                } catch (parseError) {
                    console.error(`❌ Error parsing data for key ${key}:`, parseError);
                }
            }
            
            console.log(`\n📊 Fix Summary:`);
            console.log(`   Total keys checked: ${totalChecked}`);
            console.log(`   Fixed stuck limits: ${fixedCount}`);
            
            return {
                totalChecked,
                fixedCount,
                success: true
            };
            
        } catch (error) {
            console.error('❌ Error fixing stuck rate limits:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Reset rate limit for a specific user and operation
     */
    async resetUserRateLimit(userId, operation = 'export_private_key') {
        try {
            const key = `rate_limit:${userId}:${operation}`;
            const deleted = await this.redis.del(key);
            
            if (deleted > 0) {
                console.log(`✅ Reset rate limit for user ${userId}, operation: ${operation}`);
                return { success: true, message: `Rate limit reset for user ${userId}` };
            } else {
                console.log(`ℹ️ No rate limit found for user ${userId}, operation: ${operation}`);
                return { success: true, message: `No rate limit found for user ${userId}` };
            }
            
        } catch (error) {
            console.error(`❌ Error resetting rate limit for user ${userId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get detailed status of a user's rate limit
     */
    async getUserRateLimitStatus(userId, operation = 'export_private_key') {
        try {
            const key = `rate_limit:${userId}:${operation}`;
            const data = await this.redis.get(key);
            
            if (!data) {
                return {
                    exists: false,
                    message: `No rate limit data found for user ${userId}`
                };
            }
            
            const rateLimitData = JSON.parse(data);
            const now = Date.now();
            const windowMs = 3600000; // 1 hour
            
            // Filter valid attempts
            const validAttempts = rateLimitData.attempts.filter(
                attempt => (now - attempt.timestamp) < windowMs
            );
            
            const expiredAttempts = rateLimitData.attempts.filter(
                attempt => (now - attempt.timestamp) >= windowMs
            );
            
            // Calculate reset time
            let resetTime = now;
            if (validAttempts.length > 0) {
                const oldestAttempt = Math.min(...validAttempts.map(a => a.timestamp));
                resetTime = oldestAttempt + windowMs;
            }
            
            const isStuck = resetTime < now && validAttempts.length > 0;
            
            return {
                exists: true,
                userId,
                operation,
                totalAttempts: rateLimitData.attempts.length,
                validAttempts: validAttempts.length,
                expiredAttempts: expiredAttempts.length,
                resetTime: new Date(resetTime).toISOString(),
                isStuck,
                minutesUntilReset: Math.max(0, Math.ceil((resetTime - now) / 60000)),
                rawData: rateLimitData
            };
            
        } catch (error) {
            console.error(`❌ Error getting rate limit status for user ${userId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Emergency fix for a specific user (immediate reset)
     */
    async emergencyUserFix(userId) {
        try {
            const operations = ['export_private_key', 'reveal_mnemonic', 'delete_wallet'];
            const results = [];
            
            for (const operation of operations) {
                const result = await this.resetUserRateLimit(userId, operation);
                results.push({ operation, ...result });
            }
            
            return {
                success: true,
                userId,
                results,
                message: `Emergency fix completed for user ${userId}`
            };
            
        } catch (error) {
            console.error(`❌ Emergency fix failed for user ${userId}:`, error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = QuickRateLimitFix;