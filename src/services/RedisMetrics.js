/**
 * Redis Performance Metrics and Monitoring System
 * Tracks cache performance, response times, and provides alerting
 */
class RedisMetrics {
    constructor(monitoring = null) {
        this.monitoring = monitoring;
        this.metrics = {
            // Performance metrics
            cacheHits: 0,
            cacheMisses: 0,
            cacheErrors: 0,
            totalRequests: 0,
            
            // Response time tracking
            responseTimes: [],
            avgResponseTime: 0,
            maxResponseTime: 0,
            minResponseTime: Infinity,
            
            // Memory usage
            memoryUsage: 0,
            keyCount: 0,
            
            // Connection metrics
            connectionErrors: 0,
            reconnections: 0,
            
            // Operation metrics
            pipelineOperations: 0,
            batchOperations: 0,
            forceRefreshes: 0,
            
            // Time tracking
            startTime: Date.now(),
            lastReset: Date.now()
        };
        
        // Alert thresholds
        this.thresholds = {
            hitRateMin: 70,           // Minimum cache hit rate %
            responseTimeMax: 100,     // Maximum response time in ms
            errorRateMax: 5,          // Maximum error rate %
            memoryUsageMax: 100,      // Maximum memory usage in MB
            connectionErrorsMax: 10   // Maximum connection errors per hour
        };
        
        // Alert state tracking
        this.alerts = {
            lowHitRate: false,
            highResponseTime: false,
            highErrorRate: false,
            highMemoryUsage: false,
            connectionIssues: false
        };
        
        // Start periodic monitoring
        this.startPeriodicMonitoring();
    }

    /**
     * Record cache hit
     */
    recordHit(responseTime = 0) {
        this.metrics.cacheHits++;
        this.metrics.totalRequests++;
        this._recordResponseTime(responseTime);
    }

    /**
     * Record cache miss
     */
    recordMiss(responseTime = 0) {
        this.metrics.cacheMisses++;
        this.metrics.totalRequests++;
        this._recordResponseTime(responseTime);
    }

    /**
     * Record cache error
     */
    recordError(error, responseTime = 0) {
        this.metrics.cacheErrors++;
        this.metrics.totalRequests++;
        this._recordResponseTime(responseTime);
        
        if (this.monitoring) {
            this.monitoring.logError('Redis cache error recorded', error);
        }
    }

    /**
     * Record connection error
     */
    recordConnectionError(error) {
        this.metrics.connectionErrors++;
        
        if (this.monitoring) {
            this.monitoring.logError('Redis connection error', error);
        }
        
        this._checkConnectionAlerts();
    }

    /**
     * Record reconnection
     */
    recordReconnection() {
        this.metrics.reconnections++;
        
        if (this.monitoring) {
            this.monitoring.logInfo('Redis reconnection recorded');
        }
    }

    /**
     * Record pipeline operation
     */
    recordPipelineOperation(operationCount = 1) {
        this.metrics.pipelineOperations++;
        this.metrics.batchOperations += operationCount;
    }

    /**
     * Record force refresh
     */
    recordForceRefresh() {
        this.metrics.forceRefreshes++;
    }

    /**
     * Update memory usage
     */
    updateMemoryUsage(memoryBytes, keyCount) {
        this.metrics.memoryUsage = Math.round(memoryBytes / 1024 / 1024); // Convert to MB
        this.metrics.keyCount = keyCount;
        
        this._checkMemoryAlerts();
    }

    /**
     * Get current metrics snapshot
     */
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        const hitRate = this.metrics.totalRequests > 0 
            ? (this.metrics.cacheHits / this.metrics.totalRequests * 100)
            : 0;
        const errorRate = this.metrics.totalRequests > 0
            ? (this.metrics.cacheErrors / this.metrics.totalRequests * 100)
            : 0;

