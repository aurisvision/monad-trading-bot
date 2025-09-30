/**
 * Health Endpoint for Production Monitoring
 * Provides HTTP endpoint for health checks and metrics
 */

const http = require('http');
const url = require('url');

class HealthEndpoint {
    constructor(productionMonitoring, port = 3001) {
        this.monitoring = productionMonitoring;
        this.port = port;
        this.server = null;
        this.startTime = Date.now();
    }

    /**
     * Start the health endpoint server
     */
    start() {
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.server.listen(this.port, () => {
            console.log(`🏥 Health endpoint running on port ${this.port}`);
        });

        this.server.on('error', (error) => {
            console.error('❌ Health endpoint error:', error);
        });
    }

    /**
     * Stop the health endpoint server
     */
    stop() {
        if (this.server) {
            this.server.close();
            console.log('🏥 Health endpoint stopped');
        }
    }

    /**
     * Handle incoming HTTP requests
     */
    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname;

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle OPTIONS request
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Only allow GET requests
        if (req.method !== 'GET') {
            this.sendResponse(res, 405, { error: 'Method not allowed' });
            return;
        }

        try {
            switch (path) {
                case '/health':
                    await this.handleHealthCheck(res);
                    break;
                case '/metrics':
                    await this.handleMetrics(res);
                    break;
                case '/status':
                    await this.handleStatus(res);
                    break;
                case '/ready':
                    await this.handleReadiness(res);
                    break;
                case '/live':
                    await this.handleLiveness(res);
                    break;
                default:
                    this.sendResponse(res, 404, { error: 'Endpoint not found' });
            }
        } catch (error) {
            console.error('❌ Health endpoint error:', error);
            this.sendResponse(res, 500, { error: 'Internal server error' });
        }
    }

    /**
     * Handle /health endpoint - comprehensive health check
     */
    async handleHealthCheck(res) {
        const health = await this.getHealthStatus();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        this.sendResponse(res, statusCode, health);
    }

    /**
     * Handle /metrics endpoint - detailed metrics
     */
    async handleMetrics(res) {
        const metrics = this.monitoring.exportMetrics();
        this.sendResponse(res, 200, metrics);
    }

    /**
     * Handle /status endpoint - simple status
     */
    async handleStatus(res) {
        const status = {
            status: 'running',
            version: '3.0.0',
            architecture: 'modular',
            uptime: this.getUptime(),
            timestamp: new Date().toISOString()
        };
        this.sendResponse(res, 200, status);
    }

    /**
     * Handle /ready endpoint - readiness probe
     */
    async handleReadiness(res) {
        const ready = await this.checkReadiness();
        const statusCode = ready.ready ? 200 : 503;
        this.sendResponse(res, statusCode, ready);
    }

    /**
     * Handle /live endpoint - liveness probe
     */
    async handleLiveness(res) {
        const live = {
            alive: true,
            uptime: this.getUptime(),
            timestamp: new Date().toISOString()
        };
        this.sendResponse(res, 200, live);
    }

    /**
     * Get comprehensive health status
     */
    async getHealthStatus() {
        const metrics = this.monitoring.getMetricsSummary();
        
        return {
            status: this.determineOverallStatus(metrics),
            version: '3.0.0',
            architecture: 'modular',
            uptime: metrics.uptime,
            services: {
                database: metrics.health.database,
                redis: metrics.health.redis,
                monadRpc: metrics.health.monadRpc
            },
            metrics: {
                requests: metrics.requests,
                errors: metrics.errors,
                errorRate: Math.round(metrics.errorRate * 10000) / 100, // Percentage with 2 decimals
                activeUsers: metrics.activeUsers,
                transactions: metrics.transactions,
                transactionSuccessRate: Math.round(metrics.transactionSuccessRate * 10000) / 100,
                averageResponseTime: Math.round(metrics.averageResponseTime)
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Check if the service is ready to accept traffic
     */
    async checkReadiness() {
        const metrics = this.monitoring.getMetricsSummary();
        
        // Service is ready if:
        // 1. Database is connected
        // 2. Redis is connected
        // 3. Error rate is below 50%
        const ready = 
            metrics.health.database === 'healthy' &&
            metrics.health.redis === 'healthy' &&
            metrics.errorRate < 0.5;

        return {
            ready,
            services: {
                database: metrics.health.database === 'healthy',
                redis: metrics.health.redis === 'healthy',
                monadRpc: metrics.health.monadRpc === 'healthy'
            },
            errorRate: metrics.errorRate,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Determine overall status based on metrics
     */
    determineOverallStatus(metrics) {
        // Critical issues
        if (metrics.errorRate > 0.5) return 'critical';
        if (metrics.health.database === 'unhealthy') return 'critical';
        if (metrics.health.redis === 'unhealthy') return 'critical';

        // Warning issues
        if (metrics.errorRate > 0.1) return 'warning';
        if (metrics.averageResponseTime > 2000) return 'warning';
        if (metrics.health.monadRpc === 'unhealthy') return 'warning';

        // Degraded performance
        if (metrics.errorRate > 0.05) return 'degraded';
        if (metrics.averageResponseTime > 1000) return 'degraded';

        return 'healthy';
    }

    /**
     * Get service uptime
     */
    getUptime() {
        const uptimeMs = Date.now() - this.startTime;
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    /**
     * Send HTTP response
     */
    sendResponse(res, statusCode, data) {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        });
        res.end(JSON.stringify(data, null, 2));
    }
}

module.exports = HealthEndpoint;