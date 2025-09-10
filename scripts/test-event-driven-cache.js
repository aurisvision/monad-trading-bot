// Test script for Event-driven Caching implementation
const Database = require('../src/database-postgresql');

class EventDrivenCacheTest {
    constructor() {
        this.database = new Database();
        this.testResults = {
            staticCacheTests: [],
            dynamicCacheTests: [],
            performanceTests: []
        };
    }

    async initialize() {
        console.log('🚀 Initializing Event-driven Cache Test...');
        await this.database.initialize();
        console.log('✅ Database initialized');
    }

    // Test static cache (User & Settings) - should not expire
    async testStaticCache() {
        console.log('\n📊 Testing Static Cache (Event-driven)...');
        
        const testUserId = 999999;
        const testWallet = '0x1234567890123456789012345678901234567890';
        
        // Test 1: Create user and check cache persistence
        console.log('Test 1: User data caching without TTL');
        await this.database.createUser(testUserId, testWallet, 'encrypted_key', 'encrypted_mnemonic', 'test_user');
        
        // Wait 2 seconds and check if cache still exists
        await new Promise(resolve => setTimeout(resolve, 2000));
        const cachedUser = await this.database.getFromCache(`user:${testUserId}`);
        
        this.testResults.staticCacheTests.push({
            test: 'User cache persistence',
            passed: cachedUser !== null,
            details: cachedUser ? 'Cache persisted after 2 seconds' : 'Cache expired unexpectedly'
        });

        // Test 2: Update wallet and check cache invalidation
        console.log('Test 2: Cache invalidation on wallet update');
        const newWallet = '0x9876543210987654321098765432109876543210';
        await this.database.updateUserWallet(testUserId, newWallet, 'new_encrypted_key', 'new_encrypted_mnemonic');
        
        const updatedUser = await this.database.getUser(testUserId);
        const cacheHit = updatedUser.wallet_address === newWallet;
        
        this.testResults.staticCacheTests.push({
            test: 'Cache update on wallet change',
            passed: cacheHit,
            details: cacheHit ? 'Cache updated correctly' : 'Cache not updated properly'
        });

        // Test 3: Settings cache behavior
        console.log('Test 3: Settings cache without TTL');
        const settingsUpdate = { buy_slippage: 3.0, sell_slippage: 4.0 };
        await this.database.updateUserSettings(testUserId, settingsUpdate);
        
        // Wait 2 seconds and check cache
        await new Promise(resolve => setTimeout(resolve, 2000));
        const cachedSettings = await this.database.getFromCache(`settings:${testUserId}`);
        
        this.testResults.staticCacheTests.push({
            test: 'Settings cache persistence',
            passed: cachedSettings !== null && cachedSettings.buy_slippage === 3.0,
            details: cachedSettings ? 'Settings cache persisted correctly' : 'Settings cache expired unexpectedly'
        });
    }

    // Test dynamic cache (Portfolio & Transactions) - should expire with TTL
    async testDynamicCache() {
        console.log('\n📊 Testing Dynamic Cache (TTL-based)...');
        
        const testUserId = 999998;
        
        // Test portfolio cache with TTL
        const portfolioData = [
            { token_address: '0xtest1', current_balance: 100 },
            { token_address: '0xtest2', current_balance: 200 }
        ];
        
        await this.database.setCache(`portfolio:${testUserId}`, portfolioData);
        
        // Check immediate cache hit
        const immediateCacheHit = await this.database.getFromCache(`portfolio:${testUserId}`);
        
        this.testResults.dynamicCacheTests.push({
            test: 'Portfolio cache immediate hit',
            passed: immediateCacheHit !== null,
            details: immediateCacheHit ? 'Portfolio cached successfully' : 'Portfolio cache failed'
        });

        // Test transactions cache with TTL
        const transactionData = [
            { tx_hash: '0xtest123', amount: 50, type: 'buy' }
        ];
        
        await this.database.setCache(`transactions:${testUserId}:10:0`, transactionData);
        const txCacheHit = await this.database.getFromCache(`transactions:${testUserId}:10:0`);
        
        this.testResults.dynamicCacheTests.push({
            test: 'Transactions cache immediate hit',
            passed: txCacheHit !== null,
            details: txCacheHit ? 'Transactions cached successfully' : 'Transactions cache failed'
        });
    }

    // Performance comparison: Event-driven vs TTL
    async testPerformance() {
        console.log('\n📊 Testing Performance Comparison...');
        
        const testUserId = 999997;
        const iterations = 100;
        
        // Test 1: Static cache performance (should be very fast after first load)
        console.log('Performance Test 1: Static cache repeated access');
        
        // First load (from database)
        const startTime1 = Date.now();
        await this.database.getUser(testUserId);
        const firstLoadTime = Date.now() - startTime1;
        
        // Subsequent loads (from cache)
        const startTime2 = Date.now();
        for (let i = 0; i < iterations; i++) {
            await this.database.getUser(testUserId);
        }
        const cacheLoadTime = Date.now() - startTime2;
        
        this.testResults.performanceTests.push({
            test: 'Static cache performance',
            firstLoad: `${firstLoadTime}ms`,
            cacheLoads: `${cacheLoadTime}ms for ${iterations} requests`,
            avgCacheTime: `${(cacheLoadTime / iterations).toFixed(2)}ms per request`
        });

        // Test 2: Cache invalidation performance
        console.log('Performance Test 2: Cache invalidation speed');
        
        const startTime3 = Date.now();
        await this.database.updateUserSettings(testUserId, { buy_slippage: 5.0 });
        const invalidationTime = Date.now() - startTime3;
        
        this.testResults.performanceTests.push({
            test: 'Cache invalidation performance',
            time: `${invalidationTime}ms`,
            details: 'Time to update database and refresh cache'
        });
    }