        return {
            // Performance
            hitRate: Number(hitRate.toFixed(2)),
            missRate: Number((100 - hitRate).toFixed(2)),
            errorRate: Number(errorRate.toFixed(2)),
            
            // Counts
            totalRequests: this.metrics.totalRequests,
            cacheHits: this.metrics.cacheHits,
            cacheMisses: this.metrics.cacheMisses,
            cacheErrors: this.metrics.cacheErrors,
            
            // Response times
            avgResponseTime: Number(this.metrics.avgResponseTime.toFixed(2)),
            maxResponseTime: this.metrics.maxResponseTime,
            minResponseTime: this.metrics.minResponseTime === Infinity ? 0 : this.metrics.minResponseTime,
            
            // Memory
            memoryUsageMB: this.metrics.memoryUsage,
            keyCount: this.metrics.keyCount,
            
            // Operations
            pipelineOperations: this.metrics.pipelineOperations,
            batchOperations: this.metrics.batchOperations,
            forceRefreshes: this.metrics.forceRefreshes,
            
            // Connection
            connectionErrors: this.metrics.connectionErrors,
            reconnections: this.metrics.reconnections,
            
            // Time
            uptimeMs: uptime,
            uptimeHours: Number((uptime / 1000 / 60 / 60).toFixed(2)),
            
            // Alerts
            activeAlerts: this._getActiveAlerts()
        };
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const metrics = this.getMetrics();
        
        return {
            status: this._getOverallStatus(),
            hitRate: `${metrics.hitRate}%`,
            avgResponseTime: `${metrics.avgResponseTime}ms`,
            memoryUsage: `${metrics.memoryUsageMB}MB`,
            totalRequests: metrics.totalRequests,
            uptime: `${metrics.uptimeHours}h`,
            alerts: metrics.activeAlerts.length
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        const currentTime = Date.now();
        
        this.metrics = {
            ...this.metrics,
            cacheHits: 0,
            cacheMisses: 0,
            cacheErrors: 0,
            totalRequests: 0,
            responseTimes: [],
            avgResponseTime: 0,
            maxResponseTime: 0,
            minResponseTime: Infinity,
            connectionErrors: 0,
            pipelineOperations: 0,
            batchOperations: 0,
            forceRefreshes: 0,
            lastReset: currentTime
        };
        
        // Reset alerts
        Object.keys(this.alerts).forEach(key => {
            this.alerts[key] = false;
        });
        
        if (this.monitoring) {
            this.monitoring.logInfo('Redis metrics reset');
        }
    }

    /**
     * Check if performance is degraded
     */
    isPerformanceDegraded() {
        const metrics = this.getMetrics();
        
        return (
            metrics.hitRate < this.thresholds.hitRateMin ||
            metrics.avgResponseTime > this.thresholds.responseTimeMax ||
            metrics.errorRate > this.thresholds.errorRateMax ||
            metrics.memoryUsageMB > this.thresholds.memoryUsageMax
        );
    }

    /**
     * Get recommendations for performance improvement
     */
    getRecommendations() {
        const metrics = this.getMetrics();
        const recommendations = [];
        
        if (metrics.hitRate < this.thresholds.hitRateMin) {
            recommendations.push({
                type: 'hit_rate',
                message: `Cache hit rate is ${metrics.hitRate}% (target: ${this.thresholds.hitRateMin}%)`,
                suggestion: 'Consider increasing TTL values or implementing background refresh'
            });
        }
        
        if (metrics.avgResponseTime > this.thresholds.responseTimeMax) {
            recommendations.push({
                type: 'response_time',
                message: `Average response time is ${metrics.avgResponseTime}ms (target: <${this.thresholds.responseTimeMax}ms)`,
                suggestion: 'Consider using more pipeline operations or optimizing Redis configuration'
            });
        }
        
        if (metrics.errorRate > this.thresholds.errorRateMax) {
            recommendations.push({
                type: 'error_rate',
                message: `Error rate is ${metrics.errorRate}% (target: <${this.thresholds.errorRateMax}%)`,
                suggestion: 'Check Redis connection stability and implement better error handling'
            });
        }
        
        if (metrics.memoryUsageMB > this.thresholds.memoryUsageMax) {
            recommendations.push({
                type: 'memory_usage',
                message: `Memory usage is ${metrics.memoryUsageMB}MB (target: <${this.thresholds.memoryUsageMax}MB)`,
                suggestion: 'Consider reducing TTL values or implementing cache cleanup policies'
            });
        }
        
        return recommendations;
    }

    /**
     * Start periodic monitoring and alerting
     */
    startPeriodicMonitoring() {
        // Check performance every 5 minutes
        setInterval(() => {
            this._checkPerformanceAlerts();
        }, 5 * 60 * 1000);
        
        // Log metrics every 15 minutes
        setInterval(() => {
            this._logPerformanceMetrics();
        }, 15 * 60 * 1000);
    }

    /**
     * Record response time
     */
    _recordResponseTime(responseTime) {
        if (responseTime > 0) {
            this.metrics.responseTimes.push(responseTime);
            
            // Keep only last 1000 response times
            if (this.metrics.responseTimes.length > 1000) {
                this.metrics.responseTimes.shift();
            }
            
            // Update min/max/avg
            this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, responseTime);
            this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, responseTime);
            
