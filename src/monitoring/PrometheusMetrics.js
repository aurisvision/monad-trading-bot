const promClient = require('prom-client');

class PrometheusMetrics {
    constructor() {
        // Create a Registry which registers the metrics
        this.register = new promClient.Registry();
        
        // Add a default label which is added to all metrics
        this.register.setDefaultLabels({
            app: 'area51-bot'
        });

        // Enable the collection of default metrics
        promClient.collectDefaultMetrics({ register: this.register });

        this.initializeCustomMetrics();
    }

    initializeCustomMetrics() {
        // HTTP Request metrics
        this.httpRequestsTotal = new promClient.Counter({
            name: 'http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code'],
            registers: [this.register]
        });

        this.httpRequestDuration = new promClient.Histogram({
            name: 'http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route'],
            buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
            registers: [this.register]
        });

        // Bot-specific metrics
        this.telegramMessagesTotal = new promClient.Counter({
            name: 'telegram_messages_total',
            help: 'Total number of Telegram messages processed',
            labelNames: ['type', 'status'],
            registers: [this.register]
        });

        this.activeUsersGauge = new promClient.Gauge({
            name: 'active_users_current',
            help: 'Current number of active users',
            registers: [this.register]
        });

        this.tradingOperationsTotal = new promClient.Counter({
            name: 'trading_operations_total',
            help: 'Total number of trading operations',
            labelNames: ['operation_type', 'status'],
            registers: [this.register]
        });

        this.tradingVolume = new promClient.Counter({
            name: 'trading_volume_mon_total',
            help: 'Total trading volume in MON',
            labelNames: ['operation_type'],
            registers: [this.register]
        });

        // Database metrics
        this.databaseConnectionsActive = new promClient.Gauge({
            name: 'database_connections_active',
            help: 'Number of active database connections',
            registers: [this.register]
        });

        this.databaseQueriesTotal = new promClient.Counter({
            name: 'database_queries_total',
            help: 'Total number of database queries',
            labelNames: ['operation', 'status'],
            registers: [this.register]
        });

        this.databaseQueryDuration = new promClient.Histogram({
            name: 'database_query_duration_seconds',
            help: 'Duration of database queries in seconds',
            labelNames: ['operation'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
            registers: [this.register]
        });

        // Redis metrics
        this.redisConnectionsActive = new promClient.Gauge({
            name: 'redis_connections_active',
            help: 'Number of active Redis connections',
            registers: [this.register]
        });

        this.redisOperationsTotal = new promClient.Counter({
            name: 'redis_operations_total',
            help: 'Total number of Redis operations',
            labelNames: ['operation', 'status'],
            registers: [this.register]
        });

        this.redisCacheHitRatio = new promClient.Gauge({
            name: 'redis_cache_hit_ratio',
            help: 'Redis cache hit ratio (0-1)',
            registers: [this.register]
        });

        // Error metrics
        this.errorsTotal = new promClient.Counter({
            name: 'errors_total',
            help: 'Total number of errors',
            labelNames: ['error_type', 'severity'],
            registers: [this.register]
        });

        // System metrics
        this.memoryUsageBytes = new promClient.Gauge({
            name: 'memory_usage_bytes',
            help: 'Memory usage in bytes',
            labelNames: ['type'],
            registers: [this.register]
        });

        this.cpuUsagePercent = new promClient.Gauge({
            name: 'cpu_usage_percent',
            help: 'CPU usage percentage',
            registers: [this.register]
        });

        // API metrics
        this.apiRequestsTotal = new promClient.Counter({
            name: 'api_requests_total',
            help: 'Total number of external API requests',
            labelNames: ['api_name', 'endpoint', 'status'],
            registers: [this.register]
        });

        this.apiResponseTime = new promClient.Histogram({
            name: 'api_response_time_seconds',
            help: 'External API response time in seconds',
            labelNames: ['api_name', 'endpoint'],
            buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 30],
            registers: [this.register]
        });
    }

    // HTTP metrics methods
    recordHttpRequest(method, route, statusCode, duration) {
        this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
        this.httpRequestDuration.observe({ method, route }, duration);
    }

    // Bot metrics methods
    recordTelegramMessage(type, status = 'success') {
        this.telegramMessagesTotal.inc({ type, status });
    }

    setActiveUsers(count) {
        this.activeUsersGauge.set(count);
    }

    recordTradingOperation(operationType, status, volume = 0) {
        this.tradingOperationsTotal.inc({ operation_type: operationType, status });
        if (status === 'success' && volume > 0) {
            this.tradingVolume.inc({ operation_type: operationType }, volume);
        }
    }

    // Database metrics methods
    setDatabaseConnections(count) {
        this.databaseConnectionsActive.set(count);
    }

    recordDatabaseQuery(operation, status, duration) {
        this.databaseQueriesTotal.inc({ operation, status });
        this.databaseQueryDuration.observe({ operation }, duration);
    }

    // Redis metrics methods
    setRedisConnections(count) {
        this.redisConnectionsActive.set(count);
    }

    recordRedisOperation(operation, status) {
        this.redisOperationsTotal.inc({ operation, status });
    }

    setCacheHitRatio(ratio) {
        this.redisCacheHitRatio.set(ratio);
    }

    // Error metrics methods
    recordError(errorType, severity = 'error') {
        this.errorsTotal.inc({ error_type: errorType, severity });
    }

    // System metrics methods
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
    }

    // API metrics methods
    recordApiRequest(apiName, endpoint, status, responseTime) {
        this.apiRequestsTotal.inc({ api_name: apiName, endpoint, status });
        this.apiResponseTime.observe({ api_name: apiName, endpoint }, responseTime);
    }

    // Get metrics for Prometheus scraping
    async getMetrics() {
        return await this.register.metrics();
    }

    // Get metrics in JSON format for debugging
    getMetricsAsJSON() {
        return this.register.getMetricsAsJSON();
    }

    // Start collecting system metrics periodically
    startSystemMetricsCollection(intervalMs = 30000) {
        this.updateSystemMetrics();
        this.systemMetricsInterval = setInterval(() => {
            this.updateSystemMetrics();
        }, intervalMs);
    }

    // Stop collecting system metrics
    stopSystemMetricsCollection() {
        if (this.systemMetricsInterval) {
            clearInterval(this.systemMetricsInterval);
            this.systemMetricsInterval = null;
        }
    }

    // Reset all metrics (useful for testing)
    reset() {
        this.register.resetMetrics();
    }
}

module.exports = PrometheusMetrics;
