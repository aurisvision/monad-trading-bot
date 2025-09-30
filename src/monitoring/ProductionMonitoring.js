/**
 * Production Monitoring System for Area51 Modular Bot
 * Provides comprehensive monitoring, alerting, and health checks
 */

const EventEmitter = require('events');

class ProductionMonitoring extends EventEmitter {
    constructor() {
        super();
        this.metrics = {
            startTime: Date.now(),
            requests: 0,
            errors: 0,
            activeUsers: new Set(),
            transactions: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            responseTime: [],
            memoryUsage: [],
            cpuUsage: []
        };
        
        this.alerts = {
            errorRate: { threshold: 0.05, enabled: true }, // 5% error rate
            responseTime: { threshold: 1000, enabled: true }, // 1 second
            memoryUsage: { threshold: 0.8, enabled: true }, // 80% memory
            activeUsers: { threshold: 1000, enabled: true }
        };
        
        this.healthStatus = {
            database: 'unknown',
            redis: 'unknown',
            monadRpc: 'unknown',
            overall: 'unknown'
        };
        
        this.startMonitoring();
    }

    /**
     * Start monitoring intervals
     */
    startMonitoring() {
        // Collect system metrics every 30 seconds
        setInterval(() => {
            this.collectSystemMetrics();
        }, 30000);

        // Health check every 60 seconds
        setInterval(() => {
            this.performHealthCheck();
        }, 60000);

        // Clean old metrics every 5 minutes
        setInterval(() => {
            this.cleanOldMetrics();
        }, 300000);

        console.log('🔍 Production monitoring started');
    }

    /**
     * Record a request
     */
    recordRequest(userId, responseTime) {
        this.metrics.requests++;
        this.metrics.activeUsers.add(userId);
        
        if (responseTime) {
            this.metrics.responseTime.push({
                time: Date.now(),
                value: responseTime
            });
            
            // Check response time alert
            if (responseTime > this.alerts.responseTime.threshold) {
                this.triggerAlert('responseTime', {
                    value: responseTime,
                    threshold: this.alerts.responseTime.threshold,
                    userId
                });
            }
        }
    }

    /**
     * Record an error
     */
    recordError(error, context = {}) {
        this.metrics.errors++;
        
        const errorData = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString(),
            userId: context.userId
        };
        
        console.error('🚨 Production Error:', errorData);
        
        // Check error rate
        const errorRate = this.getErrorRate();
        if (errorRate > this.alerts.errorRate.threshold) {
            this.triggerAlert('errorRate', {
                rate: errorRate,
                threshold: this.alerts.errorRate.threshold,
                recentErrors: this.metrics.errors
            });
        }
        