            const sum = this.metrics.responseTimes.reduce((a, b) => a + b, 0);
            this.metrics.avgResponseTime = sum / this.metrics.responseTimes.length;
        }
    }

    /**
     * Check performance alerts
     */
    _checkPerformanceAlerts() {
        const metrics = this.getMetrics();
        
        // Hit rate alert
        if (metrics.hitRate < this.thresholds.hitRateMin && !this.alerts.lowHitRate) {
            this.alerts.lowHitRate = true;
            this._sendAlert('LOW_HIT_RATE', `Cache hit rate dropped to ${metrics.hitRate}%`);
        } else if (metrics.hitRate >= this.thresholds.hitRateMin && this.alerts.lowHitRate) {
            this.alerts.lowHitRate = false;
            this._sendAlert('HIT_RATE_RECOVERED', `Cache hit rate recovered to ${metrics.hitRate}%`);
        }
        
        // Response time alert
        if (metrics.avgResponseTime > this.thresholds.responseTimeMax && !this.alerts.highResponseTime) {
            this.alerts.highResponseTime = true;
            this._sendAlert('HIGH_RESPONSE_TIME', `Average response time increased to ${metrics.avgResponseTime}ms`);
        } else if (metrics.avgResponseTime <= this.thresholds.responseTimeMax && this.alerts.highResponseTime) {
            this.alerts.highResponseTime = false;
            this._sendAlert('RESPONSE_TIME_RECOVERED', `Response time improved to ${metrics.avgResponseTime}ms`);
        }
        
        // Error rate alert
        if (metrics.errorRate > this.thresholds.errorRateMax && !this.alerts.highErrorRate) {
            this.alerts.highErrorRate = true;
            this._sendAlert('HIGH_ERROR_RATE', `Error rate increased to ${metrics.errorRate}%`);
        } else if (metrics.errorRate <= this.thresholds.errorRateMax && this.alerts.highErrorRate) {
            this.alerts.highErrorRate = false;
            this._sendAlert('ERROR_RATE_RECOVERED', `Error rate decreased to ${metrics.errorRate}%`);
        }
    }

    /**
     * Check memory alerts
     */
    _checkMemoryAlerts() {
        if (this.metrics.memoryUsage > this.thresholds.memoryUsageMax && !this.alerts.highMemoryUsage) {
            this.alerts.highMemoryUsage = true;
            this._sendAlert('HIGH_MEMORY_USAGE', `Redis memory usage: ${this.metrics.memoryUsage}MB`);
        } else if (this.metrics.memoryUsage <= this.thresholds.memoryUsageMax && this.alerts.highMemoryUsage) {
            this.alerts.highMemoryUsage = false;
            this._sendAlert('MEMORY_USAGE_RECOVERED', `Memory usage normalized: ${this.metrics.memoryUsage}MB`);
        }
    }

    /**
     * Check connection alerts
     */
    _checkConnectionAlerts() {
        const hourlyErrorRate = this.metrics.connectionErrors; // Simplified for now
        
        if (hourlyErrorRate > this.thresholds.connectionErrorsMax && !this.alerts.connectionIssues) {
            this.alerts.connectionIssues = true;
            this._sendAlert('CONNECTION_ISSUES', `High connection error rate: ${hourlyErrorRate} errors`);
        }
    }

    /**
     * Get active alerts
     */
    _getActiveAlerts() {
        return Object.keys(this.alerts).filter(key => this.alerts[key]);
    }

    /**
     * Get overall status
     */
    _getOverallStatus() {
        const activeAlerts = this._getActiveAlerts();
        
        if (activeAlerts.length === 0) {
            return 'healthy';
        } else if (activeAlerts.length <= 2) {
            return 'warning';
        } else {
            return 'critical';
        }
    }

    /**
     * Send alert
     */
    _sendAlert(type, message) {
        if (this.monitoring) {
            this.monitoring.logWarning(`Redis Alert: ${type}`, { message, metrics: this.getPerformanceSummary() });
        }
    }

    /**
     * Log performance metrics
     */
    _logPerformanceMetrics() {
        if (this.monitoring) {
            const summary = this.getPerformanceSummary();
            this.monitoring.logInfo('Redis Performance Metrics', summary);
        }
    }
}

module.exports = RedisMetrics;
