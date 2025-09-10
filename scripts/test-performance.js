// Performance test script for Area51 Bot - 100 concurrent users
const { performance } = require('perf_hooks');
const Database = require('../src/database-postgresql');

class PerformanceTest {
    constructor() {
        this.database = new Database();
        this.results = {
            connectionPool: {},
            queryPerformance: {},
            cachePerformance: {},
            concurrentUsers: {}
        };
    }

    async initialize() {
        console.log('🚀 Initializing performance test...');
        await this.database.initialize();
        console.log('✅ Database initialized');
    }

    // Test connection pool under load
    async testConnectionPool() {
        console.log('\n📊 Testing Connection Pool Performance...');
        const startTime = performance.now();
        const promises = [];

        // Simulate 100 concurrent database queries
        for (let i = 0; i < 100; i++) {
            promises.push(
                this.database.query('SELECT 1 as test_connection')
                    .catch(error => ({ error: error.message }))
            );
        }

        const results = await Promise.all(promises);
        const endTime = performance.now();
        
        const successful = results.filter(r => !r.error).length;
        const failed = results.filter(r => r.error).length;
        
        this.results.connectionPool = {
            totalQueries: 100,
            successful,
            failed,
            duration: Math.round(endTime - startTime),
            avgResponseTime: Math.round((endTime - startTime) / 100)
        };

        console.log(`✅ Connection Pool Test Results:`);
        console.log(`   - Successful: ${successful}/100`);
        console.log(`   - Failed: ${failed}/100`);
        console.log(`   - Total Duration: ${this.results.connectionPool.duration}ms`);
        console.log(`   - Avg Response Time: ${this.results.connectionPool.avgResponseTime}ms`);
    }

    // Test query performance with indexes
    async testQueryPerformance() {
        console.log('\n📊 Testing Query Performance...');
        
        // Test user lookup (should use new index)
        const userQueryStart = performance.now();
        await this.database.query('SELECT * FROM users WHERE telegram_id = $1 AND is_active = true', [12345]);
        const userQueryTime = performance.now() - userQueryStart;

        // Test transaction lookup (should use new index)
        const txQueryStart = performance.now();
        await this.database.query('SELECT * FROM transactions WHERE telegram_id = $1 ORDER BY created_at DESC LIMIT 10', [12345]);
        const txQueryTime = performance.now() - txQueryStart;

        // Test portfolio lookup (should use new index)
        const portfolioQueryStart = performance.now();
        await this.database.query('SELECT * FROM portfolio_entries WHERE telegram_id = $1 AND current_balance > 0', [12345]);
        const portfolioQueryTime = performance.now() - portfolioQueryStart;

        this.results.queryPerformance = {
            userLookup: Math.round(userQueryTime),
            transactionLookup: Math.round(txQueryTime),
            portfolioLookup: Math.round(portfolioQueryTime)
        };

        console.log(`✅ Query Performance Results:`);
        console.log(`   - User Lookup: ${this.results.queryPerformance.userLookup}ms`);
        console.log(`   - Transaction Lookup: ${this.results.queryPerformance.transactionLookup}ms`);
        console.log(`   - Portfolio Lookup: ${this.results.queryPerformance.portfolioLookup}ms`);
    }

    // Test cache performance
    async testCachePerformance() {
        console.log('\n📊 Testing Cache Performance...');
        
        if (!this.database.cacheEnabled) {
            console.log('⚠️ Cache is disabled, skipping cache tests');
            return;
        }

        const testData = { test: 'data', timestamp: Date.now() };
        
        // Test cache set performance
        const setCacheStart = performance.now();
        await this.database.setCache('test:performance', testData);
        const setCacheTime = performance.now() - setCacheStart;

        // Test cache get performance
        const getCacheStart = performance.now();
        const cachedData = await this.database.getFromCache('test:performance');
        const getCacheTime = performance.now() - getCacheStart;

        // Test cache hit rate with multiple operations
        const cacheHits = [];
        for (let i = 0; i < 50; i++) {
            const key = `test:hit:${i}`;
            await this.database.setCache(key, { data: i });
            const retrieved = await this.database.getFromCache(key);
            cacheHits.push(retrieved !== null);
        }

        const hitRate = (cacheHits.filter(hit => hit).length / cacheHits.length) * 100;

        this.results.cachePerformance = {
            setTime: Math.round(setCacheTime),
            getTime: Math.round(getCacheTime),
            hitRate: Math.round(hitRate),
            dataIntegrity: JSON.stringify(cachedData) === JSON.stringify(testData)
        };

        console.log(`✅ Cache Performance Results:`);
        console.log(`   - Set Time: ${this.results.cachePerformance.setTime}ms`);
        console.log(`   - Get Time: ${this.results.cachePerformance.getTime}ms`);
        console.log(`   - Hit Rate: ${this.results.cachePerformance.hitRate}%`);
        console.log(`   - Data Integrity: ${this.results.cachePerformance.dataIntegrity ? 'PASS' : 'FAIL'}`);
    }

