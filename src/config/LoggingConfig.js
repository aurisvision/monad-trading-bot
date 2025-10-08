/**
 * Centralized Logging Configuration
 * Manages all logging settings, levels, and categories across the application
 */

class LoggingConfig {
    constructor() {
        this.environment = process.env.NODE_ENV || 'production';
        this.logLevel = process.env.LOG_LEVEL || this.getDefaultLogLevel();
        this.enabledCategories = this.getEnabledCategories();
        this.performanceThresholds = this.getPerformanceThresholds();
        this.outputFormats = this.getOutputFormats();
        this.retentionPolicies = this.getRetentionPolicies();
    }

    /**
     * Get default log level based on environment
     */
    getDefaultLogLevel() {
        switch (this.environment) {
            case 'development':
                return 'debug';
            case 'staging':
                return 'info';
            case 'production':
                return 'warn';
            default:
                return 'info';
        }
    }

    /**
     * Get enabled logging categories based on environment
     */
    getEnabledCategories() {
        const baseCategories = [
            'system',
            'error',
            'security',
            'performance'
        ];

        const developmentCategories = [
            ...baseCategories,
            'debug',
            'cache_performance',
            'database_performance',
            'api_performance'
        ];

        const productionCategories = [
            ...baseCategories,
            'trading_transaction',
            'trading_error',
            'wallet_operation',
            'monitoring'
        ];

        switch (this.environment) {
            case 'development':
                return developmentCategories;
            case 'staging':
                return [...baseCategories, 'trading_transaction', 'trading_error'];
            case 'production':
                return productionCategories;
            default:
                return baseCategories;
        }
    }

    /**
     * Get performance thresholds for different operations
     */
    getPerformanceThresholds() {
        return {
            // Database operations (milliseconds)
            database_query: 1000,
            database_transaction: 2000,
            database_migration: 10000,

            // Cache operations (milliseconds)
            cache_get: 100,
            cache_set: 200,
            cache_invalidation: 500,

            // Trading operations (milliseconds)
            prepare_trade_data: 3000,
            execute_trade: 10000,
            wallet_operation: 5000,
            balance_check: 2000,

            // API operations (milliseconds)
            api_request: 5000,
            external_api_call: 8000,
            quote_fetch: 3000,

            // System operations (milliseconds)
            system_startup: 30000,
            health_check: 1000,
            monitoring_cycle: 5000
        };
    }

    /**
     * Get output formats for different environments
     */
    getOutputFormats() {
        return {
            development: {
                console: true,
                file: true,
                structured: false,
                colors: true
            },
            staging: {
                console: true,
                file: true,
                structured: true,
                colors: false
            },
            production: {
                console: false,
                file: true,
                structured: true,
                colors: false,
                external: true // For external logging services
            }
        };
    }

    /**
     * Get log retention policies
     */
    getRetentionPolicies() {
        return {
            development: {
                maxFiles: 5,
                maxSize: '10m',
                maxAge: '7d'
            },
            staging: {
                maxFiles: 10,
                maxSize: '50m',
                maxAge: '30d'
            },
            production: {
                maxFiles: 30,
                maxSize: '100m',
                maxAge: '90d'
            }
        };
    }

    /**
     * Check if a category is enabled for logging
     */
    isCategoryEnabled(category) {
        return this.enabledCategories.includes(category);
    }

    /**
     * Get performance threshold for an operation
     */
    getPerformanceThreshold(operation) {
        return this.performanceThresholds[operation] || 1000; // Default 1 second
    }

    /**
     * Get output format for current environment
     */
    getOutputFormat() {
        return this.outputFormats[this.environment] || this.outputFormats.production;
    }

    /**
     * Get retention policy for current environment
     */
    getRetentionPolicy() {
        return this.retentionPolicies[this.environment] || this.retentionPolicies.production;
    }

    /**
     * Get log file paths
     */
    getLogFilePaths() {
        const baseDir = process.env.LOG_DIR || './logs';
        
        return {
            combined: `${baseDir}/combined.log`,
            error: `${baseDir}/error.log`,
            trading: `${baseDir}/trading.log`,
            performance: `${baseDir}/performance.log`,
            security: `${baseDir}/security.log`,
            cache: `${baseDir}/cache.log`,
            database: `${baseDir}/database.log`
        };
    }

    /**
     * Get sensitive fields that should be redacted from logs
     */
    getSensitiveFields() {
        return [
            'password',
            'private_key',
            'encrypted_private_key',
            'secret',
            'token',
            'api_key',
            'authorization',
            'cookie',
            'session',
            'mnemonic',
            'seed'
        ];
    }

    /**
     * Get log level priority for filtering
     */
    getLogLevelPriority(level) {
        const priorities = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
            fatal: 4
        };
        return priorities[level] || 1;
    }

    /**
     * Check if log level should be logged based on current configuration
     */
    shouldLog(level) {
        const currentPriority = this.getLogLevelPriority(this.logLevel);
        const messagePriority = this.getLogLevelPriority(level);
        return messagePriority >= currentPriority;
    }

    /**
     * Get configuration summary for debugging
     */
    getConfigSummary() {
        return {
            environment: this.environment,
            logLevel: this.logLevel,
            enabledCategoriesCount: this.enabledCategories.length,
            outputFormat: this.getOutputFormat(),
            retentionPolicy: this.getRetentionPolicy(),
            logFilePaths: this.getLogFilePaths()
        };
    }
}

module.exports = LoggingConfig;