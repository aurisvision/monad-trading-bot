// 📊 Performance Reporter - Advanced performance tracking for trading operations

class PerformanceReporter {
    constructor(monitoring) {
        this.monitoring = monitoring;
        this.metrics = {
            transactions: {
                buy: { count: 0, totalTime: 0, avgTime: 0, fastest: Infinity, slowest: 0 },
                sell: { count: 0, totalTime: 0, avgTime: 0, fastest: Infinity, slowest: 0 },
                autoBuy: { count: 0, totalTime: 0, avgTime: 0, fastest: Infinity, slowest: 0 }
            },
            cache: {
                hits: 0,
                misses: 0,
                hitRatio: 0,
                avgResponseTime: 0
            },
            preloading: {
                attempts: 0,
                successes: 0,
                failures: 0,
                successRate: 0,
                avgPreloadTime: 0
            }
        };
        
        this.startReporting();
    }

    /**
     * 📊 Record transaction performance
     */
    recordTransaction(type, duration, success = true) {
        // Ensure type exists in metrics
        if (!this.metrics.transactions[type]) {
            this.metrics.transactions[type] = { 
                count: 0, 
                totalTime: 0, 
                avgTime: 0, 
                fastest: Infinity, 
                slowest: 0 
            };
        }
        
        const metric = this.metrics.transactions[type];

        metric.count++;
        metric.totalTime += duration;
        metric.avgTime = metric.totalTime / metric.count;
        metric.fastest = Math.min(metric.fastest, duration);
        metric.slowest = Math.max(metric.slowest, duration);

        console.log(`📊 ${type.toUpperCase()} Transaction: ${duration}ms (${success ? '✅' : '❌'})`);
        
        this.monitoring?.logInfo('Transaction performance recorded', {
            type,
            duration,
            success,
            avgTime: Math.round(metric.avgTime),
            fastest: metric.fastest === Infinity ? duration : metric.fastest,
            slowest: metric.slowest
        });
    }

    /**
     * 🚀 Record cache performance
     */
    recordCacheHit(responseTime = 0) {
        this.metrics.cache.hits++;
        this.updateCacheMetrics(responseTime);
    }

    recordCacheMiss(responseTime = 0) {
        this.metrics.cache.misses++;
        this.updateCacheMetrics(responseTime);
    }

    updateCacheMetrics(responseTime) {
        const total = this.metrics.cache.hits + this.metrics.cache.misses;
        this.metrics.cache.hitRatio = (this.metrics.cache.hits / total) * 100;
        
        if (responseTime > 0) {
            this.metrics.cache.avgResponseTime = 
                (this.metrics.cache.avgResponseTime + responseTime) / 2;
        }
    }

    /**
     * 🔥 Record preloading performance
     */
    recordPreloading(duration, success = true) {
        this.metrics.preloading.attempts++;
        
        if (success) {
            this.metrics.preloading.successes++;
            this.metrics.preloading.avgPreloadTime = 
                (this.metrics.preloading.avgPreloadTime + duration) / 2;
        } else {
            this.metrics.preloading.failures++;
        }
        
        this.metrics.preloading.successRate = 
            (this.metrics.preloading.successes / this.metrics.preloading.attempts) * 100;

        console.log(`🔥 Preload: ${duration}ms (${success ? '✅' : '❌'}) - Success Rate: ${this.metrics.preloading.successRate.toFixed(1)}%`);
    }

