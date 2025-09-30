/**
 * 📊 Performance Reporter - Area51 Bot
 * Tracks and reports performance metrics for trading operations
 */

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
        this.startTime = Date.now();
    }

    /**
     * 📈 Record transaction performance
     */
    recordTransaction(type, duration, success = true) {
        if (!this.metrics.transactions[type]) {
            this.metrics.transactions[type] = { 
                count: 0, totalTime: 0, avgTime: 0, fastest: Infinity, slowest: 0 
            };
        }
        
        const metric = this.metrics.transactions[type];
        metric.count++;
        metric.totalTime += duration;
        metric.avgTime = metric.totalTime / metric.count;
        metric.fastest = Math.min(metric.fastest, duration);
        metric.slowest = Math.max(metric.slowest, duration);
        
        this.monitoring?.logInfo(`${type} Transaction: ${duration}ms (${success ? '✅' : '❌'})`);
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
     * 💾 Record cache performance
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
     * ⚡ Record preloading performance
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
        
        this.monitoring?.logInfo(`Preloading: ${duration}ms - Success Rate: ${this.metrics.preloading.successRate.toFixed(1)}%`);
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
            report.transactions[type] = {
                ...metric,
                fastest: metric.fastest === Infinity ? 0 : metric.fastest,
                avgTime: Math.round(metric.avgTime),
                performance: this.getPerformanceRating(metric.avgTime)
            };
        }

        // Calculate summary
        const totalTransactions = Object.values(this.metrics.transactions)
            .reduce((sum, metric) => sum + metric.count, 0);
        const avgTransactionTime = Object.values(this.metrics.transactions)
            .reduce((sum, metric) => sum + metric.avgTime, 0) / 
            Object.keys(this.metrics.transactions).length;

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
     * 🎯 Get performance rating based on average time
     */
    getPerformanceRating(avgTime) {
        if (avgTime < 1000) return '🚀 Excellent';
        if (avgTime < 3000) return '⚡ Good';
        if (avgTime < 5000) return '🟡 Fair';
        return '🔴 Needs Improvement';
    }

    /**
     * 📊 Calculate overall performance score
     */
    getOverallPerformance() {
        const cacheScore = this.metrics.cache.hitRatio;
        const preloadScore = this.metrics.preloading.successRate;
        const avgTransactionTime = Object.values(this.metrics.transactions)
            .reduce((sum, metric) => sum + metric.avgTime, 0) / 
            Object.keys(this.metrics.transactions).length;

        const speedScore = Math.max(0, 100 - (avgTransactionTime / 100));
        const overallScore = (cacheScore + preloadScore + speedScore) / 3;

        if (overallScore >= 90) return '🚀 Excellent';
        if (overallScore >= 75) return '⚡ Good';
        if (overallScore >= 60) return '🟡 Fair';
        return '🔴 Needs Improvement';
    }

    /**
     * 🖨️ Print formatted performance report
     */
    printReport() {
        const report = this.generateReport();
        
        console.log('\n📊 Performance Report');
        console.log('=====================');
        console.log(`Timestamp: ${report.timestamp}`);
        console.log(`Overall Performance: ${report.summary.overallPerformance}`);
        
        console.log('\n📈 Transaction Performance:');
        for (const [type, data] of Object.entries(report.transactions)) {
            console.log(`  ${type}: ${data.count} transactions`);
            console.log(`    Average: ${data.avgTime}ms`);
            console.log(`    Fastest: ${data.fastest}ms`);
            console.log(`    Slowest: ${data.slowest}ms`);
            console.log(`    Rating: ${data.performance}`);
        }
        
        console.log('\n💾 Cache Performance:');
        console.log(`  Hit Ratio: ${report.cache.hitRatio.toFixed(1)}%`);
        console.log(`  Average Response: ${report.cache.avgResponseTime.toFixed(1)}ms`);
        
        console.log('\n⚡ Preloading Performance:');
        console.log(`  Success Rate: ${report.preloading.successRate.toFixed(1)}%`);
        console.log(`  Average Time: ${report.preloading.avgPreloadTime.toFixed(1)}ms`);
        
        return report;
    }

    /**
     * 🔄 Start automatic reporting
     */
    startReporting() {
        // Detailed report every 5 minutes
        setInterval(() => {
            this.printReport();
        }, 5 * 60 * 1000);

        // Quick metrics every minute
        setInterval(() => {
            this.monitoring?.logInfo('Performance metrics', this.getMetrics());
        }, 60 * 1000);
    }

    /**
     * 📋 Get current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * 🔄 Reset all metrics
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
        this.startTime = Date.now();
        this.monitoring?.logInfo('Performance metrics reset');
    }
}

module.exports = PerformanceReporter;
