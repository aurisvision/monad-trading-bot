const os = require('os');
const v8 = require('v8');

class HealthCheck {
    constructor(database, redis, monitoring) {
        this.database = database;
        this.redis = redis;
        this.monitoring = monitoring;
        this.startTime = Date.now();
    }

    // Main health check endpoint
    async getHealthStatus() {
        const checks = await Promise.allSettled([
            this.checkDatabase(),
            this.checkRedis(),
            this.checkMemory(),
            this.checkDisk(),
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
                disk: this.getCheckResult(checks[3]),
                system: this.getCheckResult(checks[4])
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

    // Database health check
    async checkDatabase() {
        try {
            const start = Date.now();
            await this.database.query('SELECT 1');
            const responseTime = Date.now() - start;

            const poolStats = this.database.pool ? {
                totalConnections: this.database.pool.totalCount,
                idleConnections: this.database.pool.idleCount,
                waitingClients: this.database.pool.waitingCount
            } : null;

            return {
                status: responseTime < 1000 ? 'healthy' : 'warning',
                responseTime: `${responseTime}ms`,
                details: poolStats,
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

    // Redis health check
    async checkRedis() {
        if (!this.redis) {
            return {
                status: 'warning',
                message: 'Redis not configured'
            };
        }

        try {
            const start = Date.now();
            await this.redis.ping();
            const responseTime = Date.now() - start;

            const info = await this.redis.info('memory');
            const memoryInfo = this.parseRedisInfo(info);

            return {
                status: responseTime < 500 ? 'healthy' : 'warning',
                responseTime: `${responseTime}ms`,
                details: {
                    usedMemory: memoryInfo.used_memory_human,
                    connectedClients: memoryInfo.connected_clients
                },
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

    // Memory health check
    async checkMemory() {
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        // Use actual heap size limit instead of current heap total
        const heapUsagePercent = (memUsage.heapUsed / heapStats.heap_size_limit) * 100;

        let status = 'healthy';
        let message = 'Memory usage normal';

        if (memoryUsagePercent > 90 || heapUsagePercent > 90) {
            status = 'unhealthy';
            message = 'Memory usage critical';
        } else if (memoryUsagePercent > 80 || heapUsagePercent > 80) {
            status = 'warning';
            message = 'Memory usage high';
        }

        return {
            status,
            details: {
                systemMemoryUsage: `${memoryUsagePercent.toFixed(1)}%`,
                heapUsage: `${heapUsagePercent.toFixed(1)}%`,
                rss: this.formatBytes(memUsage.rss),
                heapTotal: this.formatBytes(memUsage.heapTotal),
                heapUsed: this.formatBytes(memUsage.heapUsed),
                heapLimit: this.formatBytes(heapStats.heap_size_limit),
                external: this.formatBytes(memUsage.external)
            },
            message
        };
    }

    // Disk health check
    async checkDisk() {
        try {
            const stats = require('fs').statSync('.');
            // Basic disk check - in production, use a proper disk usage library
            return {
                status: 'healthy',
                message: 'Disk access normal',
                details: {
                    accessible: true
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                message: 'Disk access failed'
            };
        }
    }

    // System health check
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
                loadAverage: loadAvg.map(load => load.toFixed(2)),
                cpuCount,
                loadPercent: `${loadPercent.toFixed(1)}%`,
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version
            },
            message
        };
    }

    // Liveness probe (simple check)
    async getLivenessProbe() {
        return {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: this.getUptime()
        };
    }

    // Readiness probe (checks if ready to serve traffic)
    async getReadinessProbe() {
        try {
            const dbCheck = await this.checkDatabase();
            const isReady = dbCheck.status !== 'unhealthy';

            return {
                status: isReady ? 'ready' : 'not_ready',
                timestamp: new Date().toISOString(),
                checks: {
                    database: dbCheck.status
                }
            };
        } catch (error) {
            return {
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    // Helper methods
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

    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    parseRedisInfo(info) {
        const lines = info.split('\r\n');
        const result = {};
        
        for (const line of lines) {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                result[key] = value;
            }
        }
        
        return result;
    }

    // Express middleware for health endpoints
    getHealthMiddleware() {
        return {
            health: async (req, res) => {
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
            },

            liveness: async (req, res) => {
                try {
                    const liveness = await this.getLivenessProbe();
                    res.status(200).json(liveness);
                } catch (error) {
                    res.status(500).json({
                        status: 'error',
                        error: error.message
                    });
                }
            },

            readiness: async (req, res) => {
                try {
                    const readiness = await this.getReadinessProbe();
                    const statusCode = readiness.status === 'ready' ? 200 : 503;
                    res.status(statusCode).json(readiness);
                } catch (error) {
                    res.status(503).json({
                        status: 'not_ready',
                        error: error.message
                    });
                }
            }
        };
    }
}

module.exports = HealthCheck;
