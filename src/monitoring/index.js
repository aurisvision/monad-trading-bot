const PrometheusMetrics = require('./PrometheusMetrics');
const MetricsMiddleware = require('./MetricsMiddleware');
const HealthCheck = require('./HealthCheck');
const AlertManager = require('./AlertManager');
const express = require('express');

class MonitoringSystem {
    constructor(database, redis, logger) {
        this.database = database;
        this.redis = redis;
        this.logger = logger;
        
        // Initialize monitoring components
        this.metricsMiddleware = new MetricsMiddleware();
        this.healthCheck = new HealthCheck(database, redis, this);
        this.alertManager = new AlertManager(this);
        
        // Add backup service reference
        this.backupService = null;
        
        // Metrics collection
        this.metrics = this.metricsMiddleware.metrics;
        
        // Cache hit tracking
        this.cacheStats = {
            hits: 0,
            misses: 0,
            total: 0
        };
        
        // Initialize flag
        this.initialized = false;
        
        // Start periodic tasks
        this.startPeriodicTasks();
    }

    // Initialize monitoring endpoints
    initializeEndpoints(app) {
        // Metrics endpoint for Prometheus
        app.get('/metrics', this.metricsMiddleware.getMetricsHandler());
        
        // Health check endpoints
        const healthMiddleware = this.healthCheck.getHealthMiddleware();
        app.get('/health', healthMiddleware.health);
        app.get('/health/live', healthMiddleware.liveness);
        app.get('/health/ready', healthMiddleware.readiness);
        
        // Alert webhook endpoint
        app.post('/webhook/alerts', this.handleAlertWebhook.bind(this));
        
        // Monitoring dashboard endpoint
        app.get('/monitoring', this.getMonitoringDashboard.bind(this));
    }

    // Get Telegram middleware for bot
    getTelegramMiddleware() {
        return this.metricsMiddleware.telegramMetrics();
    }

    // Wrap database operations
    wrapDatabaseOperation(operation, operationName) {
        return this.metricsMiddleware.wrapDatabaseOperation(operation, operationName);
    }

    // Wrap Redis operations
    wrapRedisOperation(operation, operationName) {
        return this.metricsMiddleware.wrapRedisOperation(operation, operationName);
    }

    // Wrap trading operations
    wrapTradingOperation(operation, operationType) {
        return this.metricsMiddleware.wrapTradingOperation(operation, operationType);
    }

    // Wrap API calls
    wrapApiCall(apiCall, apiName, endpoint) {
        return this.metricsMiddleware.wrapApiCall(apiCall, apiName, endpoint);
    }

    // Record cache hit/miss
    recordCacheHit() {
        this.cacheStats.hits++;
        this.cacheStats.total++;
        this.updateCacheHitRatio();
    }

    recordCacheMiss() {
        this.cacheStats.misses++;
        this.cacheStats.total++;
        this.updateCacheHitRatio();
    }

    updateCacheHitRatio() {
        this.metricsMiddleware.updateCacheHitRatio(this.cacheStats.hits, this.cacheStats.total);
    }

    // Update active users count
    updateActiveUsers(count) {
        this.metricsMiddleware.updateActiveUsers(count);
    }

    // Record error
    recordError(errorType, severity = 'error') {
        this.metrics.recordError(errorType, severity);
    }

    // Start periodic monitoring tasks
    startPeriodicTasks() {
        // Update connection counts every 30 seconds
        this.connectionInterval = setInterval(() => {
            this.updateConnectionCounts();
        }, 30000);

        // Check alerts every minute
        this.alertInterval = setInterval(() => {
            this.checkSystemAlerts();
        }, 60000);

        // Reset cache stats every hour
        this.cacheResetInterval = setInterval(() => {
            this.resetCacheStats();
        }, 3600000);
    }

    // Update database and Redis connection counts
    async updateConnectionCounts() {
        try {
            // Database connections
            if (this.database && this.database.pool) {
                const dbConnections = this.database.pool.totalCount || 0;
                this.metricsMiddleware.updateDatabaseConnections(dbConnections);
            }

            // Redis connections
            if (this.redis && this.redis.status === 'ready') {
                this.metricsMiddleware.updateRedisConnections(1);
            } else {
                this.metricsMiddleware.updateRedisConnections(0);
            }
        } catch (error) {
            this.logError('Failed to update connection counts', error);
        }
    }

    // Check system alerts
    async checkSystemAlerts() {
        try {
            const metrics = await this.collectSystemMetrics();
            this.alertManager.checkAlerts(metrics);
        } catch (error) {
            this.logError('Failed to check system alerts', error);
        }
    }

