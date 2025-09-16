/**
 * Unified Monitoring System for Area51 Bot
 * Combines Prometheus metrics, health checks, logging, and alerting
 * Supports both Grafana and internal dashboard
 */

const winston = require('winston');
const promClient = require('prom-client');
const os = require('os');

class UnifiedMonitoringSystem {
    constructor(database, redis, logger = null) {
        this.database = database;
        this.redis = redis;
        this.logger = logger;
        
        // Initialize components
        this.setupLogger();
        this.setupPrometheusMetrics();
        this.initializeCounters();
        this.startPeriodicTasks();
        
        // Bot reference for admin notifications
        this.telegramBot = null;
        
        // System start time
        this.startTime = Date.now();
        
        console.log('✅ Unified Monitoring System initialized');
    }

    // ==================== LOGGING SYSTEM ====================
    
    setupLogger() {
        if (!this.logger) {
            this.logger = winston.createLogger({
                level: process.env.LOG_LEVEL || 'info',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.errors({ stack: true }),
                    winston.format.json()
                ),
                defaultMeta: { service: 'area51-bot' },
                transports: [
                    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
                    new winston.transports.File({ filename: 'logs/combined.log' }),
                    new winston.transports.Console({
                        format: winston.format.combine(
                            winston.format.colorize(),
                            winston.format.simple()
                        )
                    })
                ]
            });
        }
    }

    // Logging methods
    logInfo(message, meta = {}) {
        this.logger.info(message, meta);
    }

    logError(message, error = null, meta = {}) {
        const errorMeta = error ? { 
            error: error.message, 
            stack: error.stack,
            ...meta 
        } : meta;
        
        this.logger.error(message, errorMeta);
        this.errorsTotal.inc({ error_type: 'general', severity: 'error' });
    }

    logWarning(message, meta = {}) {
        this.logger.warn(message, meta);
        this.errorsTotal.inc({ error_type: 'application', severity: 'warning' });
    }

    logDebug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // ==================== PROMETHEUS METRICS ====================
    
    setupPrometheusMetrics() {
        // Create registry
        this.register = new promClient.Registry();
        this.register.setDefaultLabels({ app: 'area51-bot' });
        
        // Enable default metrics (CPU, memory, etc.)
        promClient.collectDefaultMetrics({ register: this.register });

        // Custom metrics
        this.initializeCustomMetrics();
        this.initializeMetricValues();
        this.startSystemMetricsCollection();
    }

    initializeCustomMetrics() {
        // Bot status metric
        this.botStatus = new promClient.Gauge({
            name: 'area51_bot_status',
            help: 'Bot status (1 = running, 0 = stopped)',
            registers: [this.register]
        });

        // Process uptime metric
        this.processUptimeSeconds = new promClient.Gauge({
            name: 'process_uptime_seconds',
            help: 'Process uptime in seconds',
            registers: [this.register]
        });

        // User metrics
        this.activeUsersGauge = new promClient.Gauge({
            name: 'area51_active_users_total',
            help: 'Total number of active users',
            registers: [this.register]
        });

        this.totalUsersGauge = new promClient.Gauge({
            name: 'area51_total_users',
            help: 'Total number of registered users',
            registers: [this.register]
        });

        // Transaction metrics
        this.transactionsTotal = new promClient.Counter({
            name: 'area51_transactions_total',
            help: 'Total number of transactions',
            labelNames: ['type', 'status'],
            registers: [this.register]
        });

        this.transactionDuration = new promClient.Histogram({
            name: 'area51_transaction_duration_seconds',
            help: 'Transaction processing duration',
            labelNames: ['type'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
            registers: [this.register]
        });

        this.tradingVolume = new promClient.Counter({
            name: 'area51_trading_volume_mon_total',
            help: 'Total trading volume in MON',
            labelNames: ['operation_type'],
            registers: [this.register]
        });

        // Database metrics
        this.databaseConnectionsActive = new promClient.Gauge({
            name: 'area51_database_connections_active',
            help: 'Number of active database connections',
            registers: [this.register]
        });

        this.databaseQueriesTotal = new promClient.Counter({
            name: 'area51_database_queries_total',
            help: 'Total number of database queries',
            labelNames: ['operation', 'status'],
            registers: [this.register]
        });

        this.databaseQueryDuration = new promClient.Histogram({
            name: 'area51_database_query_duration_seconds',
            help: 'Database query duration',
            labelNames: ['operation'],
            buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
            registers: [this.register]
        });

        // Redis metrics
        this.redisConnectionsActive = new promClient.Gauge({
            name: 'area51_redis_connections_active',
            help: 'Number of active Redis connections',
            registers: [this.register]
        });

        this.redisCacheHitRatio = new promClient.Gauge({
            name: 'area51_redis_cache_hit_ratio',
            help: 'Redis cache hit ratio (0-1)',
            registers: [this.register]
        });

        this.cacheHitsTotal = new promClient.Counter({
            name: 'area51_cache_hits_total',
            help: 'Total cache hits',
            registers: [this.register]
        });

        this.cacheMissesTotal = new promClient.Counter({
            name: 'area51_cache_misses_total',
            help: 'Total cache misses',
            registers: [this.register]
        });

        // API metrics
        this.apiRequestsTotal = new promClient.Counter({
            name: 'area51_api_requests_total',
            help: 'Total API requests',
            labelNames: ['endpoint', 'status'],
            registers: [this.register]
        });

        this.apiDuration = new promClient.Histogram({
            name: 'area51_api_duration_seconds',
            help: 'API request duration',
            labelNames: ['endpoint'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
            registers: [this.register]
        });

        // Telegram metrics
        this.telegramMessagesTotal = new promClient.Counter({
            name: 'area51_telegram_messages_total',
            help: 'Total Telegram messages processed',
            labelNames: ['type', 'status'],
            registers: [this.register]
        });

        // Error metrics
        this.errorsTotal = new promClient.Counter({
            name: 'area51_errors_total',
            help: 'Total errors',
            labelNames: ['error_type', 'severity'],
            registers: [this.register]
        });

        // System metrics
        this.memoryUsageBytes = new promClient.Gauge({
            name: 'area51_memory_usage_bytes',
            help: 'Memory usage in bytes',
            labelNames: ['type'],
            registers: [this.register]
        });

        this.cpuUsagePercent = new promClient.Gauge({
            name: 'area51_cpu_usage_percent',
            help: 'CPU usage percentage',
            registers: [this.register]
        });
    }

    initializeMetricValues() {
        // Initialize process uptime
        this.processUptimeSeconds.set(process.uptime());
        
        // Initialize bot status as running
        this.botStatus.set(1);
        
        // Initialize system metrics
        this.updateSystemMetrics();
        
        // Initialize other gauges with default values
        this.activeUsersGauge.set(0);
        this.totalUsersGauge.set(0);
        this.databaseConnectionsActive.set(0);
        this.redisConnectionsActive.set(0);
        this.redisCacheHitRatio.set(0);
    }

    updateSystemMetrics() {
        const memUsage = process.memoryUsage();
        this.memoryUsageBytes.set({ type: 'rss' }, memUsage.rss);
        this.memoryUsageBytes.set({ type: 'heapTotal' }, memUsage.heapTotal);
        this.memoryUsageBytes.set({ type: 'heapUsed' }, memUsage.heapUsed);
        this.memoryUsageBytes.set({ type: 'external' }, memUsage.external);

        // CPU usage (simplified - for more accurate CPU usage, use external library)
        const cpuUsage = process.cpuUsage();
        const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        this.cpuUsagePercent.set(totalUsage);

        // Process uptime in seconds
        this.processUptimeSeconds.set(process.uptime());

        // Bot status (assume running if we're updating metrics)
        this.botStatus.set(1);
    }

    startSystemMetricsCollection() {
        // Update system metrics every 30 seconds
        this.systemMetricsInterval = setInterval(() => {
            this.updateSystemMetrics();
        }, 30000);

        // Update connection counts every 30 seconds
        this.connectionInterval = setInterval(() => {
            this.updateConnectionCounts();
        }, 30000);
    }

    // ==================== COUNTERS & TRACKING ====================
    
    initializeCounters() {
        this.cacheStats = {
            hits: 0,
            misses: 0,
            total: 0
        };
    }

    // ==================== METRIC RECORDING METHODS ====================
    
    // User metrics
    updateActiveUsers(count) {
        this.activeUsersGauge.set(count);
    }

    updateTotalUsers(count) {
        this.totalUsersGauge.set(count);
    }

    // Transaction metrics
    recordTransaction(type, status, duration = 0, volume = 0) {
        this.transactionsTotal.inc({ type, status });
        if (duration > 0) {
            this.transactionDuration.observe({ type }, duration);
        }
        if (status === 'success' && volume > 0) {
            this.tradingVolume.inc({ operation_type: type }, volume);
        }
        this.logInfo('Transaction recorded', { type, status, duration, volume });
    }

    // Database metrics
    recordDatabaseQuery(operation, status, duration) {
        this.databaseQueriesTotal.inc({ operation, status });
        this.databaseQueryDuration.observe({ operation }, duration);
        
        if (duration > 1) {
            this.logWarning('Slow database query detected', { operation, duration });
        }
    }

    updateDatabaseConnections(count) {
        this.databaseConnectionsActive.set(count);
    }

    // Redis metrics
    updateRedisConnections(count) {
        this.redisConnectionsActive.set(count);
    }

    recordCacheHit() {
        this.cacheHitsTotal.inc();
        this.cacheStats.hits++;
        this.cacheStats.total++;
        this.updateCacheHitRatio();
    }

    recordCacheMiss() {
        this.cacheMissesTotal.inc();
        this.cacheStats.misses++;
        this.cacheStats.total++;
        this.updateCacheHitRatio();
    }

    updateCacheHitRatio() {
        const ratio = this.cacheStats.total > 0 ? this.cacheStats.hits / this.cacheStats.total : 0;
        this.redisCacheHitRatio.set(ratio);
    }

    // API metrics
    recordAPIRequest(endpoint, status, duration) {
        this.apiRequestsTotal.inc({ endpoint, status });
        this.apiDuration.observe({ endpoint }, duration);
        
        if (status >= 400) {
            this.logWarning('API request failed', { endpoint, status, duration });
        }
    }

    // Telegram metrics
    recordTelegramMessage(type, status = 'success') {
        this.telegramMessagesTotal.inc({ type, status });
    }

    // Error metrics
    recordError(errorType, severity = 'error') {
        this.errorsTotal.inc({ error_type: errorType, severity });
    }

    // ==================== OPERATION WRAPPERS ====================
    
    wrapDatabaseOperation(operation, operationName) {
        return async (...args) => {
            const start = Date.now();
            let status = 'success';

            try {
                const result = await operation.apply(this, args);
                return result;
            } catch (error) {
                status = 'error';
                this.recordError('database_operation', 'error');
                throw error;
            } finally {
                const duration = (Date.now() - start) / 1000;
                this.recordDatabaseQuery(operationName, status, duration);
            }
        };
    }

    wrapRedisOperation(operation, operationName) {
        return async (...args) => {
            try {
                const result = await operation.apply(this, args);
                return result;
            } catch (error) {
                this.recordError('redis_operation', 'error');
                throw error;
            }
        };
    }

    wrapTradingOperation(operation, operationType) {
        return async (...args) => {
            const start = Date.now();
            let status = 'success';
            let volume = 0;

            try {
                const result = await operation.apply(this, args);
                
                if (result && result.amount) {
                    volume = parseFloat(result.amount) || 0;
                }
                
                return result;
            } catch (error) {
                status = 'error';
                this.recordError('trading_operation', 'error');
                throw error;
            } finally {
                const duration = (Date.now() - start) / 1000;
                this.recordTransaction(operationType, status, duration, volume);
            }
        };
    }

    wrapApiCall(apiCall, apiName, endpoint) {
        return async (...args) => {
            const start = Date.now();
            let status = 'success';

            try {
                const result = await apiCall.apply(this, args);
                return result;
            } catch (error) {
                status = 'error';
                this.recordError('api_call', 'error');
                throw error;
            } finally {
                const duration = (Date.now() - start) / 1000;
                this.recordAPIRequest(`${apiName}_${endpoint}`, status, duration);
            }
        };
    }

    // ==================== HEALTH CHECK SYSTEM ====================
    
    async getHealthStatus() {
        const checks = await Promise.allSettled([
            this.checkDatabase(),
            this.checkRedis(),
            this.checkMemory(),
            this.checkSystem()
        ]);

        const results = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: this.getUptime(),
            checks: {
                database: this.getCheckResult(checks[0]),
                redis: this.getCheckResult(checks[1]),
                memory: this.getCheckResult(checks[2]),
                system: this.getCheckResult(checks[3])
            }
        };

        // Determine overall status
        const hasFailures = Object.values(results.checks).some(check => check.status === 'unhealthy');
        const hasWarnings = Object.values(results.checks).some(check => check.status === 'warning');
        
        if (hasFailures) {
            results.status = 'unhealthy';
        } else if (hasWarnings) {
            results.status = 'warning';
        }

        return results;
    }

    async checkDatabase() {
        if (!this.database) {
            return { status: 'warning', message: 'Database not configured' };
        }

        try {
            const start = Date.now();
            await this.database.query('SELECT 1');
            const responseTime = Date.now() - start;

            return {
                status: responseTime < 1000 ? 'healthy' : 'warning',
                responseTime: `${responseTime}ms`,
                message: responseTime < 1000 ? 'Database responding normally' : 'Database response slow'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                message: 'Database connection failed'
            };
        }
    }

    async checkRedis() {
        if (!this.redis) {
            return { status: 'warning', message: 'Redis not configured' };
        }

        try {
            const start = Date.now();
            await this.redis.ping();
            const responseTime = Date.now() - start;

            return {
                status: responseTime < 500 ? 'healthy' : 'warning',
                responseTime: `${responseTime}ms`,
                message: responseTime < 500 ? 'Redis responding normally' : 'Redis response slow'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                message: 'Redis connection failed'
            };
        }
    }

    async checkMemory() {
        const memUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

        let status = 'healthy';
        let message = 'Memory usage normal';

        if (memoryUsagePercent > 95 || heapUsagePercent > 95) {
            status = 'unhealthy';
            message = 'Memory usage critical';
        } else if (memoryUsagePercent > 85 || heapUsagePercent > 85) {
            status = 'warning';
            message = 'Memory usage high';
        }

        return {
            status,
            details: {
                systemMemoryUsage: `${memoryUsagePercent.toFixed(1)}%`,
                heapUsage: `${heapUsagePercent.toFixed(1)}%`
            },
            message
        };
    }

    async checkSystem() {
        const loadAvg = os.loadavg();
        const cpuCount = os.cpus().length;
        const loadPercent = (loadAvg[0] / cpuCount) * 100;

        let status = 'healthy';
        let message = 'System load normal';

        if (loadPercent > 90) {
            status = 'unhealthy';
            message = 'System load critical';
        } else if (loadPercent > 70) {
            status = 'warning';
            message = 'System load high';
        }

        return {
            status,
            details: {
                loadPercent: `${loadPercent.toFixed(1)}%`,
                cpuCount
            },
            message
        };
    }

    getCheckResult(settledResult) {
        if (settledResult.status === 'fulfilled') {
            return settledResult.value;
        } else {
            return {
                status: 'unhealthy',
                error: settledResult.reason.message,
                message: 'Health check failed'
            };
        }
    }

    getUptime() {
        const uptimeMs = Date.now() - this.startTime;
        const uptimeSeconds = Math.floor(uptimeMs / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    // ==================== PERIODIC TASKS ====================
    
    startPeriodicTasks() {
        // Update connection counts every 30 seconds
        this.connectionUpdateInterval = setInterval(() => {
            this.updateConnectionCounts();
        }, 30000);

        // Reset cache stats every hour
        this.cacheResetInterval = setInterval(() => {
            this.resetCacheStats();
        }, 3600000);

        // Update user metrics every 5 minutes
        this.userMetricsInterval = setInterval(() => {
            this.updateUserMetrics();
        }, 300000);
    }

    async updateConnectionCounts() {
        try {
            // Database connections
            if (this.database && this.database.pool) {
                const dbConnections = this.database.pool.totalCount || 0;
                this.updateDatabaseConnections(dbConnections);
            }

            // Redis connections
            if (this.redis && this.redis.status === 'ready') {
                this.updateRedisConnections(1);
            } else {
                this.updateRedisConnections(0);
            }
        } catch (error) {
            this.logError('Failed to update connection counts', error);
        }
    }

    async updateUserMetrics() {
        try {
            if (this.database) {
                // Active users in last hour (using users table with last_activity)
                const activeResult = await this.database.query(`
                    SELECT COUNT(DISTINCT telegram_id) as count 
                    FROM users 
                    WHERE last_activity > NOW() - INTERVAL '1 hour'
                `);
                this.updateActiveUsers(activeResult.rows[0]?.count || 0);

                // Total users
                const totalResult = await this.database.query(`
                    SELECT COUNT(DISTINCT telegram_id) as count 
                    FROM users
                `);
                this.updateTotalUsers(totalResult.rows[0]?.count || 0);
            }
        } catch (error) {
            this.logError('Failed to update user metrics', error);
        }
    }

    resetCacheStats() {
        this.cacheStats = {
            hits: 0,
            misses: 0,
            total: 0
        };
    }

    // ==================== ENDPOINTS & MIDDLEWARE ====================
    
    initializeEndpoints(app) {
        // Prometheus metrics endpoint
        app.get('/metrics', async (req, res) => {
            try {
                const metrics = await this.register.metrics();
                res.set('Content-Type', this.register.contentType);
                res.end(metrics);
            } catch (error) {
                res.status(500).json({ error: 'Failed to get metrics' });
            }
        });

        // Health check endpoints
        app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealthStatus();
                const statusCode = health.status === 'healthy' ? 200 : 
                                 health.status === 'warning' ? 200 : 503;
                res.status(statusCode).json(health);
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        app.get('/health/live', (req, res) => {
            res.status(200).json({
                status: 'alive',
                timestamp: new Date().toISOString(),
                uptime: this.getUptime()
            });
        });

        app.get('/health/ready', async (req, res) => {
            try {
                const dbCheck = await this.checkDatabase();
                const isReady = dbCheck.status !== 'unhealthy';

                const statusCode = isReady ? 200 : 503;
                res.status(statusCode).json({
                    status: isReady ? 'ready' : 'not_ready',
                    timestamp: new Date().toISOString(),
                    checks: { database: dbCheck.status }
                });
            } catch (error) {
                res.status(503).json({
                    status: 'not_ready',
                    timestamp: new Date().toISOString(),
                    error: error.message
                });
            }
        });

        // Alert webhook endpoint
        app.post('/alerts', (req, res) => {
            try {
                const alerts = req.body.alerts || [];
                this.logInfo('Received alerts from Prometheus', { 
                    alertCount: alerts.length,
                    alerts: alerts.map(alert => ({
                        alertname: alert.labels?.alertname,
                        status: alert.status,
                        severity: alert.labels?.severity
                    }))
                });

                // Process each alert
                alerts.forEach(alert => {
                    if (alert.status === 'firing') {
                        const severity = alert.labels?.severity || 'warning';
                        const alertname = alert.labels?.alertname || 'Unknown';
                        const message = `Alert: ${alertname}\nStatus: ${alert.status}\nDescription: ${alert.annotations?.description || 'No description'}`;
                        
                        this.sendAdminAlert(message, severity);
                    }
                });

                res.json({ status: 'ok', processed: alerts.length });
            } catch (error) {
                this.logError('Error processing alerts', error);
                res.status(500).json({ error: 'Failed to process alerts' });
            }
        });

        // Internal monitoring dashboard
        app.get('/monitoring', async (req, res) => {
            try {
                const health = await this.getHealthStatus();
                const dashboard = {
                    status: health.status,
                    uptime: health.uptime,
                    health: health.checks,
                    metrics: {
                        cacheHitRatio: this.cacheStats.total > 0 ? (this.cacheStats.hits / this.cacheStats.total * 100).toFixed(1) + '%' : '0%',
                        memoryUsage: process.memoryUsage(),
                        activeUsers: await this.getActiveUserCount()
                    },
                    timestamp: new Date().toISOString()
                };
                
                res.json(dashboard);
            } catch (error) {
                this.logError('Failed to get monitoring dashboard', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    // Telegram middleware for bot metrics
    getTelegramMiddleware() {
        return async (ctx, next) => {
            let messageType = 'unknown';
            let status = 'success';

            try {
                // Determine message type
                if (ctx.message) {
                    messageType = ctx.message.text ? 'text' : 'media';
                } else if (ctx.callbackQuery) {
                    messageType = 'callback_query';
                } else if (ctx.inlineQuery) {
                    messageType = 'inline_query';
                }

                await next();
            } catch (error) {
                status = 'error';
                this.recordError('telegram_handler', 'error');
                throw error;
            } finally {
                this.recordTelegramMessage(messageType, status);
            }
        };
    }

    // ==================== ADMIN NOTIFICATIONS ====================
    
    setTelegramBot(bot) {
        this.telegramBot = bot;
    }

    async sendAdminAlert(message, severity = 'warning') {
        const adminChatId = process.env.ADMIN_CHAT_ID;
        if (adminChatId && this.telegramBot) {
            const emoji = severity === 'critical' ? '🚨' : '⚠️';
            const alertMessage = `${emoji} *ALERT*\n\n${message}`;
            
            try {
                await this.telegramBot.telegram.sendMessage(adminChatId, alertMessage, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                this.logError('Failed to send admin alert', error);
            }
        }
    }

    // ==================== UTILITY METHODS ====================
    
    async getActiveUserCount() {
        try {
            if (this.database) {
                // Use users table with last_activity for accurate active user count
                const result = await this.database.query(`
                    SELECT COUNT(DISTINCT telegram_id) as count 
                    FROM users 
                    WHERE last_activity > NOW() - INTERVAL '1 hour'
                `);
                return result.rows[0]?.count || 0;
            }
            return 0;
        } catch (error) {
            this.logError('Failed to get active user count', error);
            return 0;
        }
    }

    setBotStatus(running) {
        this.botStatus.set(running ? 1 : 0);
    }

    // ==================== CLEANUP ====================
    
    destroy() {
        // Clear all intervals
        if (this.systemMetricsInterval) clearInterval(this.systemMetricsInterval);
        if (this.connectionInterval) clearInterval(this.connectionInterval);
        if (this.connectionUpdateInterval) clearInterval(this.connectionUpdateInterval);
        if (this.cacheResetInterval) clearInterval(this.cacheResetInterval);
        if (this.userMetricsInterval) clearInterval(this.userMetricsInterval);
        
        // Set bot status to stopped
        this.setBotStatus(false);
        
        this.logInfo('Unified Monitoring System destroyed');
    }
}

module.exports = UnifiedMonitoringSystem;