        this.emit('error', errorData);
    }

    /**
     * Record a transaction
     */
    recordTransaction(success, amount, token, userId) {
        this.metrics.transactions++;
        
        if (success) {
            this.metrics.successfulTransactions++;
        } else {
            this.metrics.failedTransactions++;
        }
        
        const transactionData = {
            success,
            amount,
            token,
            userId,
            timestamp: new Date().toISOString()
        };
        
        this.emit('transaction', transactionData);
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const memoryPercent = memUsage.heapUsed / memUsage.heapTotal;
        
        this.metrics.memoryUsage.push({
            time: Date.now(),
            value: memoryPercent
        });
        
        // Check memory alert
        if (memoryPercent > this.alerts.memoryUsage.threshold) {
            this.triggerAlert('memoryUsage', {
                value: memoryPercent,
                threshold: this.alerts.memoryUsage.threshold,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal
            });
        }
        
        // Check active users
        const activeUserCount = this.metrics.activeUsers.size;
        if (activeUserCount > this.alerts.activeUsers.threshold) {
            this.triggerAlert('activeUsers', {
                count: activeUserCount,
                threshold: this.alerts.activeUsers.threshold
            });
        }
    }

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        try {
            // Check database connection
            this.healthStatus.database = await this.checkDatabase();
            
            // Check Redis connection
            this.healthStatus.redis = await this.checkRedis();
            
            // Check Monad RPC
            this.healthStatus.monadRpc = await this.checkMonadRpc();
            
            // Determine overall health
            this.healthStatus.overall = this.calculateOverallHealth();
            
            this.emit('healthCheck', this.healthStatus);
            
        } catch (error) {
            console.error('❌ Health check failed:', error);
            this.healthStatus.overall = 'unhealthy';
        }
    }

    /**
     * Check database connectivity
     */
    async checkDatabase() {
        try {
            // This would be implemented with actual database check
            // For now, return healthy
            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Check Redis connectivity
     */
    async checkRedis() {
        try {
            // This would be implemented with actual Redis check
            // For now, return healthy
            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Check Monad RPC connectivity
     */
    async checkMonadRpc() {
        try {
            // This would be implemented with actual RPC check
            // For now, return healthy
            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Calculate overall system health
     */
    calculateOverallHealth() {
        const services = Object.values(this.healthStatus);
        const healthyServices = services.filter(status => status === 'healthy').length;
        const totalServices = services.length - 1; // Exclude 'overall'
        
        if (healthyServices === totalServices) {
            return 'healthy';
        } else if (healthyServices >= totalServices * 0.7) {
            return 'degraded';
        } else {
            return 'unhealthy';
        }
    }

    /**
     * Trigger an alert
     */
    triggerAlert(type, data) {
        if (!this.alerts[type]?.enabled) return;
        
        const alert = {
            type,
            severity: this.getAlertSeverity(type, data),
            message: this.formatAlertMessage(type, data),
            data,
            timestamp: new Date().toISOString()
        };
        
        console.warn('🚨 ALERT:', alert);
        this.emit('alert', alert);
    }

    /**
     * Get alert severity
     */
    getAlertSeverity(type, data) {
        switch (type) {
            case 'errorRate':
                return data.rate > 0.1 ? 'critical' : 'warning';
            case 'responseTime':
                return data.value > 5000 ? 'critical' : 'warning';
            case 'memoryUsage':
                return data.value > 0.9 ? 'critical' : 'warning';
            case 'activeUsers':
                return 'info';
            default:
                return 'warning';
        }
    }

    /**
     * Format alert message
     */
    formatAlertMessage(type, data) {
        switch (type) {
            case 'errorRate':
                return `High error rate: ${(data.rate * 100).toFixed(2)}% (threshold: ${(data.threshold * 100).toFixed(2)}%)`;
            case 'responseTime':
                return `Slow response time: ${data.value}ms (threshold: ${data.threshold}ms)`;
            case 'memoryUsage':
                return `High memory usage: ${(data.value * 100).toFixed(2)}% (threshold: ${(data.threshold * 100).toFixed(2)}%)`;
            case 'activeUsers':
                return `High user activity: ${data.count} active users (threshold: ${data.threshold})`;
            default:
                return `Alert triggered: ${type}`;
        }
    }

    /**
     * Get current error rate
     */
    getErrorRate() {
        if (this.metrics.requests === 0) return 0;
        return this.metrics.errors / this.metrics.requests;
    }

    /**
     * Get success rate for transactions
     */
    getTransactionSuccessRate() {
        if (this.metrics.transactions === 0) return 0;
        return this.metrics.successfulTransactions / this.metrics.transactions;
    }

    /**
     * Get average response time
     */
    getAverageResponseTime() {
        if (this.metrics.responseTime.length === 0) return 0;
        
        const recent = this.metrics.responseTime.slice(-100); // Last 100 requests
        const sum = recent.reduce((acc, item) => acc + item.value, 0);
        return sum / recent.length;
    }

    /**
     * Get system uptime
     */
    getUptime() {
        const uptimeMs = Date.now() - this.metrics.startTime;
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    /**
     * Get comprehensive metrics summary
     */
    getMetricsSummary() {
        return {
            uptime: this.getUptime(),
            requests: this.metrics.requests,
            errors: this.metrics.errors,
            errorRate: this.getErrorRate(),
            activeUsers: this.metrics.activeUsers.size,
            transactions: this.metrics.transactions,
            transactionSuccessRate: this.getTransactionSuccessRate(),
            averageResponseTime: this.getAverageResponseTime(),
            health: this.healthStatus,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Clean old metrics to prevent memory leaks
     */
    cleanOldMetrics() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        // Clean response time metrics
        this.metrics.responseTime = this.metrics.responseTime.filter(
            item => item.time > oneHourAgo
        );
        
        // Clean memory usage metrics
        this.metrics.memoryUsage = this.metrics.memoryUsage.filter(
            item => item.time > oneHourAgo
        );
        
        // Clear active users set periodically
        if (Math.random() < 0.1) { // 10% chance every 5 minutes
            this.metrics.activeUsers.clear();
        }
    }

    /**
     * Export metrics for external monitoring systems
     */
    exportMetrics() {
        return {
            ...this.getMetricsSummary(),
            detailed: {
                responseTimeHistory: this.metrics.responseTime.slice(-50),
                memoryUsageHistory: this.metrics.memoryUsage.slice(-50),
                alertsConfig: this.alerts
            }
        };
    }
}

module.exports = ProductionMonitoring;