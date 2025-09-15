const PrometheusMetrics = require('./PrometheusMetrics');

class MetricsMiddleware {
    constructor() {
        this.metrics = new PrometheusMetrics();
        this.metrics.startSystemMetricsCollection();
    }

    // Express middleware for HTTP metrics
    httpMetrics() {
        return (req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = (Date.now() - start) / 1000;
                this.metrics.recordHttpRequest(
                    req.method,
                    req.route?.path || req.path,
                    res.statusCode,
                    duration
                );
            });
            
            next();
        };
    }

    // Telegram bot middleware
    telegramMetrics() {
        return async (ctx, next) => {
            const start = Date.now();
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
                this.metrics.recordError('telegram_handler', 'error');
                throw error;
            } finally {
                this.metrics.recordTelegramMessage(messageType, status);
            }
        };
    }

    // Database operation wrapper
    wrapDatabaseOperation(operation, operationName) {
        return async (...args) => {
            const start = Date.now();
            let status = 'success';

            try {
                const result = await operation.apply(this, args);
                return result;
            } catch (error) {
                status = 'error';
                this.metrics.recordError('database_operation', 'error');
                throw error;
            } finally {
                const duration = (Date.now() - start) / 1000;
                this.metrics.recordDatabaseQuery(operationName, status, duration);
            }
        };
    }

    // Redis operation wrapper
    wrapRedisOperation(operation, operationName) {
        return async (...args) => {
            let status = 'success';

            try {
                const result = await operation.apply(this, args);
                return result;
            } catch (error) {
                status = 'error';
                this.metrics.recordError('redis_operation', 'error');
                throw error;
            } finally {
                this.metrics.recordRedisOperation(operationName, status);
            }
        };
    }

    // Trading operation wrapper
    wrapTradingOperation(operation, operationType) {
        return async (...args) => {
            const start = Date.now();
            let status = 'success';
            let volume = 0;

            try {
                const result = await operation.apply(this, args);
                
                // Extract volume from result if available
                if (result && result.amount) {
                    volume = parseFloat(result.amount) || 0;
                }
                
                return result;
            } catch (error) {
                status = 'error';
                this.metrics.recordError('trading_operation', 'error');
                throw error;
            } finally {
                this.metrics.recordTradingOperation(operationType, status, volume);
            }
        };
    }

    // API call wrapper
    wrapApiCall(apiCall, apiName, endpoint) {
        return async (...args) => {
            const start = Date.now();
            let status = 'success';

            try {
                const result = await apiCall.apply(this, args);
                return result;
            } catch (error) {
                status = 'error';
                this.metrics.recordError('api_call', 'error');
                throw error;
            } finally {
                const duration = (Date.now() - start) / 1000;
                this.metrics.recordApiRequest(apiName, endpoint, status, duration);
            }
        };
    }

    // Update active users count
    updateActiveUsers(count) {
        this.metrics.setActiveUsers(count);
    }

    // Update database connections
    updateDatabaseConnections(count) {
        this.metrics.setDatabaseConnections(count);
    }

    // Update Redis connections
    updateRedisConnections(count) {
        this.metrics.setRedisConnections(count);
    }

    // Update cache hit ratio
    updateCacheHitRatio(hits, total) {
        const ratio = total > 0 ? hits / total : 0;
        this.metrics.setCacheHitRatio(ratio);
    }

    // Get metrics endpoint handler
    getMetricsHandler() {
        return async (req, res) => {
            try {
                const metrics = await this.metrics.getMetrics();
                res.set('Content-Type', this.metrics.register.contentType);
                res.end(metrics);
            } catch (error) {
                res.status(500).json({ error: 'Failed to get metrics' });
            }
        };
    }

    // Get metrics in JSON format for debugging
    getMetricsJSON() {
        return this.metrics.getMetricsAsJSON();
    }

    // Cleanup
    destroy() {
        this.metrics.stopSystemMetricsCollection();
    }
}

module.exports = MetricsMiddleware;
