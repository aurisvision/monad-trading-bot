/**
 * HealthServerManager - Manages health check server for Area51 Bot
 * Extracted from main bot file for better modularity and maintainability
 */

const http = require('http');

class HealthServerManager {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.server = null;
        this.port = process.env.HEALTH_PORT || 3000;
        this.maxRetries = 5;
        this.retryDelay = 1000; // 1 second
    }

    /**
     * Start health server with retry logic
     */
    async startHealthServer() {
        console.log('🏥 Starting health server...');
        
        let attempts = 0;
        let currentPort = this.port;

        while (attempts < this.maxRetries) {
            try {
                await this.createServer(currentPort);
                console.log(`✅ Health server started on port ${currentPort}`);
                this.port = currentPort;
                return;
                
            } catch (error) {
                attempts++;
                
                if (error.code === 'EADDRINUSE') {
                    console.log(`⚠️ Port ${currentPort} is in use, trying port ${currentPort + 1}...`);
                    currentPort++;
                } else {
                    console.error(`❌ Health server error (attempt ${attempts}/${this.maxRetries}):`, error.message);
                    
                    if (attempts < this.maxRetries) {
                        console.log(`⏳ Retrying in ${this.retryDelay}ms...`);
                        await this.sleep(this.retryDelay);
                        this.retryDelay *= 2; // Exponential backoff
                    }
                }
                
                if (attempts >= this.maxRetries) {
                    throw new Error(`Failed to start health server after ${this.maxRetries} attempts`);
                }
            }
        }
    }

    /**
     * Create HTTP server
     */
    async createServer(port) {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.on('error', (error) => {
                reject(error);
            });

            this.server.listen(port, () => {
                resolve();
            });
        });
    }

    /**
     * Handle HTTP requests
     */
    async handleRequest(req, res) {
        try {
            const url = req.url;
            const method = req.method;

            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            // Handle preflight requests
            if (method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            // Route requests
            switch (url) {
                case '/health':
                    await this.handleHealthCheck(req, res);
                    break;
                    
                case '/status':
                    await this.handleStatusCheck(req, res);
                    break;
                    
                case '/metrics':
                    await this.handleMetrics(req, res);
                    break;
                    
                case '/info':
                    await this.handleInfo(req, res);
                    break;
                    
                default:
                    await this.handleNotFound(req, res);
                    break;
            }

        } catch (error) {
            this.dependencies.monitoring?.logError('Health server request error', error, {
                url: req.url,
                method: req.method
            });
            
            await this.handleError(res, error);
        }
    }

    /**
     * Handle health check endpoint
     */
    async handleHealthCheck(req, res) {
        try {
            const healthStatus = await this.getHealthStatus();
            
            const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
            
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(healthStatus, null, 2));
            
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    /**
     * Handle status check endpoint
     */
    async handleStatusCheck(req, res) {
        try {
            const status = await this.getDetailedStatus();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status, null, 2));
            
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    /**
     * Handle metrics endpoint
     */
    async handleMetrics(req, res) {
        try {
            const metrics = await this.getMetrics();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(metrics, null, 2));
            
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    /**
     * Handle info endpoint
     */
    async handleInfo(req, res) {
        try {
            const info = await this.getBotInfo();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(info, null, 2));
            
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    /**
     * Handle 404 errors
     */
    async handleNotFound(req, res) {
        const response = {
            error: 'Not Found',
            message: 'Endpoint not found',
            availableEndpoints: ['/health', '/status', '/metrics', '/info']
        };
        
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
    }

    /**
     * Handle errors
     */
    async handleError(res, error) {
        const response = {
            error: 'Internal Server Error',
            message: 'An error occurred while processing the request',
            timestamp: new Date().toISOString()
        };
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
    }

    /**
     * Get basic health status
     */
    async getHealthStatus() {
        try {
            const checks = await Promise.allSettled([
                this.checkDatabase(),
                this.checkRedis(),
                this.checkMonorailAPI(),
                this.checkBot()
            ]);

            const results = {
                database: checks[0].status === 'fulfilled' ? checks[0].value : { status: 'unhealthy', error: checks[0].reason?.message },
                redis: checks[1].status === 'fulfilled' ? checks[1].value : { status: 'unhealthy', error: checks[1].reason?.message },
                monorailAPI: checks[2].status === 'fulfilled' ? checks[2].value : { status: 'unhealthy', error: checks[2].reason?.message },
                bot: checks[3].status === 'fulfilled' ? checks[3].value : { status: 'unhealthy', error: checks[3].reason?.message }
            };

            const allHealthy = Object.values(results).every(check => check.status === 'healthy');
            
            return {
                status: allHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                checks: results
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    /**
     * Get detailed status
     */
    async getDetailedStatus() {
        try {
            const healthStatus = await this.getHealthStatus();
            const uptime = process.uptime();
            const memoryUsage = process.memoryUsage();
            
            return {
                ...healthStatus,
                uptime: {
                    seconds: Math.floor(uptime),
                    human: this.formatUptime(uptime)
                },
                memory: {
                    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
                    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
                    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
                    external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
                },
                environment: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            };
            
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get metrics
     */
    async getMetrics() {
        try {
            const metrics = {
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            };

            // Add custom metrics if monitoring is available
            if (this.dependencies.monitoring) {
                try {
                    const customMetrics = await this.dependencies.monitoring.getMetrics();
                    metrics.custom = customMetrics;
                } catch (error) {
                    metrics.custom = { error: 'Failed to get custom metrics' };
                }
            }

            return metrics;
            
        } catch (error) {
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get bot info
     */
    async getBotInfo() {
        try {
            return {
                name: 'Area51 Trading Bot',
                version: '1.0.0',
                description: 'Telegram Trading Bot for Monad Blockchain',
                timestamp: new Date().toISOString(),
                features: [
                    'Wallet Management',
                    'Portfolio Tracking',
                    'Token Trading',
                    'Auto Buy/Sell',
                    'Settings Management',
                    'Real-time Monitoring'
                ],
                endpoints: {
                    health: '/health',
                    status: '/status',
                    metrics: '/metrics',
                    info: '/info'
                }
            };
            
        } catch (error) {
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Check database connectivity
     */
    async checkDatabase() {
        try {
            if (!this.dependencies.database) {
                return { status: 'unhealthy', error: 'Database not initialized' };
            }

            // Try a simple query
            await this.dependencies.database.query('SELECT 1');
            
            return { status: 'healthy', responseTime: Date.now() };
            
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Check Redis connectivity
     */
    async checkRedis() {
        try {
            if (!this.dependencies.redis) {
                return { status: 'unhealthy', error: 'Redis not initialized' };
            }

            // Try a simple ping
            const startTime = Date.now();
            await this.dependencies.redis.ping();
            const responseTime = Date.now() - startTime;
            
            return { status: 'healthy', responseTime };
            
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Check Monorail API connectivity
     */
    async checkMonorailAPI() {
        try {
            if (!this.dependencies.monorailAPI) {
                return { status: 'unhealthy', error: 'Monorail API not initialized' };
            }

            // Try a simple API call
            const startTime = Date.now();
            await this.dependencies.monorailAPI.checkHealth();
            const responseTime = Date.now() - startTime;
            
            return { status: 'healthy', responseTime };
            
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Check bot status
     */
    async checkBot() {
        try {
            if (!this.dependencies.bot) {
                return { status: 'unhealthy', error: 'Bot not initialized' };
            }

            // Check if bot is running
            const botInfo = await this.dependencies.bot.telegram.getMe();
            
            return { 
                status: 'healthy', 
                botUsername: botInfo.username,
                botId: botInfo.id
            };
            
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Format uptime in human readable format
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0) parts.push(`${secs}s`);

        return parts.join(' ') || '0s';
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Stop health server
     */
    async stopHealthServer() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    console.log('🏥 Health server stopped');
                    resolve();
                });
            });
        }
    }

    /**
     * Get server info
     */
    getServerInfo() {
        return {
            port: this.port,
            running: !!this.server,
            endpoints: ['/health', '/status', '/metrics', '/info']
        };
    }
}

module.exports = HealthServerManager;