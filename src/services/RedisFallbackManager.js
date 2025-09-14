/**
 * Redis Fallback Manager
 * Handles Redis connection failures, automatic reconnection, and graceful degradation
 */
class RedisFallbackManager {
    constructor(redisClient, monitoring = null) {
        this.redis = redisClient;
        this.monitoring = monitoring;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.fallbackData = new Map(); // In-memory fallback storage
        this.connectionListeners = [];
        
        this.setupConnectionHandlers();
    }

    /**
     * Setup Redis connection event handlers
     */
    setupConnectionHandlers() {
        if (!this.redis) return;

        this.redis.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            
            if (this.monitoring) {
                this.monitoring.logInfo('Redis connected successfully');
            }
            
            this._notifyConnectionListeners('connected');
        });

        this.redis.on('ready', () => {
            this.isConnected = true;
            
            if (this.monitoring) {
                this.monitoring.logInfo('Redis ready for operations');
            }
        });

        this.redis.on('error', (error) => {
            this.isConnected = false;
            
            if (this.monitoring) {
                this.monitoring.logError('Redis connection error', error);
            }
            
            this._notifyConnectionListeners('error', error);
        });

        this.redis.on('close', () => {
            this.isConnected = false;
            
            if (this.monitoring) {
                this.monitoring.logWarning('Redis connection closed');
            }
            
            this._notifyConnectionListeners('disconnected');
            this._attemptReconnection();
        });

        this.redis.on('reconnecting', () => {
            if (this.monitoring) {
                this.monitoring.logInfo('Redis attempting to reconnect...');
            }
        });
    }

    /**
     * Check if Redis is available
     */
    isRedisAvailable() {
        return this.isConnected && this.redis && this.redis.status === 'ready';
    }

    /**
     * Execute Redis operation with fallback
     */
    async executeWithFallback(operation, fallbackFn = null, cacheKey = null) {
        try {
            if (this.isRedisAvailable()) {
                const result = await operation();
                
                // Store successful result in fallback cache if key provided
                if (cacheKey && result !== null && result !== undefined) {
                    this.fallbackData.set(cacheKey, {
                        data: result,
                        timestamp: Date.now(),
                        ttl: 5 * 60 * 1000 // 5 minutes fallback TTL
                    });
                }
                
                return result;
            } else {
                throw new Error('Redis not available');
            }
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Redis operation failed, using fallback', error);
            }
            
            // Try fallback data first
            if (cacheKey) {
                const fallbackResult = this._getFallbackData(cacheKey);
                if (fallbackResult !== null) {
                    return fallbackResult;
                }
            }
            
            // Use provided fallback function
            if (fallbackFn && typeof fallbackFn === 'function') {
                try {
                    return await fallbackFn();
                } catch (fallbackError) {
                    if (this.monitoring) {
                        this.monitoring.logError('Fallback function also failed', fallbackError);
                    }
                }
            }
            
            return null;
        }
    }

    /**
     * Get data with fallback support
     */
    async getWithFallback(key, fallbackFn = null) {
        const cacheKey = `get:${key}`;
        
        return await this.executeWithFallback(
            async () => {
                const result = await this.redis.get(key);
                return result ? JSON.parse(result) : null;
            },
            fallbackFn,
            cacheKey
        );
    }

    /**
     * Set data with fallback support
     */
    async setWithFallback(key, value, ttl = null) {
        return await this.executeWithFallback(
            async () => {
                const stringValue = JSON.stringify(value);
                if (ttl) {
                    return await this.redis.setex(key, ttl, stringValue);
                } else {
                    return await this.redis.set(key, stringValue);
                }
            },
            null,
            null
        );
    }

    /**
     * Delete data with fallback support
     */
    async deleteWithFallback(key) {
        // Remove from fallback cache
        this.fallbackData.delete(`get:${key}`);
        
        return await this.executeWithFallback(
            async () => {
                return await this.redis.del(key);
            },
            null,
            null
        );
    }

    /**
     * Pipeline operations with fallback
     */
    async pipelineWithFallback(operations) {
        return await this.executeWithFallback(
            async () => {
                const pipeline = this.redis.pipeline();
                
                operations.forEach(op => {
                    switch (op.type) {
                        case 'del':
                            pipeline.del(op.key);
                            break;
                        case 'set':
                            if (op.ttl) {
                                pipeline.setex(op.key, op.ttl, JSON.stringify(op.value));
                            } else {
                                pipeline.set(op.key, JSON.stringify(op.value));
                            }
                            break;
                        case 'get':
                            pipeline.get(op.key);
                            break;
                    }
                });
                
                return await pipeline.exec();
            },
            async () => {
                // Fallback: execute operations individually
                const results = [];
                for (const op of operations) {
                    try {
                        let result = null;
                        switch (op.type) {
                            case 'del':
                                this.fallbackData.delete(`get:${op.key}`);
                                result = [null, 1]; // Simulate successful deletion
                                break;
                            case 'set':
                                // Can't really fallback set operations
                                result = [null, 'OK'];
                                break;
                            case 'get':
                                const fallbackResult = this._getFallbackData(`get:${op.key}`);
                                result = [null, fallbackResult];
                                break;
                        }
                        results.push(result);
                    } catch (error) {
                        results.push([error, null]);
                    }
                }
                return results;
            },
            null
        );
    }

    /**
     * Get Redis connection status
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            status: this.redis ? this.redis.status : 'disconnected',
            reconnectAttempts: this.reconnectAttempts,
            fallbackCacheSize: this.fallbackData.size,
            maxReconnectAttempts: this.maxReconnectAttempts
        };
    }

    /**
     * Force reconnection attempt
     */
    async forceReconnect() {
        if (this.redis) {
            try {
                await this.redis.disconnect();
                await this.redis.connect();
                return true;
            } catch (error) {
                if (this.monitoring) {
                    this.monitoring.logError('Force reconnect failed', error);
                }
                return false;
            }
        }
        return false;
    }

    /**
     * Clear fallback cache
     */
    clearFallbackCache() {
        const size = this.fallbackData.size;
        this.fallbackData.clear();
        
        if (this.monitoring) {
            this.monitoring.logInfo(`Cleared fallback cache (${size} items)`);
        }
        
        return size;
    }

    /**
     * Get fallback cache statistics
     */
    getFallbackCacheStats() {
        let validItems = 0;
        let expiredItems = 0;
        const now = Date.now();
        
        for (const [key, item] of this.fallbackData.entries()) {
            if (now - item.timestamp < item.ttl) {
                validItems++;
            } else {
                expiredItems++;
            }
        }
        
        return {
            totalItems: this.fallbackData.size,
            validItems,
            expiredItems,
            memoryUsageKB: Math.round(JSON.stringify([...this.fallbackData.entries()]).length / 1024)
        };
    }

    /**
     * Add connection listener
     */
    onConnectionChange(callback) {
        this.connectionListeners.push(callback);
    }

    /**
     * Remove connection listener
     */
    removeConnectionListener(callback) {
        const index = this.connectionListeners.indexOf(callback);
        if (index > -1) {
            this.connectionListeners.splice(index, 1);
        }
    }

    /**
     * Get fallback data if available and not expired
     */
    _getFallbackData(key) {
        const item = this.fallbackData.get(key);
        if (!item) return null;
        
        const now = Date.now();
        if (now - item.timestamp > item.ttl) {
            this.fallbackData.delete(key);
            return null;
        }
        
        return item.data;
    }

    /**
     * Attempt reconnection with exponential backoff
     */
    _attemptReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            if (this.monitoring) {
                this.monitoring.logError('Max reconnection attempts reached, giving up');
            }
            return;
        }
        
        setTimeout(async () => {
            this.reconnectAttempts++;
            
            if (this.monitoring) {
                this.monitoring.logInfo(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            }
            
            try {
                if (this.redis) {
                    await this.redis.connect();
                }
            } catch (error) {
                if (this.monitoring) {
                    this.monitoring.logError(`Reconnection attempt ${this.reconnectAttempts} failed`, error);
                }
                
                // Exponential backoff
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
                this._attemptReconnection();
            }
        }, this.reconnectDelay);
    }

    /**
     * Notify connection listeners
     */
    _notifyConnectionListeners(event, data = null) {
        this.connectionListeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                if (this.monitoring) {
                    this.monitoring.logError('Connection listener error', error);
                }
            }
        });
    }

    /**
     * Cleanup expired fallback data
     */
    _cleanupExpiredFallbackData() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, item] of this.fallbackData.entries()) {
            if (now - item.timestamp > item.ttl) {
                this.fallbackData.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0 && this.monitoring) {
            this.monitoring.logInfo(`Cleaned up ${cleanedCount} expired fallback items`);
        }
        
        return cleanedCount;
    }

    /**
     * Start periodic cleanup
     */
    startPeriodicCleanup() {
        // Clean up expired fallback data every 5 minutes
        setInterval(() => {
            this._cleanupExpiredFallbackData();
        }, 5 * 60 * 1000);
    }
}

module.exports = RedisFallbackManager;
