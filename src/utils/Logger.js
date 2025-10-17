const LoggingConfig = require('../config/LoggingConfig');

/**
 * Enhanced Logger - Comprehensive logging utility for the project
 * Provides structured logging with context, performance tracking, and WebSocket monitoring
 */
class Logger {
    constructor(options = {}) {
        this.loggingConfig = new LoggingConfig();
        
        this.config = {
            level: options.level || this.loggingConfig.logLevel,
            enablePerformance: options.enablePerformance !== false,
            enableWebSocketLogging: options.enableWebSocketLogging !== false,
            enableStackTrace: options.enableStackTrace !== false,
            maxStackTraceDepth: options.maxStackTraceDepth || 10,
            enabledCategories: this.loggingConfig.enabledCategories,
            performanceThresholds: this.loggingConfig.performanceThresholds,
            outputFormat: this.loggingConfig.getOutputFormat(),
            retentionPolicy: this.loggingConfig.getRetentionPolicy(),
            sensitiveFields: this.loggingConfig.getSensitiveFields(),
            ...options
        };
        
        // Log levels hierarchy
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
            fatal: 4
        };
        
        // Performance tracking
        this.performanceTimers = new Map();
        
        // WebSocket operation tracking
        this.webSocketOperations = new Map();
        
        // Statistics
        this.stats = {
            totalLogs: 0,
            logsByLevel: { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
            performanceTimers: 0,
            webSocketOperations: 0,
            errors: 0,
            categoriesLogged: new Set()
        };
    }
    
    /**
     * Check if log level should be output
     */
    shouldLog(level) {
        return this.loggingConfig.shouldLog(level);
    }

    /**
     * Check if a category is enabled for logging
     */
    shouldLogCategory(category) {
        return this.loggingConfig.isCategoryEnabled(category);
    }

    /**
     * Get performance threshold for an operation
     */
    getPerformanceThreshold(operation) {
        return this.loggingConfig.getPerformanceThreshold(operation);
    }
    
    /**
     * Enhanced info logging with context
     */
    info(message, context = {}, options = {}) {
        if (!this.shouldLog('info')) return;
        
        this._log('info', message, context, options);
    }
    
    /**
     * Enhanced warning logging with context
     */
    warn(message, context = {}, options = {}) {
        if (!this.shouldLog('warn')) return;
        
        this._log('warn', message, context, options);
    }
    
    /**
     * Enhanced error logging with stack trace
     */
    error(message, error = null, context = {}, options = {}) {
        if (!this.shouldLog('error')) return;
        
        const errorContext = { ...context };
        
        if (error) {
            errorContext.error = {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: this.config.enableStackTrace ? this._getStackTrace(error) : undefined
            };
        }
        
        this.stats.errors++;
        this._log('error', message, errorContext, options);
    }
    
    /**
     * Enhanced debug logging with detailed context
     */
    debug(message, context = {}, options = {}) {
        if (!this.shouldLog('debug')) return;
        
        this._log('debug', message, context, options);
    }
    
    /**
     * WebSocket connection logging
     */
    webSocketConnect(endpoint, context = {}) {
        if (!this.config.enableWebSocketLogging) return;
        
        const operationId = this._generateOperationId();
        const wsContext = {
            operationId,
            endpoint,
            operation: 'connect',
            timestamp: new Date().toISOString(),
            ...context
        };
        
        this.webSocketOperations.set(operationId, {
            operation: 'connect',
            endpoint,
            startTime: Date.now()
        });
        
        this.stats.webSocketOperations++;
        this.info('WebSocket connection initiated', wsContext, { category: 'websocket' });
        
        return operationId;
    }
    
    /**
     * WebSocket connection success logging
     */
    webSocketConnected(operationId, endpoint, context = {}) {
        if (!this.config.enableWebSocketLogging) return;
        
        const operation = this.webSocketOperations.get(operationId);
        const duration = operation ? Date.now() - operation.startTime : null;
        
        const wsContext = {
            operationId,
            endpoint,
            operation: 'connected',
            duration: duration ? `${duration}ms` : null,
            timestamp: new Date().toISOString(),
            ...context
        };
        
        this.info('WebSocket connection established', wsContext, { category: 'websocket' });
        
        if (operation) {
            this.webSocketOperations.delete(operationId);
        }
    }
    
    /**
     * WebSocket disconnection logging
     */
    webSocketDisconnect(endpoint, reason = null, context = {}) {
        if (!this.config.enableWebSocketLogging) return;
        
        const wsContext = {
            endpoint,
            operation: 'disconnect',
            reason,
            timestamp: new Date().toISOString(),
            ...context
        };
        
        this.info('WebSocket disconnected', wsContext, { category: 'websocket' });
    }
    
    /**
     * WebSocket message logging
     */
    webSocketMessage(endpoint, direction, messageType, context = {}) {
        if (!this.config.enableWebSocketLogging) return;
        
        const wsContext = {
            endpoint,
            operation: 'message',
            direction, // 'sent' or 'received'
            messageType,
            timestamp: new Date().toISOString(),
            ...context
        };
        
        this.debug('WebSocket message', wsContext, { category: 'websocket' });
    }
    
