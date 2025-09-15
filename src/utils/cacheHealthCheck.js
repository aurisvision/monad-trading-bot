/**
 * Cache Health Check and Recovery System for Area51 Telegram Bot
 * Monitors cache consistency and provides automated recovery
 */

class CacheHealthCheck {
    constructor(redis, cacheService, monitoring = null) {
        this.redis = redis;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        this.healthCheckInterval = null;
        this.autoRecoveryEnabled = true;
    }

    /**
     * Start automated health monitoring
     */
    startHealthMonitoring(intervalMinutes = 30) {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, intervalMinutes * 60 * 1000);

        if (this.monitoring) {
            this.monitoring.logInfo('Cache health monitoring started', { 
                intervalMinutes,
                autoRecovery: this.autoRecoveryEnabled 
            });
        }
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        const results = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            issues: [],
            metrics: {},
            recoveryActions: []
        };

        try {
            // 1. Check cache consistency
            const consistencyCheck = await this.cacheService.validateCacheConsistency();
            results.issues.push(...consistencyCheck.issues);

            // 2. Check Redis connection
            const connectionCheck = await this.checkRedisConnection();
            if (!connectionCheck.healthy) {
                results.issues.push({
                    type: 'redis_connection',
                    severity: 'critical',
                    message: connectionCheck.error
                });
            }

            // 3. Check memory usage
            const memoryCheck = await this.checkRedisMemory();
            results.metrics.memory = memoryCheck;
            
            if (memoryCheck.usagePercent > 80) {
                results.issues.push({
                    type: 'high_memory_usage',
                    severity: 'warning',
                    usage: memoryCheck.usagePercent,
                    message: `Redis memory usage at ${memoryCheck.usagePercent}%`
                });
            }

            // 4. Check for orphaned keys
            const orphanedKeys = await this.findOrphanedKeys();
            if (orphanedKeys.length > 0) {
                results.issues.push({
                    type: 'orphaned_keys',
                    severity: 'medium',
                    count: orphanedKeys.length,
                    keys: orphanedKeys.slice(0, 10) // Show first 10
                });
            }

            // 5. Auto-recovery if enabled
            if (this.autoRecoveryEnabled && results.issues.length > 0) {
                const recoveryResults = await this.performAutoRecovery(results.issues);
                results.recoveryActions = recoveryResults;
            }

            // Determine overall status
            const criticalIssues = results.issues.filter(i => i.severity === 'critical');
            const highIssues = results.issues.filter(i => i.severity === 'high');
            
            if (criticalIssues.length > 0) {
                results.status = 'critical';
            } else if (highIssues.length > 0) {
                results.status = 'degraded';
            } else if (results.issues.length > 0) {
                results.status = 'warning';
            }

            // Log results
            if (this.monitoring) {
                this.monitoring.logInfo('Cache health check completed', {
                    status: results.status,
                    issueCount: results.issues.length,
                    recoveryActions: results.recoveryActions.length
                });

                if (results.status !== 'healthy') {
                    this.monitoring.logWarning('Cache health issues detected', results);
                }
            }

            return results;

        } catch (error) {
            results.status = 'error';
            results.error = error.message;
            
            if (this.monitoring) {
                this.monitoring.logError('Cache health check failed', error);
            }
            
            return results;
        }
    }

    /**
     * Check Redis connection health
     */
    async checkRedisConnection() {
        try {
            const start = Date.now();
            await this.redis.ping();
            const latency = Date.now() - start;
            
            return {
                healthy: true,
                latency,
                status: latency < 100 ? 'excellent' : latency < 500 ? 'good' : 'slow'
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    /**
     * Check Redis memory usage
     */
    async checkRedisMemory() {
        try {
            const info = await this.redis.info('memory');
            const lines = info.split('\r\n');
            
            let usedMemory = 0;
            let maxMemory = 0;
            
            for (const line of lines) {
                if (line.startsWith('used_memory:')) {
                    usedMemory = parseInt(line.split(':')[1]);
                } else if (line.startsWith('maxmemory:')) {
                    maxMemory = parseInt(line.split(':')[1]);
                }
            }
            
            const usagePercent = maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0;
            
            return {
                usedMemory,
                maxMemory,
                usagePercent: Math.round(usagePercent * 100) / 100,
                usedMemoryHuman: this.formatBytes(usedMemory),
                maxMemoryHuman: this.formatBytes(maxMemory)
            };
        } catch (error) {
            return {
                error: error.message,
                usagePercent: 0
            };
        }
    }

    /**
     * Find orphaned cache keys
     */
    async findOrphanedKeys() {
        try {
            const orphaned = [];
            
            // Keys that might be orphaned after certain time periods
            const patterns = [
                'area51:user_state:*',  // Should expire in 10 minutes
                'area51:temp_sell_data:*'  // Should expire in 10 minutes
            ];
            
            for (const pattern of patterns) {
                const keys = await this.redis.keys(pattern);
                
                for (const key of keys) {
                    const ttl = await this.redis.ttl(key);
                    // If key has no TTL (-1) or expired (-2), it might be orphaned
                    if (ttl === -1) {
                        orphaned.push(key);
                    }
                }
            }
            
            return orphaned;
        } catch (error) {
            return [];
        }
    }

    /**
     * Perform automated recovery actions
     */
    async performAutoRecovery(issues) {
        const recoveryActions = [];
        
        for (const issue of issues) {
            try {
                switch (issue.type) {
                    case 'legacy_keys':
                        // Clean legacy keys
                        const cleanResult = await this.cacheService.cleanLegacyKeys();
                        recoveryActions.push({
                            issue: issue.type,
                            action: 'cleaned_legacy_keys',
                            result: cleanResult,
                            success: true
                        });
                        break;
                        
                    case 'orphaned_keys':
                        // Clean orphaned keys
                        if (issue.keys && issue.keys.length > 0) {
                            await this.redis.del(...issue.keys);
                            recoveryActions.push({
                                issue: issue.type,
                                action: 'cleaned_orphaned_keys',
                                count: issue.keys.length,
                                success: true
                            });
                        }
                        break;
                        
                    case 'high_memory_usage':
                        // Trigger cache cleanup for expired keys
                        const expiredCleaned = await this.cleanExpiredKeys();
                        recoveryActions.push({
                            issue: issue.type,
                            action: 'cleaned_expired_keys',
                            count: expiredCleaned,
                            success: true
                        });
                        break;
                }
            } catch (error) {
                recoveryActions.push({
                    issue: issue.type,
                    action: 'recovery_failed',
                    error: error.message,
                    success: false
                });
            }
        }
        
        return recoveryActions;
    }

    /**
     * Clean expired keys manually
     */
    async cleanExpiredKeys() {
        try {
            // Get all area51 keys and check their TTL
            const keys = await this.redis.keys('area51:*');
            let cleaned = 0;
            
            for (const key of keys) {
                const ttl = await this.redis.ttl(key);
                if (ttl === -2) { // Key expired but not cleaned yet
                    await this.redis.del(key);
                    cleaned++;
                }
            }
            
            return cleaned;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Format bytes to human readable
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get health status summary
     */
    async getHealthSummary() {
        const healthCheck = await this.performHealthCheck();
        
        return {
            status: healthCheck.status,
            lastCheck: healthCheck.timestamp,
            issueCount: healthCheck.issues.length,
            criticalIssues: healthCheck.issues.filter(i => i.severity === 'critical').length,
            memoryUsage: healthCheck.metrics.memory?.usagePercent || 0,
            autoRecoveryEnabled: this.autoRecoveryEnabled
        };
    }
}

module.exports = CacheHealthCheck;
