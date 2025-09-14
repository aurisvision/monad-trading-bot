// Monitoring and observability system for Area51 Bot
const winston = require('winston');
const client = require('prom-client');

class MonitoringSystem {
    constructor() {
        this.setupLogger();
        this.setupMetrics();
        this.startMetricsCollection();
    }

    setupLogger() {
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

    setupMetrics() {
        // Create a Registry to register the metrics
        this.register = new client.Registry();
        
        // Add default metrics
        client.collectDefaultMetrics({ register: this.register });

        // Custom metrics for bot performance
        this.metrics = {
            // User activity metrics
            activeUsers: new client.Gauge({
                name: 'area51_active_users_total',
                help: 'Total number of active users',
                registers: [this.register]
            }),

            totalUsers: new client.Gauge({
                name: 'area51_total_users',
                help: 'Total number of registered users',
                registers: [this.register]
            }),

            // Transaction metrics
            transactionsTotal: new client.Counter({
                name: 'area51_transactions_total',
                help: 'Total number of transactions',
                labelNames: ['type', 'status'],
                registers: [this.register]
            }),

            transactionDuration: new client.Histogram({
                name: 'area51_transaction_duration_seconds',
                help: 'Transaction processing duration',
                labelNames: ['type'],
                buckets: [0.1, 0.5, 1, 2, 5, 10],
                registers: [this.register]
            }),

            // Database metrics
            databaseConnections: new client.Gauge({
                name: 'area51_database_connections',
                help: 'Number of active database connections',
                registers: [this.register]
            }),

            databaseQueryDuration: new client.Histogram({
                name: 'area51_database_query_duration_seconds',
                help: 'Database query duration',
                labelNames: ['operation'],
                buckets: [0.001, 0.01, 0.1, 0.5, 1, 2],
                registers: [this.register]
            }),

            // API metrics
            apiRequests: new client.Counter({
                name: 'area51_api_requests_total',
                help: 'Total API requests',
                labelNames: ['endpoint', 'status'],
                registers: [this.register]
            }),

            apiDuration: new client.Histogram({
                name: 'area51_api_duration_seconds',
                help: 'API request duration',
                labelNames: ['endpoint'],
                buckets: [0.1, 0.5, 1, 2, 5],
                registers: [this.register]
            }),

            // Cache metrics
            cacheHits: new client.Counter({
                name: 'area51_cache_hits_total',
                help: 'Total cache hits',
                registers: [this.register]
            }),

            cacheMisses: new client.Counter({
                name: 'area51_cache_misses_total',
                help: 'Total cache misses',
                registers: [this.register]
            }),

            // Error metrics
            errors: new client.Counter({
                name: 'area51_errors_total',
                help: 'Total errors',
                labelNames: ['type', 'severity'],
                registers: [this.register]
            }),

            // Performance metrics
            memoryUsage: new client.Gauge({
                name: 'area51_memory_usage_bytes',
                help: 'Memory usage in bytes',
                labelNames: ['type'],
                registers: [this.register]
            }),

            cpuUsage: new client.Gauge({
                name: 'area51_cpu_usage_percent',
                help: 'CPU usage percentage',
                registers: [this.register]
            })
        };
    }

    startMetricsCollection() {
        // Collect system metrics every 30 seconds
        setInterval(() => {
            this.collectSystemMetrics();
        }, 30000);

        // Collect application metrics every 60 seconds
        setInterval(() => {
            this.collectApplicationMetrics();
        }, 60000);
    }

    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        
        this.metrics.memoryUsage.set({ type: 'rss' }, memUsage.rss);
        this.metrics.memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
        this.metrics.memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
        this.metrics.memoryUsage.set({ type: 'external' }, memUsage.external);

        // CPU usage (simplified)
        const cpuUsage = process.cpuUsage();
        const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        this.metrics.cpuUsage.set(totalUsage);
    }

    async collectApplicationMetrics() {
        // This would be called by the main application to update metrics
        // Implementation depends on database access
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
        this.metrics.errorsTotal.inc({ type: 'general' });
    }

    logWarning(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    logWarn(message, meta = {}) {
        this.logger.warn(message, meta);
        this.metrics.errors.inc({ type: 'application', severity: 'warning' });
    }

    logDebug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Metric recording methods
    recordTransaction(type, status, duration) {
        this.metrics.transactionsTotal.inc({ type, status });
        this.metrics.transactionDuration.observe({ type }, duration);
        
        this.logInfo('Transaction recorded', { type, status, duration });
    }

    recordDatabaseQuery(operation, duration) {
        this.metrics.databaseQueryDuration.observe({ operation }, duration);
        
        if (duration > 1) {
            this.logWarn('Slow database query detected', { operation, duration });
        }
    }

    recordAPIRequest(endpoint, status, duration) {
        this.metrics.apiRequests.inc({ endpoint, status });
        this.metrics.apiDuration.observe({ endpoint }, duration);
        
        if (status >= 400) {
            this.logWarn('API request failed', { endpoint, status, duration });
        }
    }

    recordCacheHit() {
        this.metrics.cacheHits.inc();
    }

    recordCacheMiss() {
        this.metrics.cacheMisses.inc();
    }

    updateUserMetrics(activeCount, totalCount) {
        this.metrics.activeUsers.set(activeCount);
        this.metrics.totalUsers.set(totalCount);
    }

    updateDatabaseConnections(count) {
        this.metrics.databaseConnections.set(count);
    }

    // Health check endpoint
    async getHealthStatus() {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        return {
            status: 'healthy',
            uptime: uptime,
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external
            },
            timestamp: new Date().toISOString()
        };
    }

    // Metrics endpoint for Prometheus
    async getMetrics() {
        return this.register.metrics();
    }

    // Alert system
    checkAlerts() {
        const memUsage = process.memoryUsage();
        const memoryThreshold = 1024 * 1024 * 1024; // 1GB
        
        if (memUsage.heapUsed > memoryThreshold) {
            this.logError('High memory usage detected', null, {
                heapUsed: memUsage.heapUsed,
                threshold: memoryThreshold
            });
        }
    }

    // Performance monitoring wrapper
    async measurePerformance(operation, func) {
        const start = Date.now();
        try {
            const result = await func();
            const duration = (Date.now() - start) / 1000;
            
            this.logDebug('Operation completed', { operation, duration });
            return result;
        } catch (error) {
            const duration = (Date.now() - start) / 1000;
            this.logError(`Operation failed: ${operation}`, error, { duration });
            throw error;
        }
    }

    // Graceful shutdown
    async shutdown() {
        this.logInfo('Monitoring system shutting down');
        // Clear intervals and close connections
    }
}

module.exports = MonitoringSystem;