    /**
     * 📈 Generate performance report
     */
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            transactions: {},
            cache: { ...this.metrics.cache },
            preloading: { ...this.metrics.preloading },
            summary: {}
        };

        // Process transaction metrics
        for (const [type, metric] of Object.entries(this.metrics.transactions)) {
            if (metric.count > 0) {
                report.transactions[type] = {
                    count: metric.count,
                    avgTime: Math.round(metric.avgTime),
                    fastest: metric.fastest === Infinity ? 0 : metric.fastest,
                    slowest: metric.slowest,
                    performance: this.getPerformanceRating(metric.avgTime)
                };
            }
        }

        // Calculate summary
        const totalTransactions = Object.values(this.metrics.transactions)
            .reduce((sum, metric) => sum + metric.count, 0);
        
        const avgTransactionTime = Object.values(this.metrics.transactions)
            .filter(metric => metric.count > 0)
            .reduce((sum, metric) => sum + metric.avgTime, 0) / 
            Object.values(this.metrics.transactions).filter(metric => metric.count > 0).length;

        report.summary = {
            totalTransactions,
            avgTransactionTime: Math.round(avgTransactionTime || 0),
            cacheHitRatio: Math.round(this.metrics.cache.hitRatio),
            preloadSuccessRate: Math.round(this.metrics.preloading.successRate),
            overallPerformance: this.getOverallPerformance()
        };

        return report;
    }

    /**
     * 🎯 Get performance rating
     */
    getPerformanceRating(avgTime) {
        if (avgTime < 1000) return '🚀 Excellent';
        if (avgTime < 3000) return '⚡ Good';
        if (avgTime < 5000) return '🟡 Fair';
        return '🔴 Needs Improvement';
    }

    /**
     * 📊 Get overall performance score
     */
    getOverallPerformance() {
        const cacheScore = this.metrics.cache.hitRatio;
        const preloadScore = this.metrics.preloading.successRate;
        
        const avgTransactionTime = Object.values(this.metrics.transactions)
            .filter(metric => metric.count > 0)
            .reduce((sum, metric) => sum + metric.avgTime, 0) / 
            Object.values(this.metrics.transactions).filter(metric => metric.count > 0).length;

        const speedScore = Math.max(0, 100 - (avgTransactionTime / 100));
        
        const overallScore = (cacheScore + preloadScore + speedScore) / 3;
        
        if (overallScore >= 90) return '🚀 Excellent';
        if (overallScore >= 75) return '⚡ Good';
        if (overallScore >= 60) return '🟡 Fair';
        return '🔴 Needs Improvement';
    }

    /**
     * 📊 Print detailed report
     */
    printReport() {
        const report = this.generateReport();
        
        console.log('\n' + '='.repeat(60));
        console.log('🚀 TRANSACTION ACCELERATOR PERFORMANCE REPORT');
        console.log('='.repeat(60));
        
        // Transaction Performance
        console.log('\n📊 TRANSACTION PERFORMANCE:');
        for (const [type, data] of Object.entries(report.transactions)) {
            console.log(`   ${type.toUpperCase()}:`);
            console.log(`     Count: ${data.count}`);
            console.log(`     Avg Time: ${data.avgTime}ms`);
            console.log(`     Fastest: ${data.fastest}ms`);
            console.log(`     Slowest: ${data.slowest}ms`);
            console.log(`     Rating: ${data.performance}`);
        }
        
        // Cache Performance
        console.log('\n🚀 CACHE PERFORMANCE:');
        console.log(`   Hit Ratio: ${report.cache.hitRatio}%`);
        console.log(`   Total Hits: ${report.cache.hits}`);
        console.log(`   Total Misses: ${report.cache.misses}`);
        console.log(`   Avg Response: ${Math.round(report.cache.avgResponseTime)}ms`);
        
        // Preloading Performance
        console.log('\n🔥 PRELOADING PERFORMANCE:');
        console.log(`   Success Rate: ${report.preloading.successRate}%`);
        console.log(`   Total Attempts: ${report.preloading.attempts}`);
        console.log(`   Successes: ${report.preloading.successes}`);
        console.log(`   Avg Preload Time: ${Math.round(report.preloading.avgPreloadTime)}ms`);
        
        // Summary
        console.log('\n🎯 SUMMARY:');
        console.log(`   Total Transactions: ${report.summary.totalTransactions}`);
        console.log(`   Avg Transaction Time: ${report.summary.avgTransactionTime}ms`);
        console.log(`   Cache Hit Ratio: ${report.summary.cacheHitRatio}%`);
        console.log(`   Preload Success Rate: ${report.summary.preloadSuccessRate}%`);
        console.log(`   Overall Performance: ${report.summary.overallPerformance}`);
        
        console.log('='.repeat(60));
        
        return report;
    }

    /**
     * 🔄 Start automatic reporting
     */
    startReporting() {
        // Print detailed report every 5 minutes
        setInterval(() => {
            this.printReport();
        }, 5 * 60 * 1000);

        // Log summary every minute
        setInterval(() => {
            const report = this.generateReport();
            console.log(`📊 Performance Summary: ${report.summary.totalTransactions} transactions, ${report.summary.avgTransactionTime}ms avg, ${report.summary.cacheHitRatio}% cache hit ratio`);
        }, 60 * 1000);

        console.log('📊 Performance reporting started');
    }

    /**
     * 📈 Get current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * 🔄 Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            transactions: {
                buy: { count: 0, totalTime: 0, avgTime: 0, fastest: Infinity, slowest: 0 },
                sell: { count: 0, totalTime: 0, avgTime: 0, fastest: Infinity, slowest: 0 },
                autoBuy: { count: 0, totalTime: 0, avgTime: 0, fastest: Infinity, slowest: 0 }
            },
            cache: {
                hits: 0,
                misses: 0,
                hitRatio: 0,
                avgResponseTime: 0
            },
            preloading: {
                attempts: 0,
                successes: 0,
                failures: 0,
                successRate: 0,
                avgPreloadTime: 0
            }
        };
        
        console.log('📊 Performance metrics reset');
    }
}

module.exports = PerformanceReporter;