    // Collect current system metrics for alerting
    async collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        return {
            memory_usage_percent: heapUsagePercent,
            database_errors: this.getDatabaseErrorCount(),
            redis_errors: this.getRedisErrorCount(),
            error_count: this.getErrorCount(),
            total_requests: this.getTotalRequests(),
            trading_failures: this.getTradingFailures(),
            avg_api_response_time: this.getAverageApiResponseTime()
        };
    }

    // Reset cache statistics
    resetCacheStats() {
        this.cacheStats = {
            hits: 0,
            misses: 0,
            total: 0
        };
    }

    // Handle alert webhook from Alertmanager
    async handleAlertWebhook(req, res) {
        try {
            const alerts = req.body.alerts || [];
            
            for (const alert of alerts) {
                if (alert.status === 'firing') {
                    await this.handleFiringAlert(alert);
                } else if (alert.status === 'resolved') {
                    await this.handleResolvedAlert(alert);
                }
            }
            
            res.status(200).json({ status: 'ok' });
        } catch (error) {
            this.logError('Failed to handle alert webhook', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Handle firing alert
    async handleFiringAlert(alert) {
        this.logWarning(`Alert firing: ${alert.labels.alertname}`, {
            severity: alert.labels.severity,
            description: alert.annotations.description
        });

        // Send to admin if critical
        if (alert.labels.severity === 'critical') {
            await this.sendAdminNotification(alert);
        }
    }

    // Handle resolved alert
    async handleResolvedAlert(alert) {
        this.logInfo(`Alert resolved: ${alert.labels.alertname}`);
    }

    // Send admin notification
    async sendAdminNotification(alert) {
        const adminChatId = process.env.ADMIN_CHAT_ID;
        if (adminChatId && this.telegramBot) {
            const message = `🚨 *CRITICAL ALERT*\n\n*${alert.labels.alertname}*\n${alert.annotations.description}`;
            try {
                await this.telegramBot.telegram.sendMessage(adminChatId, message, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                this.logError('Failed to send admin notification', error);
            }
        }
    }

    // Get monitoring dashboard
    async getMonitoringDashboard(req, res) {
        try {
            const health = await this.healthCheck.getHealthStatus();
            const alertStats = this.alertManager.getAlertStats();
            const activeAlerts = this.alertManager.getActiveAlerts();
            
            const dashboard = {
                status: health.status,
                uptime: health.uptime,
                health: health.checks,
                alerts: {
                    active: activeAlerts.length,
                    stats: alertStats
                },
                metrics: {
                    cacheHitRatio: this.cacheStats.total > 0 ? this.cacheStats.hits / this.cacheStats.total : 0,
                    memoryUsage: process.memoryUsage(),
                    activeUsers: await this.getActiveUserCount()
                }
            };
            
            res.json(dashboard);
        } catch (error) {
            this.logError('Failed to get monitoring dashboard', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Helper methods for metrics collection
    getDatabaseErrorCount() {
        // This would be tracked by your database wrapper
        return 0;
    }

    getRedisErrorCount() {
        // This would be tracked by your Redis wrapper
        return 0;
    }

    getErrorCount() {
        // This would be tracked by your error handler
        return 0;
    }

    getTotalRequests() {
        // This would be tracked by your request middleware
        return 0;
    }

    getTradingFailures() {
        // This would be tracked by your trading operations
        return 0;
    }

    getAverageApiResponseTime() {
        // This would be calculated from your API call metrics
        return 0;
    }

    async getActiveUserCount() {
        try {
            // Query your database for active users in the last hour
            const result = await this.database.query(`
                SELECT COUNT(DISTINCT telegram_id) as count 
                FROM user_states 
                WHERE updated_at > NOW() - INTERVAL '1 hour'
            `);
            return result.rows[0]?.count || 0;
        } catch (error) {
            this.logError('Failed to get active user count', error);
            return 0;
        }
    }

    // Set Telegram bot instance for admin notifications
    setTelegramBot(bot) {
        this.telegramBot = bot;
        this.alertManager.setTelegramBot(bot);
    }

    // Logging methods
    logInfo(message, meta = {}) {
        if (this.logger) {
            this.logger.info(message, meta);
        } else {
            console.log(`[INFO] ${message}`, meta);
        }
    }

    logWarning(message, meta = {}) {
        if (this.logger) {
            this.logger.warn(message, meta);
        } else {
            console.warn(`[WARN] ${message}`, meta);
        }
    }

    logError(message, error, meta = {}) {
        if (this.logger) {
            this.logger.error(message, { error: error.message, stack: error.stack, ...meta });
        } else {
            console.error(`[ERROR] ${message}`, error, meta);
        }
    }

    // Cleanup
    destroy() {
        if (this.connectionInterval) {
            clearInterval(this.connectionInterval);
        }
        if (this.alertInterval) {
            clearInterval(this.alertInterval);
        }
        if (this.cacheResetInterval) {
            clearInterval(this.cacheResetInterval);
        }
        
        this.metricsMiddleware.destroy();
        this.alertManager.stopCleanup();
    }
}

module.exports = MonitoringSystem;
