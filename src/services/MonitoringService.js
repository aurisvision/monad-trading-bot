/**
 * Monitoring Service for Area51 Trading Bot
 * Provides logging, metrics, and monitoring capabilities
 */

class MonitoringService {
    constructor() {
        this.metrics = {
            requests: 0,
            errors: 0,
            trades: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        this.startTime = Date.now();
    }

    // Log info messages
    logInfo(message, data = {}) {
        console.log(`ℹ️ [INFO] ${message}`, data);
        this.metrics.requests++;
    }

    // Log error messages
    logError(message, error, data = {}) {
        console.error(`❌ [ERROR] ${message}`, {
            error: error?.message || error,
            stack: error?.stack,
            ...data
        });
        this.metrics.errors++;
    }

    // Log warning messages
    logWarning(message, data = {}) {
        console.warn(`⚠️ [WARNING] ${message}`, data);
    }

    // Log trading operations
    logTrade(operation, data = {}) {
        console.log(`💰 [TRADE] ${operation}`, data);
        this.metrics.trades++;
    }

    // Log cache operations
    logCacheHit(key) {
        console.log(`🎯 [CACHE HIT] ${key}`);
        this.metrics.cacheHits++;
    }

    logCacheMiss(key) {
        console.log(`❌ [CACHE MISS] ${key}`);
        this.metrics.cacheMisses++;
    }

    // Get monitoring metrics
    getMetrics() {
        const uptime = Date.now() - this.startTime;
        return {
            ...this.metrics,
            uptime: Math.floor(uptime / 1000), // seconds
            cacheHitRatio: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100 || 0
        };
    }

    // Wrap trading operations for monitoring
    wrapTradingOperation(operation) {
        return async (...args) => {
            const start = Date.now();
            try {
                const result = await operation(...args);
                const duration = Date.now() - start;
                this.logInfo(`Trading operation completed in ${duration}ms`);
                return result;
            } catch (error) {
                const duration = Date.now() - start;
                this.logError(`Trading operation failed after ${duration}ms`, error);
                throw error;
            }
        };
    }

    // Wrap API calls for monitoring
    wrapApiCall(apiCall) {
        return async (...args) => {
            const start = Date.now();
            try {
                const result = await apiCall(...args);
                const duration = Date.now() - start;
                this.logInfo(`API call completed in ${duration}ms`);
                return result;
            } catch (error) {
                const duration = Date.now() - start;
                this.logError(`API call failed after ${duration}ms`, error);
                throw error;
            }
        };
    }

    // Health check
    getHealthStatus() {
        const metrics = this.getMetrics();
        const errorRate = (metrics.errors / metrics.requests) * 100 || 0;
        
        return {
            status: errorRate < 5 ? 'healthy' : 'degraded',
            uptime: metrics.uptime,
            errorRate: errorRate.toFixed(2) + '%',
            cacheHitRatio: metrics.cacheHitRatio.toFixed(1) + '%',
            totalRequests: metrics.requests,
            totalTrades: metrics.trades
        };
    }
}

module.exports = MonitoringService;
