#!/usr/bin/env node

/**
 * Emergency Redis Connection Fix
 * Fixes Redis connection issues in production
 */

const Redis = require('redis');

console.log('🔧 Emergency Redis Connection Fix');
console.log('==================================\n');

async function testRedisConnection() {
    console.log('🔍 Testing Redis connection...');
    
    const redisConfig = {
        host: process.env.REDIS_HOST || 'dg088sgsw8444kgscg8s448g',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        username: process.env.REDIS_USERNAME || 'redis',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000
    };
    
    console.log('Redis Configuration:');
    console.log(`Host: ${redisConfig.host}`);
    console.log(`Port: ${redisConfig.port}`);
    console.log(`Username: ${redisConfig.username}`);
    console.log(`Password: ${redisConfig.password ? '[SET]' : '[NOT SET]'}`);
    console.log('');
    
    let client = null;
    
    try {
        // Test basic connection
        console.log('🔄 Creating Redis client...');
        client = Redis.createClient(redisConfig);
        
        client.on('error', (err) => {
            console.log('❌ Redis Client Error:', err.message);
        });
        
        client.on('connect', () => {
            console.log('✅ Redis client connected');
        });
        
        client.on('ready', () => {
            console.log('✅ Redis client ready');
        });
        
        console.log('🔄 Connecting to Redis...');
        await client.connect();
        
        console.log('🔄 Testing PING command...');
        const pong = await client.ping();
        console.log(`✅ PING response: ${pong}`);
        
        console.log('🔄 Testing SET/GET commands...');
        await client.set('test_key', 'test_value', { EX: 10 });
        const value = await client.get('test_key');
        console.log(`✅ SET/GET test: ${value}`);
        
        console.log('🔄 Testing Redis INFO...');
        const info = await client.info('server');
        const lines = info.split('\r\n').filter(line => line.includes('redis_version'));
        if (lines.length > 0) {
            console.log(`✅ Redis version: ${lines[0]}`);
        }
        
        console.log('\n🎉 Redis connection is working perfectly!');
        
    } catch (error) {
        console.log('\n❌ Redis connection failed:');
        console.log(`Error: ${error.message}`);
        console.log('\n🔧 Troubleshooting steps:');
        console.log('1. Check if Redis container is running:');
        console.log('   docker ps | grep redis');
        console.log('2. Check Redis logs:');
        console.log(`   docker logs ${redisConfig.host}`);
        console.log('3. Test direct connection:');
        console.log(`   docker exec -it ${redisConfig.host} redis-cli ping`);
        console.log('4. Check network connectivity between containers');
        
        return false;
    } finally {
        if (client) {
            try {
                await client.quit();
                console.log('✅ Redis connection closed');
            } catch (err) {
                console.log('⚠️ Error closing Redis connection:', err.message);
            }
        }
    }
    
    return true;
}

async function fixRedisEnvironment() {
    console.log('\n🔧 Checking Redis environment variables...');
    
    const requiredVars = [
        'REDIS_HOST',
        'REDIS_PASSWORD',
        'REDIS_USERNAME'
    ];
    
    let allSet = true;
    
    for (const varName of requiredVars) {
        const value = process.env[varName];
        if (value) {
            console.log(`✅ ${varName}: ${varName.includes('PASSWORD') ? '[SET]' : value}`);
        } else {
            console.log(`❌ ${varName}: NOT SET`);
            allSet = false;
        }
    }
    
    if (!allSet) {
        console.log('\n⚠️ Missing Redis environment variables!');
        console.log('Add these to your environment:');
        console.log('REDIS_HOST=dg088sgsw8444kgscg8s448g');
        console.log('REDIS_PASSWORD=your_redis_password');
        console.log('REDIS_USERNAME=redis');
    }
    
    return allSet;
}

async function main() {
    console.log('Starting Redis diagnostic and fix...\n');
    
    // Check environment
    const envOk = await fixRedisEnvironment();
    
    if (!envOk) {
        console.log('\n❌ Environment variables not properly set');
        process.exit(1);
    }
    
    // Test connection
    const connectionOk = await testRedisConnection();
    
    if (connectionOk) {
        console.log('\n🎉 Redis is working correctly!');
        console.log('✅ Connection successful');
        console.log('✅ Commands working');
        console.log('✅ Ready for production use');
    } else {
        console.log('\n❌ Redis connection issues detected');
        console.log('🔧 Follow the troubleshooting steps above');
        process.exit(1);
    }
}

// Run the fix
main().catch(console.error);