    // Simulate 100 concurrent users
    async testConcurrentUsers() {
        console.log('\n📊 Testing 100 Concurrent Users Simulation...');
        const startTime = performance.now();
        const userPromises = [];

        // Simulate 100 users performing typical operations
        for (let i = 1; i <= 100; i++) {
            const userOperations = async () => {
                try {
                    // Simulate user login/data fetch
                    await this.database.getUser(1000 + i);
                    
                    // Simulate settings fetch
                    await this.database.getUserSettings(1000 + i);
                    
                    // Simulate portfolio check
                    await this.database.getPortfolioEntries(1000 + i);
                    
                    // Simulate transaction history
                    await this.database.getUserTransactions(1000 + i, 10);
                    
                    return { userId: 1000 + i, success: true };
                } catch (error) {
                    return { userId: 1000 + i, success: false, error: error.message };
                }
            };

            userPromises.push(userOperations());
        }

        const results = await Promise.all(userPromises);
        const endTime = performance.now();

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const totalDuration = Math.round(endTime - startTime);
        const avgUserTime = Math.round(totalDuration / 100);

        this.results.concurrentUsers = {
            totalUsers: 100,
            successful,
            failed,
            totalDuration,
            avgUserTime,
            usersPerSecond: Math.round(100 / (totalDuration / 1000))
        };

        console.log(`✅ Concurrent Users Test Results:`);
        console.log(`   - Successful: ${successful}/100 users`);
        console.log(`   - Failed: ${failed}/100 users`);
        console.log(`   - Total Duration: ${totalDuration}ms`);
        console.log(`   - Avg Time per User: ${avgUserTime}ms`);
        console.log(`   - Users per Second: ${this.results.concurrentUsers.usersPerSecond}`);
    }

    // Generate performance report
    generateReport() {
        console.log('\n📋 PERFORMANCE TEST SUMMARY');
        console.log('=' .repeat(50));
        
        console.log('\n🔗 Connection Pool:');
        console.log(`   Success Rate: ${(this.results.connectionPool.successful / this.results.connectionPool.totalQueries * 100).toFixed(1)}%`);
        console.log(`   Avg Response: ${this.results.connectionPool.avgResponseTime}ms`);
        
        console.log('\n⚡ Query Performance:');
        console.log(`   User Queries: ${this.results.queryPerformance.userLookup}ms`);
        console.log(`   Transaction Queries: ${this.results.queryPerformance.transactionLookup}ms`);
        console.log(`   Portfolio Queries: ${this.results.queryPerformance.portfolioLookup}ms`);
        
        if (this.results.cachePerformance.hitRate) {
            console.log('\n🚀 Cache Performance:');
            console.log(`   Hit Rate: ${this.results.cachePerformance.hitRate}%`);
            console.log(`   Cache Speed: ${this.results.cachePerformance.getTime}ms`);
        }
        
        console.log('\n👥 Concurrent Users:');
        console.log(`   Success Rate: ${(this.results.concurrentUsers.successful / this.results.concurrentUsers.totalUsers * 100).toFixed(1)}%`);
        console.log(`   Throughput: ${this.results.concurrentUsers.usersPerSecond} users/sec`);
        console.log(`   Avg Response: ${this.results.concurrentUsers.avgUserTime}ms`);
        
        // Performance assessment
        console.log('\n🎯 ASSESSMENT:');
        const assessment = this.assessPerformance();
        console.log(`   Overall Grade: ${assessment.grade}`);
        console.log(`   Ready for 100 users: ${assessment.ready ? 'YES ✅' : 'NO ❌'}`);
        console.log(`   Recommendations: ${assessment.recommendations.join(', ')}`);
    }

    assessPerformance() {
        const recommendations = [];
        let score = 0;
        
        // Connection pool assessment
        if (this.results.connectionPool.successful >= 95) score += 25;
        else recommendations.push('Increase connection pool size');
        
        // Query performance assessment
        const avgQueryTime = (this.results.queryPerformance.userLookup + 
                             this.results.queryPerformance.transactionLookup + 
                             this.results.queryPerformance.portfolioLookup) / 3;
        if (avgQueryTime < 50) score += 25;
        else if (avgQueryTime < 100) score += 15;
        else recommendations.push('Optimize database indexes');
        
        // Cache performance assessment
        if (this.results.cachePerformance.hitRate >= 80) score += 25;
        else if (this.results.cachePerformance.hitRate >= 60) score += 15;
        else recommendations.push('Improve cache strategy');
        
        // Concurrent users assessment
        if (this.results.concurrentUsers.successful >= 95 && this.results.concurrentUsers.avgUserTime < 300) score += 25;
        else if (this.results.concurrentUsers.successful >= 90) score += 15;
        else recommendations.push('Scale infrastructure');
        
        let grade, ready;
        if (score >= 90) { grade = 'A+'; ready = true; }
        else if (score >= 80) { grade = 'A'; ready = true; }
        else if (score >= 70) { grade = 'B'; ready = true; }
        else if (score >= 60) { grade = 'C'; ready = false; }
        else { grade = 'D'; ready = false; }
        
        if (recommendations.length === 0) recommendations.push('Performance looks good!');
        
        return { grade, ready, recommendations, score };
    }

    async runAllTests() {
        try {
            await this.initialize();
            await this.testConnectionPool();
            await this.testQueryPerformance();
            await this.testCachePerformance();
            await this.testConcurrentUsers();
            this.generateReport();
        } catch (error) {
            console.error('❌ Performance test failed:', error);
        } finally {
            await this.database.close();
        }
    }
}

// Run the test if called directly
if (require.main === module) {
    const test = new PerformanceTest();
    test.runAllTests().then(() => {
        console.log('\n🏁 Performance testing completed');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = PerformanceTest;
