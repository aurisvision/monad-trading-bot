/**
 * Redis Cluster Manager for Area51 Trading Bot
 * Implements multi-instance Redis with smart routing and write mirroring
 * Optimized for development environment with production-ready architecture
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class RedisClusterManager extends EventEmitter {
    constructor(config = {}, monitoring = null) {
        super();
        this.monitoring = monitoring;
        this.keyPrefix = 'area51:';
        
        // Default configuration for development
        this.config = {
            // Master instance - Primary writes and critical data
            master: {
                port: config.master?.port || 6379,
                host: config.master?.host || 'localhost',
                db: config.master?.db || 0,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                connectTimeout: 5000,
                commandTimeout: 3000
            },
            
            // Replica instance - Read operations and backup
            replica: {
                port: config.replica?.port || 6380,
                host: config.replica?.host || 'localhost', 
                db: config.replica?.db || 0,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                connectTimeout: 5000,
                commandTimeout: 3000
            },
            
            // Cache instance - High-frequency temporary data
            cache: {
                port: config.cache?.port || 6381,
                host: config.cache?.host || 'localhost',
                db: config.cache?.db || 0,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                connectTimeout: 5000,
                commandTimeout: 3000
            },
            
            // Cluster settings
            writeMode: config.writeMode || 'mirror', // mirror, master-only, smart
            readMode: config.readMode || 'smart',    // smart, replica-first, master-only
            enableFallback: config.enableFallback !== false
        };

        // Connection instances
        this.master = null;
        this.replica = null;
        this.cache = null;
        
        // Health status
        this.health = {
            master: false,
            replica: false,
            cache: false
        };
        
        // Performance metrics
        this.metrics = {
            reads: { total: 0, hits: 0, misses: 0, errors: 0 },
            writes: { total: 0, success: 0, errors: 0, mirrors: 0 },
            responseTime: { sum: 0, count: 0, avg: 0 },
            lastReset: Date.now()
        };
        
        // Data type routing strategies
        this.routingStrategies = {
            // Persistent critical data
            user: { write: 'persistent', read: 'replica-first' },
            user_settings: { write: 'persistent', read: 'replica-first' },
            gas_settings: { write: 'persistent', read: 'replica-first' },
            user_buttons: { write: 'persistent', read: 'replica-first' },
            
            // Temporary high-frequency data
            wallet_balance: { write: 'temporary', read: 'cache-first' },
            portfolio: { write: 'hybrid', read: 'cache-first' },
            temp_sell_data: { write: 'temporary', read: 'cache-first' },
            
            // Semi-static data
            token_info: { write: 'hybrid', read: 'replica-first' },
            mon_price_usd: { write: 'hybrid', read: 'cache-first' },
            main_menu: { write: 'hybrid', read: 'replica-first' },
            user_state: { write: 'temporary', read: 'cache-first' }
        };

        this.initialized = false;
    }

    /**
     * Initialize all Redis instances
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Initialize master instance
            this.master = new Redis(this.config.master);
            await this.setupInstance(this.master, 'master');

            // Initialize replica instance (fallback to master config if unavailable)
            try {
                this.replica = new Redis(this.config.replica);
                await this.setupInstance(this.replica, 'replica');
            } catch (error) {
                this.monitoring?.logWarning('Replica Redis unavailable, using master for reads', { error: error.message });
                this.replica = this.master; // Fallback to master
                this.health.replica = this.health.master;
            }

            // Initialize cache instance (fallback to master if unavailable)
            try {
                this.cache = new Redis(this.config.cache);
                await this.setupInstance(this.cache, 'cache');
            } catch (error) {
                this.monitoring?.logWarning('Cache Redis unavailable, using master for cache operations', { error: error.message });
                this.cache = this.master; // Fallback to master
                this.health.cache = this.health.master;
            }

            // Start health monitoring
            this.startHealthMonitoring();

            this.initialized = true;
            this.monitoring?.logInfo('Redis Cluster Manager initialized successfully', {
                master: this.health.master,
                replica: this.health.replica,
                cache: this.health.cache
            });

        } catch (error) {
            this.monitoring?.logError('Redis Cluster Manager initialization failed', error);
            throw error;
        }
    }

    /**
     * Setup individual Redis instance with event handlers
     */
    async setupInstance(instance, name) {
        // Test connection
        await instance.ping();
        this.health[name] = true;

        // Setup event handlers
        instance.on('connect', () => {
            this.health[name] = true;
            this.monitoring?.logInfo(`Redis ${name} connected`);
            this.emit(`${name}-connected`);
        });

        instance.on('error', (error) => {
            this.health[name] = false;
            this.monitoring?.logError(`Redis ${name} error`, error);
            this.emit(`${name}-error`, error);
        });

        instance.on('close', () => {
            this.health[name] = false;
            this.monitoring?.logWarning(`Redis ${name} connection closed`);
            this.emit(`${name}-disconnected`);
        });

        instance.on('ready', () => {
            this.health[name] = true;
            this.monitoring?.logInfo(`Redis ${name} ready`);
            this.emit(`${name}-ready`);
        });
    }

    /**
     * Smart write operation with mirroring strategy
     */
    async write(key, value, options = {}) {
        const startTime = Date.now();
        const { type, ttl, mirror = true } = options;
        const fullKey = this.getKey(key, type);

        try {
            this.metrics.writes.total++;

            const strategy = this.getWriteStrategy(type);
            const targets = this.getWriteTargets(strategy, mirror);

            // Execute primary write (blocking)
            const primaryTarget = targets[0];
            if (ttl) {
                await primaryTarget.instance.setex(fullKey, ttl, JSON.stringify(value));
            } else {
                await primaryTarget.instance.set(fullKey, JSON.stringify(value));
            }

            this.metrics.writes.success++;

            // Execute mirror writes (non-blocking)
            if (targets.length > 1) {
                const mirrorPromises = targets.slice(1).map(target => {
                    const promise = ttl 
                        ? target.instance.setex(fullKey, ttl, JSON.stringify(value))
                        : target.instance.set(fullKey, JSON.stringify(value));
                    
                    return promise.catch(error => {
                        this.monitoring?.logWarning(`Mirror write failed to ${target.name}`, { error: error.message, key: fullKey });
                    });
                });

                Promise.allSettled(mirrorPromises).then(results => {
                    const successful = results.filter(r => r.status === 'fulfilled').length;
                    this.metrics.writes.mirrors += successful;
                });
            }

            // Record performance
            this.recordResponseTime(Date.now() - startTime);

            return true;

        } catch (error) {
            this.metrics.writes.errors++;
            this.monitoring?.logError('Write operation failed', error, { key: fullKey, type });
            throw error;
        }
    }

    /**
     * Smart read operation with fallback strategy
     */
    async read(key, options = {}) {
        const startTime = Date.now();
        const { type, fallback = true } = options;
        const fullKey = this.getKey(key, type);

        try {
            this.metrics.reads.total++;

            const strategy = this.getReadStrategy(type);
            const targets = this.getReadTargets(strategy);

            // Try primary target
            for (const target of targets) {
                try {
                    const result = await target.instance.get(fullKey);
                    if (result !== null) {
                        this.metrics.reads.hits++;
                        this.recordResponseTime(Date.now() - startTime);
                        return JSON.parse(result);
                    }
                } catch (error) {
                    this.monitoring?.logWarning(`Read failed from ${target.name}`, { error: error.message, key: fullKey });
                    continue; // Try next target
                }
            }

            // No data found
            this.metrics.reads.misses++;
            this.recordResponseTime(Date.now() - startTime);
            return null;

        } catch (error) {
            this.metrics.reads.errors++;
            this.monitoring?.logError('Read operation failed', error, { key: fullKey, type });
            
            if (fallback) {
                // Final fallback to master
                try {
                    const result = await this.master.get(fullKey);
                    return result ? JSON.parse(result) : null;
                } catch (fallbackError) {
                    this.monitoring?.logError('Fallback read failed', fallbackError, { key: fullKey });
                }
            }
            
            throw error;
        }
    }

    /**
     * Delete operation across all relevant instances
     */
    async delete(key, options = {}) {
        const { type } = options;
        const fullKey = this.getKey(key, type);

        try {
            const strategy = this.getWriteStrategy(type);
            const targets = this.getWriteTargets(strategy, true);

            // Delete from all relevant instances
            const deletePromises = targets.map(target => 
                target.instance.del(fullKey).catch(error => {
                    this.monitoring?.logWarning(`Delete failed from ${target.name}`, { error: error.message, key: fullKey });
                })
            );

            await Promise.allSettled(deletePromises);
            return true;

        } catch (error) {
            this.monitoring?.logError('Delete operation failed', error, { key: fullKey, type });
            throw error;
        }
    }

    /**
     * Get write targets based on strategy
     */
    getWriteTargets(strategy, mirror) {
        const targets = [{ instance: this.master, name: 'master' }];

        if (mirror && this.config.writeMode === 'mirror') {
            switch (strategy) {
                case 'persistent':
                    // Critical data - mirror to replica
                    if (this.replica !== this.master && this.health.replica) {
                        targets.push({ instance: this.replica, name: 'replica' });
                    }
                    break;
                    
                case 'temporary':
                    // Temporary data - write to cache instance
                    if (this.cache !== this.master && this.health.cache) {
                        targets.push({ instance: this.cache, name: 'cache' });
                    }
                    break;
                    
                case 'hybrid':
                    // Hybrid - write to both replica and cache
                    if (this.replica !== this.master && this.health.replica) {
                        targets.push({ instance: this.replica, name: 'replica' });
                    }
                    if (this.cache !== this.master && this.health.cache) {
                        targets.push({ instance: this.cache, name: 'cache' });
                    }
                    break;
            }
        }

        return targets;
    }

    /**
     * Get read targets based on strategy
     */
    getReadTargets(strategy) {
        const targets = [];

        switch (strategy) {
            case 'cache-first':
                if (this.cache !== this.master && this.health.cache) {
                    targets.push({ instance: this.cache, name: 'cache' });
                }
                targets.push({ instance: this.master, name: 'master' });
                break;
                
            case 'replica-first':
                if (this.replica !== this.master && this.health.replica) {
                    targets.push({ instance: this.replica, name: 'replica' });
                }
                targets.push({ instance: this.master, name: 'master' });
                break;
                
            case 'master-only':
            default:
                targets.push({ instance: this.master, name: 'master' });
                break;
        }

        return targets;
    }

    /**
     * Get write strategy for data type
     */
    getWriteStrategy(type) {
        return this.routingStrategies[type]?.write || 'hybrid';
    }

    /**
     * Get read strategy for data type
     */
    getReadStrategy(type) {
        return this.routingStrategies[type]?.read || 'replica-first';
    }

    /**
     * Generate full cache key
     */
    getKey(key, type) {
        if (type) {
            return `${this.keyPrefix}${type}:${key}`;
        }
        return `${this.keyPrefix}${key}`;
    }

    /**
     * Record response time for metrics
     */
    recordResponseTime(time) {
        this.metrics.responseTime.sum += time;
        this.metrics.responseTime.count++;
        this.metrics.responseTime.avg = this.metrics.responseTime.sum / this.metrics.responseTime.count;
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        setInterval(async () => {
            await this.checkHealth();
        }, 30000); // Check every 30 seconds
    }

    /**
     * Check health of all instances
     */
    async checkHealth() {
        const instances = [
            { instance: this.master, name: 'master' },
            { instance: this.replica, name: 'replica' },
            { instance: this.cache, name: 'cache' }
        ];

        for (const { instance, name } of instances) {
            if (instance && instance !== this.master) { // Don't double-check master
                try {
                    await instance.ping();
                    this.health[name] = true;
                } catch (error) {
                    this.health[name] = false;
                    this.monitoring?.logWarning(`Redis ${name} health check failed`, { error: error.message });
                }
            }
        }
    }

    /**
     * Get cluster status and metrics
     */
    getStatus() {
        return {
            health: this.health,
            metrics: this.metrics,
            config: {
                writeMode: this.config.writeMode,
                readMode: this.config.readMode,
                enableFallback: this.config.enableFallback
            },
            uptime: Date.now() - this.metrics.lastReset
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            reads: { total: 0, hits: 0, misses: 0, errors: 0 },
            writes: { total: 0, success: 0, errors: 0, mirrors: 0 },
            responseTime: { sum: 0, count: 0, avg: 0 },
            lastReset: Date.now()
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            if (this.master) await this.master.disconnect();
            if (this.replica && this.replica !== this.master) await this.replica.disconnect();
            if (this.cache && this.cache !== this.master) await this.cache.disconnect();
            
            this.monitoring?.logInfo('Redis Cluster Manager shutdown completed');
        } catch (error) {
            this.monitoring?.logError('Redis Cluster Manager shutdown failed', error);
        }
    }
}

module.exports = RedisClusterManager;
