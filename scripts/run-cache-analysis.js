/**
 * Cache Performance Analysis Script
 * Run this to validate cache effectiveness for trading speed
 */

const Redis = require('ioredis');
const CachePerformanceAnalyzer = require('../src/utils/cachePerformanceAnalyzer');
const CacheService = require('../src/services/CacheService');

async function runCacheAnalysis() {
    console.log('🚀 Starting Cache Performance Analysis for Area51 Trading Bot...\n');
    
    try {
        // Initialize Redis connection
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });

        // Initialize services
        const cacheService = new CacheService(redis);
        const analyzer = new CachePerformanceAnalyzer(redis, cacheService, null);

        // Run comprehensive analysis
        const results = await analyzer.analyzePerformance();
        
        // Generate and display report
        const report = analyzer.generateReport(results);
        console.log(report);
        
        // Performance verdict
        console.log('\n🎯 PERFORMANCE VERDICT:');
        console.log('======================');
        
        if (results.overallScore >= 90) {
            console.log('✅ EXCELLENT: Cache is optimally configured for high-speed trading');
            console.log('   Your bot delivers lightning-fast user experience');
        } else if (results.overallScore >= 80) {
            console.log('✅ GOOD: Cache performs well but has room for optimization');
            console.log('   Trading speed is acceptable for most scenarios');
        } else if (results.overallScore >= 70) {
            console.log('⚠️  ACCEPTABLE: Cache needs optimization for competitive trading');
            console.log('   Users may experience noticeable delays');
        } else {
            console.log('❌ POOR: Cache configuration severely impacts trading speed');
            console.log('   Immediate optimization required for production use');
        }
        
        // Critical recommendations
        const criticalRecs = results.recommendations.filter(r => r.priority === 'critical');
        if (criticalRecs.length > 0) {
            console.log('\n🚨 CRITICAL ACTIONS REQUIRED:');
            criticalRecs.forEach((rec, i) => {
                console.log(`${i + 1}. ${rec.issue}`);
                console.log(`   → ${rec.solution}\n`);
            });
        }
        
        // Speed benchmarks
        console.log('\n⚡ SPEED BENCHMARKS:');
        console.log('===================');
        console.log(`Main Menu Load: ${results.detailedResults.criticalPathAnalysis.paths.mainMenuLoad.responseTime}ms ${results.detailedResults.criticalPathAnalysis.paths.mainMenuLoad.responseTime <= 300 ? '✅' : '❌'} (Target: <300ms)`);
        console.log(`Portfolio View: ${results.detailedResults.criticalPathAnalysis.paths.portfolioView.responseTime}ms ${results.detailedResults.criticalPathAnalysis.paths.portfolioView.responseTime <= 400 ? '✅' : '❌'} (Target: <400ms)`);
        console.log(`Trading Execution: ${results.detailedResults.criticalPathAnalysis.paths.tradingExecution.responseTime}ms ${results.detailedResults.criticalPathAnalysis.paths.tradingExecution.responseTime <= 2000 ? '✅' : '❌'} (Target: <2000ms)`);
        console.log(`Cache Hit Ratio: ${(results.detailedResults.cacheEffectiveness.hitRatio * 100).toFixed(1)}% ${results.detailedResults.cacheEffectiveness.hitRatio >= 0.85 ? '✅' : '❌'} (Target: >85%)`);
        
        await redis.disconnect();
        
    } catch (error) {
        console.error('❌ Cache analysis failed:', error.message);
        process.exit(1);
    }
}

// Run analysis if called directly
if (require.main === module) {
    runCacheAnalysis().catch(console.error);
}

module.exports = runCacheAnalysis;
