#!/usr/bin/env node

/**
 * Redis Connection Check and Fix Script
 * This script diagnoses and fixes Redis connection issues in production
 */

const Redis = require('ioredis');

// Configuration from environment variables
const config = {
    host: process.env.REDIS_HOST || 'dg088sgsw8444kgscg8s448g',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || 'T3KStVXQ7XGM695bKkr0lP7X9Dmh55farbY7ehwO1qjYVj8SHKUj1D6g0UJ5eSrx',
    username: process.env.REDIS_USERNAME || 'redis',
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'area51:',
    connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true
};

console.log('🔍 Redis Connection Diagnostic Tool');
console.log('=====================================');
console.log(`Host: ${config.host}`);
console.log(`Port: ${config.port}`);
console.log(`Database: ${config.db}`);
console.log(`Username: ${config.username}`);
console.log(`Key Prefix: ${config.keyPrefix}`);
console.log('=====================================\n');

async function testRedisConnection() {
    let redis = null;
    
    try {
        console.log('🔄 Creating Redis connection...');
        
        // Create Redis instance with comprehensive configuration
        redis = new Redis({
            host: config.host,
            port: config.port,
            password: config.password,
            username: config.username,
            db: config.db,
            keyPrefix: config.keyPrefix,
            connectTimeout: config.connectTimeout,
            commandTimeout: config.commandTimeout,
            maxRetriesPerRequest: config.maxRetriesPerRequest,
            retryDelayOnFailover: config.retryDelayOnFailover,
            enableReadyCheck: true,
            lazyConnect: true,
            // Additional options for production
            keepAlive: 30000,
            family: 4, // Force IPv4
            // Retry strategy
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                console.log(`⏳ Retry attempt ${times}, delay: ${delay}ms`);
                return delay;
            },
            // Reconnect on error
            reconnectOnError: (err) => {
                console.log('🔄 Reconnecting on error:', err.message);
                return true;
            }
        });

        // Set up event listeners
        redis.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        redis.on('ready', () => {
            console.log('✅ Redis ready for commands');
        });

        redis.on('error', (err) => {
            console.error('❌ Redis error:', err.message);
        });

        redis.on('close', () => {
            console.log('⚠️ Redis connection closed');
        });

        redis.on('reconnecting', () => {
            console.log('🔄 Redis reconnecting...');
        });

        // Test connection
        console.log('🔄 Testing connection...');
        await redis.connect();
        
        console.log('🔄 Testing PING command...');
        const pong = await redis.ping();
        console.log('✅ PING response:', pong);

        // Test basic operations
        console.log('🔄 Testing SET command...');
        await redis.set('test_key', 'test_value', 'EX', 60);
        console.log('✅ SET command successful');

        console.log('🔄 Testing GET command...');
        const value = await redis.get('test_key');
        console.log('✅ GET command successful, value:', value);

        // Test with prefix
        console.log('🔄 Testing with key prefix...');
        await redis.set('prefixed_test', 'prefix_value', 'EX', 60);
        const prefixedValue = await redis.get('prefixed_test');
        console.log('✅ Prefixed key test successful, value:', prefixedValue);

        // Test Redis info
        console.log('🔄 Getting Redis info...');
        const info = await redis.info('server');
        const lines = info.split('\r\n');
        const serverInfo = {};
        lines.forEach(line => {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                serverInfo[key] = value;
            }
        });
        
        console.log('📊 Redis Server Info:');
        console.log(`   Version: ${serverInfo.redis_version || 'Unknown'}`);
        console.log(`   Mode: ${serverInfo.redis_mode || 'Unknown'}`);
        console.log(`   OS: ${serverInfo.os || 'Unknown'}`);
        console.log(`   Uptime: ${serverInfo.uptime_in_seconds || 'Unknown'} seconds`);

        // Test memory info
        const memoryInfo = await redis.info('memory');
        const memLines = memoryInfo.split('\r\n');
        const memInfo = {};
        memLines.forEach(line => {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                memInfo[key] = value;
            }
        });
        
        console.log('💾 Redis Memory Info:');
        console.log(`   Used Memory: ${memInfo.used_memory_human || 'Unknown'}`);
        console.log(`   Max Memory: ${memInfo.maxmemory_human || 'No limit'}`);

        // Clean up test keys
        console.log('🔄 Cleaning up test keys...');
        await redis.del('test_key', 'prefixed_test');
        console.log('✅ Test keys cleaned up');

        console.log('\n🎉 All Redis tests passed successfully!');
        console.log('✅ Redis is working correctly in production environment');
        
        return true;

    } catch (error) {
        console.error('\n❌ Redis connection test failed:');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        // Provide troubleshooting suggestions
        console.log('\n🔧 Troubleshooting suggestions:');
        console.log('1. Check if Redis container is running');
        console.log('2. Verify network connectivity between containers');
        console.log('3. Check Redis password and username');
        console.log('4. Verify Redis host name resolution');
        console.log('5. Check if Redis is accepting connections on port 6379');
        
        return false;
        
    } finally {
        if (redis) {
            console.log('🔄 Closing Redis connection...');
            await redis.quit();
            console.log('✅ Redis connection closed');
        }
    }
}

// Test different connection configurations
async function testAlternativeConfigs() {
    console.log('\n🔄 Testing alternative Redis configurations...');
    
    const alternatives = [
        // Without username
        {
            ...config,
            username: undefined,
            description: 'Without username'
        },
        // Without key prefix
        {
            ...config,
            keyPrefix: '',
            description: 'Without key prefix'
        },
        // With different timeout settings
        {
            ...config,
            connectTimeout: 10000,
            commandTimeout: 10000,
            description: 'Extended timeouts'
        },
        // Minimal configuration
        {
            host: config.host,
            port: config.port,
            password: config.password,
            db: config.db,
            description: 'Minimal configuration'
        }
    ];

    for (const altConfig of alternatives) {
        console.log(`\n🔄 Testing: ${altConfig.description}`);
        
        let redis = null;
        try {
            redis = new Redis(altConfig);
            await redis.connect();
            const pong = await redis.ping();
            console.log(`✅ ${altConfig.description}: SUCCESS (${pong})`);
            await redis.quit();
        } catch (error) {
            console.log(`❌ ${altConfig.description}: FAILED (${error.message})`);
            if (redis) {
                try { await redis.quit(); } catch {}
            }
        }
    }
}

// Main execution
async function main() {
    console.log('Starting Redis diagnostic...\n');
    
    const success = await testRedisConnection();
    
    if (!success) {
        await testAlternativeConfigs();
    }
    
    console.log('\n🏁 Redis diagnostic completed');
    process.exit(success ? 0 : 1);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the diagnostic
main().catch(console.error);
