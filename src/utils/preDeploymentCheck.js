/**
 * Pre-deployment System Check
 * Comprehensive validation before bot startup
 */

// Load environment variables
require('dotenv').config();

class PreDeploymentCheck {
    constructor(monitoring = null) {
        this.monitoring = monitoring;
        this.checks = [];
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Run all pre-deployment checks
     */
    async runAllChecks() {
        console.log('🔍 Starting pre-deployment system check...\n');
        
        // Environment checks
        await this.checkEnvironmentVariables();
        await this.checkRedisConnection();
        await this.checkDatabaseConnection();
        
        // Code integrity checks
        await this.checkRequiredFiles();
        await this.checkServiceIntegration();
        
        // Performance checks
        await this.checkSystemResources();
        
        return this.generateReport();
    }

    /**
     * Check environment variables
     */
    async checkEnvironmentVariables() {
        console.log('📋 Checking environment variables...');
        
        const requiredVars = [
            'TELEGRAM_BOT_TOKEN',
            'POSTGRES_HOST',
            'POSTGRES_DB_NAME',
            'POSTGRES_USER',
            'POSTGRES_PASSWORD',
            'REDIS_HOST',
            'REDIS_PORT',
            'MONORAIL_APP_ID',
            'MONORAIL_QUOTE_URL',
            'MONORAIL_DATA_URL'
        ];
        
        const missingVars = [];
        const presentVars = [];
        
        requiredVars.forEach(varName => {
            if (!process.env[varName]) {
                missingVars.push(varName);
            } else {
                presentVars.push(varName);
            }
        });
        
        if (missingVars.length > 0) {
            this.errors.push(`Missing environment variables: ${missingVars.join(', ')}`);
            console.log('❌ Missing environment variables:', missingVars);
        } else {
            console.log('✅ All required environment variables present');
        }
        
        // Check Redis configuration
        const redisConfig = {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD || 'not set',
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'area51:'
        };
        
        console.log('🔧 Redis Configuration:', redisConfig);
        
        this.checks.push({
            name: 'Environment Variables',
            status: missingVars.length === 0 ? 'PASS' : 'FAIL',
            details: `${presentVars.length}/${requiredVars.length} variables present`
        });
    }

    /**
     * Check Redis connection
     */
    async checkRedisConnection() {
        console.log('🔴 Testing Redis connection...');
        
        try {
            const Redis = require('redis');
            const testClient = Redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                socket: {
                    connectTimeout: 5000,
                    commandTimeout: 5000
                }
            });
            
            await testClient.connect();
            
            // Test basic operations
            await testClient.set('test:connection', 'ok', { EX: 10 });
            const result = await testClient.get('test:connection');
            await testClient.del('test:connection');
            
            await testClient.disconnect();
            
            if (result === 'ok') {
                console.log('✅ Redis connection successful');
                this.checks.push({
                    name: 'Redis Connection',
                    status: 'PASS',
                    details: 'Connection and basic operations working'
                });
            } else {
                throw new Error('Redis test operation failed');
            }
            
        } catch (error) {
            console.log('❌ Redis connection failed:', error.message);
            this.errors.push(`Redis connection failed: ${error.message}`);
            this.checks.push({
                name: 'Redis Connection',
                status: 'FAIL',
                details: error.message
            });
        }
    }

    /**
     * Check database connection
     */
    async checkDatabaseConnection() {
        console.log('🗄️ Testing PostgreSQL connection...');
        
        try {
            const { Pool } = require('pg');
            const pool = new Pool({
                host: process.env.POSTGRES_HOST,
                port: process.env.POSTGRES_PORT || 5432,
                database: process.env.POSTGRES_DB_NAME,
                user: process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
                max: 1,
                connectionTimeoutMillis: 5000
            });
            
            const client = await pool.connect();
            const result = await client.query('SELECT NOW()');
            client.release();
            await pool.end();
            
            console.log('✅ PostgreSQL connection successful');
            this.checks.push({
                name: 'PostgreSQL Connection',
                status: 'PASS',
                details: 'Database connection working'
            });
            
        } catch (error) {
            console.log('❌ PostgreSQL connection failed:', error.message);
            this.errors.push(`PostgreSQL connection failed: ${error.message}`);
            this.checks.push({
                name: 'PostgreSQL Connection',
                status: 'FAIL',
                details: error.message
            });
        }
    }

    /**
     * Check required files exist
     */
    async checkRequiredFiles() {
        console.log('📁 Checking required files...');
        
        const fs = require('fs').promises;
        const path = require('path');
        
        const requiredFiles = [
            'src/index-modular-simple.js',
            'src/services/CacheService.js',
            'src/services/RedisMetrics.js',
            'src/services/RedisFallbackManager.js',
            'src/services/BackgroundRefreshService.js',
            'src/handlers/tradingHandlers.js',
            'src/handlers/navigationHandlers.js',
            'src/handlers/walletHandlers.js',
            'src/handlers/portfolioHandlers.js'
        ];
        
        const missingFiles = [];
        const presentFiles = [];
        
        for (const file of requiredFiles) {
            try {
                await fs.access(path.join(process.cwd(), file));
                presentFiles.push(file);
            } catch (error) {
                missingFiles.push(file);
            }
        }
        
        if (missingFiles.length > 0) {
            console.log('❌ Missing files:', missingFiles);
            this.errors.push(`Missing files: ${missingFiles.join(', ')}`);
        } else {
            console.log('✅ All required files present');
        }
        
        this.checks.push({
            name: 'Required Files',
            status: missingFiles.length === 0 ? 'PASS' : 'FAIL',
            details: `${presentFiles.length}/${requiredFiles.length} files present`
        });
    }

    /**
     * Check service integration
     */
    async checkServiceIntegration() {
        console.log('🔧 Checking service integration...');
        
        try {
            // Test service imports
            const CacheService = require('../services/CacheService');
            const RedisMetrics = require('../services/RedisMetrics');
            const RedisFallbackManager = require('../services/RedisFallbackManager');
            const BackgroundRefreshService = require('../services/BackgroundRefreshService');
            
            // Test service instantiation (without actual connections)
            const mockRedis = { on: () => {}, status: 'ready' };
            const mockMonitoring = { logInfo: () => {}, logError: () => {} };
            
            const cacheService = new CacheService(mockRedis, mockMonitoring);
            const redisMetrics = new RedisMetrics(mockMonitoring);
            const fallbackManager = new RedisFallbackManager(mockRedis, mockMonitoring);
            
            console.log('✅ Service integration successful');
            this.checks.push({
                name: 'Service Integration',
                status: 'PASS',
                details: 'All services can be instantiated'
            });
            
        } catch (error) {
            console.log('❌ Service integration failed:', error.message);
            this.errors.push(`Service integration failed: ${error.message}`);
            this.checks.push({
                name: 'Service Integration',
                status: 'FAIL',
                details: error.message
            });
        }
    }

    /**
     * Check system resources
     */
    async checkSystemResources() {
        console.log('💻 Checking system resources...');
        
        try {
            const os = require('os');
            
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            const usedMemory = totalMemory - freeMemory;
            const memoryUsagePercent = (usedMemory / totalMemory) * 100;
            
            const cpuCount = os.cpus().length;
            const loadAverage = os.loadavg();
            
            console.log(`💾 Memory: ${(usedMemory / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB (${memoryUsagePercent.toFixed(1)}%)`);
            console.log(`🖥️ CPU: ${cpuCount} cores, Load: ${loadAverage[0].toFixed(2)}`);
            
            if (memoryUsagePercent > 90) {
                this.warnings.push('High memory usage detected');
            }
            
            if (loadAverage[0] > cpuCount) {
                this.warnings.push('High CPU load detected');
            }
            
            this.checks.push({
                name: 'System Resources',
                status: 'PASS',
                details: `Memory: ${memoryUsagePercent.toFixed(1)}%, CPU Load: ${loadAverage[0].toFixed(2)}`
            });
            
        } catch (error) {
            console.log('❌ System resource check failed:', error.message);
            this.warnings.push(`System resource check failed: ${error.message}`);
        }
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 PRE-DEPLOYMENT CHECK REPORT');
        console.log('='.repeat(60));
        
        // Summary
        const passedChecks = this.checks.filter(c => c.status === 'PASS').length;
        const totalChecks = this.checks.length;
        const successRate = ((passedChecks / totalChecks) * 100).toFixed(1);
        
        console.log(`\n📈 SUMMARY: ${passedChecks}/${totalChecks} checks passed (${successRate}%)`);
        
        // Detailed results
        console.log('\n📋 DETAILED RESULTS:');
        this.checks.forEach(check => {
            const status = check.status === 'PASS' ? '✅' : '❌';
            console.log(`${status} ${check.name}: ${check.details}`);
        });
        
        // Errors
        if (this.errors.length > 0) {
            console.log('\n🚨 ERRORS:');
            this.errors.forEach(error => console.log(`❌ ${error}`));
        }
        
        // Warnings
        if (this.warnings.length > 0) {
            console.log('\n⚠️ WARNINGS:');
            this.warnings.forEach(warning => console.log(`⚠️ ${warning}`));
        }
        
        // Deployment recommendation
        console.log('\n🚀 DEPLOYMENT RECOMMENDATION:');
        if (this.errors.length === 0) {
            console.log('✅ READY FOR DEPLOYMENT - All critical checks passed');
            if (this.warnings.length > 0) {
                console.log('⚠️ Monitor warnings during operation');
            }
        } else {
            console.log('❌ NOT READY FOR DEPLOYMENT - Fix errors first');
        }
        
        console.log('='.repeat(60) + '\n');
        
        return {
            ready: this.errors.length === 0,
            successRate: parseFloat(successRate),
            checks: this.checks,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}

module.exports = PreDeploymentCheck;

// Run check if called directly
if (require.main === module) {
    const check = new PreDeploymentCheck();
    check.runAllChecks().then(result => {
        if (result.ready) {
            console.log('✅ System is ready for deployment!');
            process.exit(0);
        } else {
            console.log('❌ System needs fixes before deployment');
            process.exit(1);
        }
    }).catch(error => {
        console.error('❌ Pre-deployment check failed:', error);
        process.exit(1);
    });
}
