#!/usr/bin/env node

// Emergency Rate Limit Fix Script
require('dotenv').config();
const Redis = require('ioredis');

async function fixStuckRateLimits() {
    console.log('🚨 Emergency Rate Limit Fix Script');
    console.log('===================================\n');
    
    // Load Redis config from .env
    const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        db: parseInt(process.env.REDIS_DB) || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        lazyConnect: true
    };
    
    // Add password only if it exists and is not empty
    if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim() !== '') {
        redisConfig.password = process.env.REDIS_PASSWORD;
    }
    
    console.log(`🔗 Connecting to Redis at ${redisConfig.host}:${redisConfig.port}...`);
    const redis = new Redis(redisConfig);
    
    try {
        await redis.ping();
        console.log('✅ Connected to Redis\n');
        
        // Get all rate limit keys
        const keys = await redis.keys('rate_limit:*');
        let fixedCount = 0;
        
        console.log(`�� Found ${keys.length} rate limit keys to check...\n`);
        
        for (const key of keys) {
            const data = await redis.get(key);
            if (!data) continue;
            
            try {
                const rateLimitData = JSON.parse(data);
                const now = Date.now();
                const windowMs = 3600000; // 1 hour
                
                // Filter out expired attempts
                const validAttempts = rateLimitData.attempts.filter(
                    attempt => (now - attempt.timestamp) < windowMs
                );
                
                // If we removed expired attempts, update the data
                if (validAttempts.length < rateLimitData.attempts.length) {
                    rateLimitData.attempts = validAttempts;
                    await redis.set(key, JSON.stringify(rateLimitData));
                    fixedCount++;
                    console.log(`✅ Fixed: ${key}`);
                }
                
            } catch (parseError) {
                console.error(`❌ Error parsing ${key}:`, parseError.message);
            }
        }
        
        console.log(`\n📊 Summary: Fixed ${fixedCount} stuck rate limits`);
        
        // Also fix the core bug in AdvancedRateLimiter.js
        console.log('\n🔧 The main bug has been fixed in AdvancedRateLimiter.js');
        console.log('   Changed Math.min to Math.max in resetTime calculation');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        redis.disconnect();
        console.log('🔌 Disconnected from Redis');
    }
}

// Run if called directly
if (require.main === module) {
    fixStuckRateLimits().catch(console.error);
}

module.exports = { fixStuckRateLimits };
