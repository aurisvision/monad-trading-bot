#!/usr/bin/env node

/**
 * Post-Deployment Script for Coolify
 * This script runs after deployment to ensure everything is working correctly
 */

const { Pool } = require('pg');
const Redis = require('ioredis');

console.log('🚀 Area51 Bot - Post-Deployment Setup');
console.log('=====================================');
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log('=====================================\n');

// Database configuration
const dbConfig = {
    host: process.env.POSTGRES_HOST || 'ggo04s4ogo00kscg8wso4c8k',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL_MODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    query_timeout: 15000,
    application_name: 'area51_bot_post_deployment',
    max: 3,
};

// Redis configuration
const redisConfig = {
    host: process.env.REDIS_HOST || 'dg088sgsw8444kgscg8s448g',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME || 'redis',
    db: parseInt(process.env.REDIS_DB) || 0,
    connectTimeout: 10000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 2,
    lazyConnect: true
};

async function checkDatabase() {
    console.log('🔍 Checking database connection...');
    
    let pool = null;
    let client = null;
    
    try {
        pool = new Pool(dbConfig);
        client = await pool.connect();
        
        // Test basic connection
        const result = await client.query('SELECT NOW() as current_time');
        console.log('✅ Database connection successful');
        
        // Check critical tables and columns
        const checks = [
            {
                name: 'users.encrypted_private_key',
                query: `SELECT column_name FROM information_schema.columns 
                       WHERE table_name = 'users' AND column_name = 'encrypted_private_key'`
            },
            {
                name: 'users.encrypted_mnemonic',
                query: `SELECT column_name FROM information_schema.columns 
                       WHERE table_name = 'users' AND column_name = 'encrypted_mnemonic'`
            },
            {
                name: 'transactions.type',
                query: `SELECT column_name FROM information_schema.columns 
                       WHERE table_name = 'transactions' AND column_name = 'type'`
            },
            {
                name: 'access_codes table',
                query: `SELECT table_name FROM information_schema.tables 
                       WHERE table_name = 'access_codes'`
            },
            {
                name: 'user_access.used_at',
                query: `SELECT column_name FROM information_schema.columns 
                       WHERE table_name = 'user_access' AND column_name = 'used_at'`
            }
        ];
        
        for (const check of checks) {
            const checkResult = await client.query(check.query);
            if (checkResult.rows.length > 0) {
                console.log(`✅ ${check.name}: EXISTS`);
            } else {
                console.log(`❌ ${check.name}: MISSING`);
                throw new Error(`Critical database component missing: ${check.name}`);
            }
        }
        
        console.log('✅ All database checks passed');
        return true;
        
    } catch (error) {
        console.error('❌ Database check failed:', error.message);
        return false;
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
    }
}

async function checkRedis() {
    console.log('🔍 Checking Redis connection...');
    
    let redis = null;
    
    try {
        redis = new Redis(redisConfig);
        await redis.connect();
        
        // Test PING
        const pong = await redis.ping();
        if (pong !== 'PONG') {
            throw new Error('Redis PING failed');
        }
        console.log('✅ Redis PING successful');
        
        // Test SET/GET
        await redis.set('deployment_test', 'success', 'EX', 60);
        const value = await redis.get('deployment_test');
        if (value !== 'success') {
            throw new Error('Redis SET/GET failed');
        }
        console.log('✅ Redis SET/GET successful');
        
        // Clean up
        await redis.del('deployment_test');
        console.log('✅ All Redis checks passed');
        
        return true;
        
    } catch (error) {
        console.error('❌ Redis check failed:', error.message);
        return false;
    } finally {
        if (redis) {
            try { await redis.quit(); } catch {}
        }
    }
}

async function runMigrationIfNeeded() {
    console.log('🔍 Checking if migration is needed...');
    
    let pool = null;
    let client = null;
    
    try {
        pool = new Pool(dbConfig);
        client = await pool.connect();
        
        // Check if migration has been run
        const migrationCheck = await client.query(`
            SELECT metric_value FROM performance_metrics 
            WHERE metric_name = 'complete_migration_executed'
            ORDER BY recorded_at DESC LIMIT 1
        `);
        
        if (migrationCheck.rows.length === 0) {
            console.log('⚠️ Migration not detected, this might cause issues');
            console.log('📝 Consider running the migration manually');
        } else {
            console.log('✅ Migration has been executed');
        }
        
        return true;
        
    } catch (error) {
        console.log('⚠️ Could not check migration status:', error.message);
        return true; // Don't fail deployment for this
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
    }
}

async function logDeploymentSuccess() {
    console.log('📝 Logging deployment success...');
    
    let pool = null;
    let client = null;
    
    try {
        pool = new Pool(dbConfig);
        client = await pool.connect();
        
        await client.query(`
            INSERT INTO performance_metrics (metric_name, metric_value, labels) 
            VALUES ($1, $2, $3)
        `, [
            'deployment_success',
            1,
            JSON.stringify({
                timestamp: new Date().toISOString(),
                version: '2.0',
                environment: 'production',
                platform: 'coolify'
            })
        ]);
        
        console.log('✅ Deployment success logged');
        return true;
        
    } catch (error) {
        console.log('⚠️ Could not log deployment success:', error.message);
        return true; // Don't fail deployment for this
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
    }
}

async function main() {
    let success = true;
    
    try {
        console.log('Starting post-deployment checks...\n');
        
        // Check database
        const dbOK = await checkDatabase();
        if (!dbOK) {
            success = false;
            console.error('💥 Database checks failed - deployment may not work correctly');
        }
        
        console.log(''); // Empty line
        
        // Check Redis
        const redisOK = await checkRedis();
        if (!redisOK) {
            success = false;
            console.error('💥 Redis checks failed - caching will not work');
        }
        
        console.log(''); // Empty line
        
        // Check migration
        await runMigrationIfNeeded();
        
        console.log(''); // Empty line
        
        // Log success
        await logDeploymentSuccess();
        
        console.log('\n' + '='.repeat(50));
        
        if (success) {
            console.log('🎉 POST-DEPLOYMENT CHECKS PASSED!');
            console.log('✅ Database is ready');
            console.log('✅ Redis is ready');
            console.log('✅ Bot should be fully operational');
            console.log('\n🚀 Area51 Bot is ready for production use!');
        } else {
            console.log('⚠️ POST-DEPLOYMENT CHECKS FAILED!');
            console.log('❌ Some components are not working correctly');
            console.log('📋 Check the errors above and fix them');
            console.log('\n🔧 The bot may not work correctly until issues are resolved');
        }
        
        console.log('='.repeat(50));
        
        // Exit with appropriate code
        process.exit(success ? 0 : 1);
        
    } catch (error) {
        console.error('\n💥 Post-deployment script failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection:', reason);
    process.exit(1);
});

// Run the script
main().catch(console.error);