    /**
     * WebSocket error logging
     */
    webSocketError(endpoint, error, context = {}) {
        if (!this.config.enableWebSocketLogging) return;
        
        const wsContext = {
            endpoint,
            operation: 'error',
            timestamp: new Date().toISOString(),
            ...context
        };
        
        this.error('WebSocket error', error, wsContext, { category: 'websocket' });
    }
    
    /**
     * Start performance timer
     */
    startTimer(operation, context = {}) {
        if (!this.config.enablePerformance) return null;
        
        const timerId = this._generateOperationId();
        this.performanceTimers.set(timerId, {
            operation,
            startTime: Date.now(),
            context
        });
        
        this.stats.performanceTimers++;
        this.debug(`Performance timer started: ${operation}`, { timerId, ...context }, { category: 'performance' });
        
        return timerId;
    }
    
    /**
     * End performance timer and log duration
     */
    endTimer(timerId, additionalContext = {}) {
        if (!this.config.enablePerformance || !timerId) return null;
        
        const timer = this.performanceTimers.get(timerId);
        if (!timer) {
            this.warn('Performance timer not found', { timerId });
            return null;
        }
        
        const duration = Date.now() - timer.startTime;
        const threshold = this.getPerformanceThreshold(timer.operation);
        const isSlowOperation = duration > threshold;
        
        const perfContext = {
            operation: timer.operation,
            duration: `${duration}ms`,
            threshold: `${threshold}ms`,
            isSlowOperation,
            timerId,
            ...timer.context,
            ...additionalContext
        };

        // Log based on performance
        if (isSlowOperation) {
            const overThresholdBy = duration - threshold;
            perfContext.overThresholdBy = `${overThresholdBy}ms`;
            perfContext.severity = duration > (threshold * 2) ? 'high' : 'medium';
            
            this.warn(`Slow operation detected: ${timer.operation}`, perfContext, { category: 'performance' });
        } else {
            this.info(`Performance: ${timer.operation} completed`, perfContext, { category: 'performance' });
        }
        
        this.performanceTimers.delete(timerId);
        
        return duration;
    }
    
    /**
     * Log database operation
     */
    database(operation, query, duration = null, context = {}) {
        const dbContext = {
            operation,
            query: typeof query === 'string' ? query.substring(0, 200) : 'complex_query',
            duration: duration ? `${duration}ms` : null,
            timestamp: new Date().toISOString(),
            ...context
        };
        
        this.debug('Database operation', dbContext, { category: 'database' });
    }
    
    /**
     * Log API call
     */
    apiCall(method, url, statusCode, duration = null, context = {}) {
        const apiContext = {
            method,
            url,
            statusCode,
            duration: duration ? `${duration}ms` : null,
            timestamp: new Date().toISOString(),
            ...context
        };
        
        const level = statusCode >= 400 ? 'warn' : 'info';
        this[level]('API call', apiContext, { category: 'api' });
    }
    
    /**
     * Log user action
     */
    userAction(telegramId, action, context = {}) {
        const userContext = {
            telegramId,
            action,
            timestamp: new Date().toISOString(),
            ...context
        };
        
        this.info('User action', userContext, { category: 'user' });
    }
    
    /**
     * Get logging statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeTimers: this.performanceTimers.size,
            activeWebSocketOps: this.webSocketOperations.size,
            config: this.config
        };
    }
    
    /**
     * Internal logging method
     */
    _log(level, message, context, options) {
        // Check if log level should be output
        if (!this.shouldLog(level)) {
            return;
        }

        // Check if category should be logged
        const category = options.category || 'general';
        if (!this.shouldLogCategory(category)) {
            return;
        }

        // Redact sensitive data
        const sanitizedContext = this._redactSensitiveData(context);

        const logEntry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            category,
            context: sanitizedContext,
            environment: this.loggingConfig.environment
        };

        // Track statistics
        this.stats.totalLogs++;
        this.stats.logsByLevel[level]++;
        this.stats.categoriesLogged.add(category);

        if (level === 'error' || level === 'fatal') {
            this.stats.errors++;
        }
        
        // Output based on configuration
        this._outputLog(logEntry);
    }

    /**
     * Redact sensitive data from context
     */
    _redactSensitiveData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const redacted = { ...data };
        const sensitiveFields = this.config.sensitiveFields;

        for (const field of sensitiveFields) {
            if (redacted[field]) {
                redacted[field] = '[REDACTED]';
            }
        }

        // Recursively redact nested objects
        for (const key in redacted) {
            if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                redacted[key] = this._redactSensitiveData(redacted[key]);
            }
        }

        return redacted;
    }

    /**
     * Output log based on configuration
     */
    _outputLog(logEntry) {
        const outputFormat = this.config.outputFormat;

        // Console output
        if (outputFormat.console) {
            if (outputFormat.structured) {
                console.log(JSON.stringify(logEntry, null, outputFormat.colors ? 2 : 0));
            } else {
                const timestamp = logEntry.timestamp;
                const level = logEntry.level.toUpperCase();
                const category = logEntry.category;
                const message = logEntry.message;
                console.log(`[${timestamp}] ${level} [${category}] ${message}`);
            }
        }

        // File output would be handled here in a real implementation
        // For now, we'll just use console output
    }
    
    /**
     * Generate unique operation ID
     */
    _generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get formatted stack trace
     */
    _getStackTrace(error) {
        if (!error.stack) return null;
        
        return error.stack
            .split('\n')
            .slice(0, this.config.maxStackTraceDepth)
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;