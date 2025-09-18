/**
 * Comprehensive Test Suite for Unified Cache System
 * Tests all cache operations, invalidation, and performance metrics
 */

const Redis = require('ioredis');
const UnifiedCacheManager = require('../services/UnifiedCacheManager');
const CacheConfig = require('../config/CacheConfig');

class UnifiedCacheTest {
    constructor() {
        this.redis = null;
        this.cacheManager = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            errors: []
        };
    }
    
    /**
     * Initialize test environment
     */
    async initialize() {
        try {
            // Connect to Redis
            this.redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3
            });
            
            // Initialize cache system
            this.cacheManager = new UnifiedCacheManager(this.redis, null, 'testing');
            
            console.log('✅ Test environment initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize test environment:', error);
            return false;
        }
    }
    
    /**
     * Run all tests
     */
    async runAllTests() {
        console.log('🚀 Starting Unified Cache System Tests\n');
        
        if (!(await this.initialize())) {
            return false;
        }
        
        // Clear any existing test data
        await this.redis.flushdb();
        
        // Run test suites
        await this.testCacheConfig();
        await this.testBasicCacheOperations();
        await this.testCacheInvalidation();
        await this.testGetOrSetFunctionality();
        await this.testPerformanceMetrics();
        await this.testErrorHandling();
        await this.testConcurrentOperations();
        
        // Print results
        this.printTestResults();
        
        // Cleanup
        await this.cleanup();
        
        return this.testResults.failed === 0;
    }
    
    /**
     * Test cache configuration
     */
    async testCacheConfig() {
        console.log('📋 Testing Cache Configuration...');
        
        try {
            const config = new CacheConfig('testing');
            
            // Test configuration validation
            const validation = config.validate();
            this.assert(validation.isValid, 'Cache configuration should be valid');
            
            // Test cache type retrieval
            const userDataConfig = config.getCacheConfig('user_data');
            this.assert(userDataConfig !== null, 'Should retrieve user_data config');
            this.assert(userDataConfig.ttl === null, 'user_data should have no TTL');
            
            const portfolioConfig = config.getCacheConfig('portfolio');
            this.assert(portfolioConfig !== null, 'Should retrieve portfolio config');
            this.assert(portfolioConfig.ttl === 10, 'Portfolio TTL should be 10 seconds in testing');
            
            // Test key generation
            const key = config.generateKey('user_data', '12345');
            this.assert(key === 'area51:user:12345', 'Should generate correct cache key');
            
            // Test invalidation rules
            const buyRules = config.getInvalidationRules('buy_operation');
            this.assert(buyRules.includes('mon_balance'), 'Buy operation should invalidate mon_balance');
            this.assert(buyRules.includes('portfolio'), 'Buy operation should invalidate portfolio');
            
            console.log('✅ Cache configuration tests passed\n');
        } catch (error) {
            this.recordError('Cache configuration test failed', error);
        }
    }
    
    /**
     * Test basic cache operations
     */
    async testBasicCacheOperations() {
        console.log('🔧 Testing Basic Cache Operations...');
        
        try {
            const testData = { name: 'Test User', balance: 100.5 };
            const userId = 'test_user_123';
            
            // Test set operation
            const setResult = await this.cacheManager.set('user_data', userId, testData);
            this.assert(setResult === true, 'Cache set should succeed');
            
            // Test get operation (should hit cache)
            const cachedData = await this.cacheManager.get('user_data', userId);
            this.assert(cachedData !== null, 'Should retrieve cached data');
            this.assert(cachedData.name === testData.name, 'Cached data should match original');
            this.assert(cachedData.balance === testData.balance, 'Cached balance should match');
            
            // Test cache miss
            const missData = await this.cacheManager.get('user_data', 'nonexistent_user');
            this.assert(missData === null, 'Should return null for cache miss');
            
            // Test delete operation
            const deleteResult = await this.cacheManager.delete('user_data', userId);
            this.assert(deleteResult === true, 'Cache delete should succeed');
            
            // Verify deletion
            const deletedData = await this.cacheManager.get('user_data', userId);
            this.assert(deletedData === null, 'Data should be null after deletion');
            
            console.log('✅ Basic cache operations tests passed\n');
        } catch (error) {
            this.recordError('Basic cache operations test failed', error);
        }
    }
    
    /**
     * Test cache invalidation after operations
     */
    async testCacheInvalidation() {
        console.log('🧹 Testing Cache Invalidation...');
        
        try {
            const userId = 'test_user_456';
            const walletAddress = '0x1234567890123456789012345678901234567890';
            
            // Set up test data
            await this.cacheManager.set('user_data', userId, { name: 'Test User' });
            await this.cacheManager.set('mon_balance', walletAddress, 50.0);
            await this.cacheManager.set('portfolio', userId, { tokens: [] });
            await this.cacheManager.set('main_menu', userId, { balance: 50.0 });
            
            // Verify data exists
            this.assert(await this.cacheManager.get('user_data', userId) !== null, 'User data should exist');
            this.assert(await this.cacheManager.get('mon_balance', walletAddress) !== null, 'Balance should exist');
            this.assert(await this.cacheManager.get('portfolio', userId) !== null, 'Portfolio should exist');
            this.assert(await this.cacheManager.get('main_menu', userId) !== null, 'Main menu should exist');
            
            // Test buy operation invalidation
            await this.cacheManager.invalidateAfterOperation('buy_operation', userId, walletAddress);
            
            // Verify correct data was invalidated
            this.assert(await this.cacheManager.get('user_data', userId) !== null, 'User data should persist (permanent)');
            this.assert(await this.cacheManager.get('mon_balance', walletAddress) === null, 'Balance should be invalidated');
            this.assert(await this.cacheManager.get('portfolio', userId) === null, 'Portfolio should be invalidated');
            this.assert(await this.cacheManager.get('main_menu', userId) === null, 'Main menu should be invalidated');
            
            // Test transfer operation invalidation
            await this.cacheManager.set('mon_balance', walletAddress, 45.0);
            await this.cacheManager.set('main_menu', userId, { balance: 45.0 });
            
            await this.cacheManager.invalidateAfterOperation('transfer', userId, walletAddress);
            
            this.assert(await this.cacheManager.get('mon_balance', walletAddress) === null, 'Balance should be invalidated after transfer');
            this.assert(await this.cacheManager.get('main_menu', userId) === null, 'Main menu should be invalidated after transfer');
            
            console.log('✅ Cache invalidation tests passed\n');
        } catch (error) {
            this.recordError('Cache invalidation test failed', error);
        }
    }
    
    /**
     * Test getOrSet functionality
     */
    async testGetOrSetFunctionality() {
        console.log('🔄 Testing GetOrSet Functionality...');
        
        try {
            const userId = 'getorset_test_789';
            const testData = { fetched: true, value: 123 };
            
            // Test getOrSet functionality
            const fetchFunction = async () => {
                console.log('Fetch function called for getOrSet test');
                return testData;
            };
            
            // First call should execute fetch function
            const data1 = await this.cacheManager.getOrSet('user_data', userId, fetchFunction);
            this.assert(data1.fetched === true, 'Should return data from fetch function');
            this.assert(data1.value === 123, 'Should return correct value');
            
            // Second call should hit cache
            const data2 = await this.cacheManager.getOrSet('user_data', userId, fetchFunction);
            this.assert(data2.fetched === true, 'Should return cached data');
            this.assert(data2.value === 123, 'Cached data should match');
            
            // Test health check
            const health = await this.cacheManager.healthCheck();
            this.assert(health === true, 'Cache should be healthy');
            
            console.log('✅ GetOrSet functionality tests passed\n');
        } catch (error) {
            this.recordError('GetOrSet functionality test failed', error);
        }
    }
    
    /**
     * Test performance metrics
     */
    async testPerformanceMetrics() {
        console.log('📊 Testing Performance Metrics...');
        
        try {
            // Reset metrics
            this.cacheManager.metrics = {
                hits: 0,
                misses: 0,
                errors: 0,
                totalRequests: 0,
                avgResponseTime: 0,
                operations: { get: 0, set: 0, delete: 0, invalidate: 0 }
            };
            
            const userId = 'metrics_test_999';
            const testData = { metrics: 'test' };
            
            // Perform operations to generate metrics
            await this.cacheManager.set('user_data', userId, testData); // Should increment set operations
            await this.cacheManager.get('user_data', userId); // Should increment hits
            await this.cacheManager.get('user_data', 'nonexistent'); // Should increment misses
            await this.cacheManager.delete('user_data', userId); // Should increment delete operations
            
            const metrics = this.cacheManager.getMetrics();
            
            this.assert(metrics.operations.set >= 1, 'Should record set operations');
            this.assert(metrics.operations.get >= 2, 'Should record get operations');
            this.assert(metrics.operations.delete >= 1, 'Should record delete operations');
            this.assert(metrics.hits >= 1, 'Should record cache hits');
            this.assert(metrics.misses >= 1, 'Should record cache misses');
            this.assert(metrics.totalRequests >= 2, 'Should record total requests');
            this.assert(typeof metrics.hitRate === 'number', 'Should calculate hit rate');
            
            console.log('✅ Performance metrics tests passed\n');
        } catch (error) {
            this.recordError('Performance metrics test failed', error);
        }
    }
    
    /**
     * Test error handling
     */
    async testErrorHandling() {
        console.log('⚠️ Testing Error Handling...');
        
        try {
            // Test invalid cache type
            const invalidResult = await this.cacheManager.get('invalid_type', 'test');
            this.assert(invalidResult === null, 'Should handle invalid cache type gracefully');
            
            // Test with null data
            const nullSetResult = await this.cacheManager.set('user_data', 'test', null);
            this.assert(nullSetResult === true, 'Should handle null data');
            
            const nullGetResult = await this.cacheManager.get('user_data', 'test');
            this.assert(nullGetResult === null, 'Should return null for null data');
            
            console.log('✅ Error handling tests passed\n');
        } catch (error) {
            this.recordError('Error handling test failed', error);
        }
    }
    
    /**
     * Test concurrent operations
     */
    async testConcurrentOperations() {
        console.log('⚡ Testing Concurrent Operations...');
        
        try {
            const userId = 'concurrent_test';
            const promises = [];
            
            // Perform multiple concurrent operations
            for (let i = 0; i < 10; i++) {
                promises.push(this.cacheManager.set('user_data', `${userId}_${i}`, { id: i }));
            }
            
            const results = await Promise.all(promises);
            this.assert(results.every(r => r === true), 'All concurrent set operations should succeed');
            
            // Test concurrent gets
            const getPromises = [];
            for (let i = 0; i < 10; i++) {
                getPromises.push(this.cacheManager.get('user_data', `${userId}_${i}`));
            }
            
            const getResults = await Promise.all(getPromises);
            this.assert(getResults.every(r => r !== null), 'All concurrent get operations should succeed');
            
            console.log('✅ Concurrent operations tests passed\n');
        } catch (error) {
            this.recordError('Concurrent operations test failed', error);
        }
    }
    
    /**
     * Assert helper function
     */
    assert(condition, message) {
        if (condition) {
            this.testResults.passed++;
            console.log(`  ✅ ${message}`);
        } else {
            this.testResults.failed++;
            console.log(`  ❌ ${message}`);
            this.testResults.errors.push(message);
        }
    }
    
    /**
     * Record error helper function
     */
    recordError(message, error) {
        this.testResults.failed++;
        const errorMsg = `${message}: ${error.message}`;
        console.log(`  ❌ ${errorMsg}`);
        this.testResults.errors.push(errorMsg);
    }
    
    /**
     * Print test results
     */
    printTestResults() {
        console.log('\n📊 TEST RESULTS SUMMARY');
        console.log('========================');
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📈 Success Rate: ${((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1)}%`);
        
        if (this.testResults.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            this.testResults.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error}`);
            });
        }
        
        if (this.testResults.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED! Cache system is ready for production.');
        } else {
            console.log('\n⚠️ Some tests failed. Please review and fix issues before deployment.');
        }
    }
    
    /**
     * Cleanup test environment
     */
    async cleanup() {
        try {
            if (this.redis) {
                await this.redis.flushdb();
                await this.redis.disconnect();
            }
            console.log('\n🧹 Test environment cleaned up');
        } catch (error) {
            console.error('❌ Cleanup failed:', error);
        }
    }
}

// Export for use in other test files
module.exports = UnifiedCacheTest;

// Run tests if called directly
if (require.main === module) {
    const test = new UnifiedCacheTest();
    test.runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });
}