    // Simulate real-world usage patterns
    async testRealWorldScenario() {
        console.log('\n📊 Testing Real-world Usage Scenario...');
        
        const userId = 999996;
        
        // Scenario: User logs in, checks portfolio, updates settings, makes trade
        const startTime = Date.now();
        
        // 1. User login (loads user data)
        await this.database.getUser(userId);
        
        // 2. Check settings multiple times (should hit cache)
        for (let i = 0; i < 5; i++) {
            await this.database.getUserSettings(userId);
        }
        
        // 3. Update settings (should invalidate and refresh cache)
        await this.database.updateUserSettings(userId, { gas_priority: 'high' });
        
        // 4. Check settings again (should hit new cache)
        await this.database.getUserSettings(userId);
        
        // 5. Check user data multiple times (should hit cache)
        for (let i = 0; i < 3; i++) {
            await this.database.getUser(userId);
        }
        
        const totalTime = Date.now() - startTime;
        
        this.testResults.performanceTests.push({
            test: 'Real-world scenario simulation',
            totalTime: `${totalTime}ms`,
            details: '1 login + 5 settings reads + 1 settings update + 1 settings read + 3 user reads'
        });
    }

    // Generate comprehensive test report
    generateReport() {
        console.log('\n📋 EVENT-DRIVEN CACHE TEST RESULTS');
        console.log('=' .repeat(60));
        
        console.log('\n🔒 Static Cache Tests (Event-driven):');
        this.testResults.staticCacheTests.forEach((test, index) => {
            const status = test.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`   ${index + 1}. ${test.test}: ${status}`);
            console.log(`      ${test.details}`);
        });
        
        console.log('\n⚡ Dynamic Cache Tests (TTL-based):');
        this.testResults.dynamicCacheTests.forEach((test, index) => {
            const status = test.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`   ${index + 1}. ${test.test}: ${status}`);
            console.log(`      ${test.details}`);
        });
        
        console.log('\n🚀 Performance Tests:');
        this.testResults.performanceTests.forEach((test, index) => {
            console.log(`   ${index + 1}. ${test.test}:`);
            if (test.firstLoad) {
                console.log(`      First Load: ${test.firstLoad}`);
                console.log(`      Cache Loads: ${test.cacheLoads}`);
                console.log(`      Average: ${test.avgCacheTime}`);
            } else {
                console.log(`      Time: ${test.time || test.totalTime}`);
                console.log(`      Details: ${test.details}`);
            }
        });
        
        // Calculate success rate
        const staticPassed = this.testResults.staticCacheTests.filter(t => t.passed).length;
        const dynamicPassed = this.testResults.dynamicCacheTests.filter(t => t.passed).length;
        const totalTests = this.testResults.staticCacheTests.length + this.testResults.dynamicCacheTests.length;
        const totalPassed = staticPassed + dynamicPassed;
        const successRate = ((totalPassed / totalTests) * 100).toFixed(1);
        
        console.log('\n🎯 SUMMARY:');
        console.log(`   Tests Passed: ${totalPassed}/${totalTests} (${successRate}%)`);
        console.log(`   Static Cache: ${staticPassed}/${this.testResults.staticCacheTests.length} tests passed`);
        console.log(`   Dynamic Cache: ${dynamicPassed}/${this.testResults.dynamicCacheTests.length} tests passed`);
        
        if (successRate >= 90) {
            console.log('   Overall Status: ✅ EXCELLENT - Event-driven caching working perfectly!');
        } else if (successRate >= 75) {
            console.log('   Overall Status: ⚠️ GOOD - Minor issues detected');
        } else {
            console.log('   Overall Status: ❌ NEEDS WORK - Major issues detected');
        }
        
        console.log('\n💡 Benefits of Event-driven Caching:');
        console.log('   • User data cached indefinitely (no unnecessary DB queries)');
        console.log('   • Settings cached until manually updated');
        console.log('   • Cache invalidation only when data actually changes');
        console.log('   • Significant reduction in database load');
        console.log('   • Faster response times for static data');
    }

    async runAllTests() {
        try {
            await this.initialize();
            await this.testStaticCache();
            await this.testDynamicCache();
            await this.testPerformance();
            await this.testRealWorldScenario();
            this.generateReport();
        } catch (error) {
            console.error('❌ Event-driven cache test failed:', error);
        } finally {
            await this.database.close();
        }
    }
}

// Run the test if called directly
if (require.main === module) {
    const test = new EventDrivenCacheTest();
    test.runAllTests().then(() => {
        console.log('\n🏁 Event-driven cache testing completed');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = EventDrivenCacheTest;
