// Bot Initialization Module
const { Telegraf } = require('telegraf');
const Redis = require('ioredis');

class BotInitializer {
    constructor(config, monitoring) {
        this.config = config;
        this.monitoring = monitoring;
        this.bot = null;
        this.redis = null;
        this.database = null;
        this.monorailAPI = null;
        this.sessionManager = null;
    }

    async initialize() {
        try {
            this.monitoring.logInfo('Starting bot initialization...');

            // Initialize Redis connection
            await this.initializeRedis();

            // Initialize database connection
            await this.initializeDatabase();

            // Initialize Monorail API
            await this.initializeMonorailAPI();

            // Initialize Telegram bot
            await this.initializeTelegramBot();

            // Initialize session manager
            await this.initializeSessionManager();

            // Setup graceful shutdown
            this.setupGracefulShutdown();

            this.monitoring.logInfo('Bot initialization completed successfully');

            return {
                bot: this.bot,
                redis: this.redis,
                database: this.database,
                monorailAPI: this.monorailAPI,
                sessionManager: this.sessionManager
            };

        } catch (error) {
            this.monitoring.logError('Bot initialization failed', error);
            throw error;
        }
    }

    async initializeRedis() {
        try {
            if (!this.config.redis.enabled) {
                this.monitoring.logInfo('Redis disabled, skipping initialization');
                return;
            }

            this.redis = new Redis({
                host: this.config.redis.host,
                port: this.config.redis.port,
                password: this.config.redis.password,
                db: this.config.redis.db || 0,
                retryDelayOnFailover: 100,
                enableReadyCheck: true,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                connectTimeout: 10000,
                commandTimeout: 5000
            });

            // Test connection
            await this.redis.ping();
            this.monitoring.logInfo('Redis connection established');

            // Setup Redis event handlers
            this.redis.on('error', (error) => {
                this.monitoring.logError('Redis connection error', error);
            });

            this.redis.on('connect', () => {
                this.monitoring.logInfo('Redis connected');
            });

            this.redis.on('ready', () => {
                this.monitoring.logInfo('Redis ready');
            });

            this.redis.on('close', () => {
                this.monitoring.logWarning('Redis connection closed');
            });

        } catch (error) {
            this.monitoring.logError('Redis initialization failed', error);
            this.redis = null; // Continue without Redis
        }
    }

    async initializeDatabase() {
        try {
            const DatabasePostgreSQL = require('../database-postgresql');
            this.database = new DatabasePostgreSQL(this.config.database, this.monitoring, this.redis);
            
            // Test database connection
            await this.database.testConnection();
            this.monitoring.logInfo('Database connection established');

        } catch (error) {
            this.monitoring.logError('Database initialization failed', error);
            throw error; // Database is critical, fail initialization
        }
    }

    async initializeMonorailAPI() {
        try {
            const MonorailAPI = require('../monorail');
            this.monorailAPI = new MonorailAPI(this.config.monorail, this.monitoring, this.redis);
            
            // Test API connection
            const healthCheck = await this.monorailAPI.healthCheck();
            if (!healthCheck.success) {
                throw new Error('Monorail API health check failed');
            }
            
            this.monitoring.logInfo('Monorail API initialized');

        } catch (error) {
            this.monitoring.logError('Monorail API initialization failed', error);
            throw error; // API is critical, fail initialization
        }
    }

    async initializeTelegramBot() {
        try {
            if (!this.config.telegram.token) {
                throw new Error('Telegram bot token not provided');
            }

            this.bot = new Telegraf(this.config.telegram.token);

            // Set bot commands
            await this.setBotCommands();

            this.monitoring.logInfo('Telegram bot initialized');

        } catch (error) {
            this.monitoring.logError('Telegram bot initialization failed', error);
            throw error;
        }
    }

    async initializeSessionManager() {
        try {
            const SessionManager = require('../sessionManager');
            this.sessionManager = new SessionManager(this.database, this.redis, this.monitoring);
            
            this.monitoring.logInfo('Session manager initialized');

        } catch (error) {
            this.monitoring.logWarning('Session manager initialization failed', error);
            // Continue without session manager
            this.sessionManager = null;
        }
    }

    async setBotCommands() {
        const commands = [
            { command: 'start', description: 'Initialize bot and wallet' },
            { command: 'buy', description: 'Buy tokens with MON' },
            { command: 'sell', description: 'Sell tokens for MON' },
            { command: 'portfolio', description: 'View portfolio and P&L' },
            { command: 'wallet', description: 'Wallet management' },
            { command: 'transfer', description: 'Send MON to address' },
            { command: 'categories', description: 'Browse token categories' },
            { command: 'settings', description: 'Configure preferences' },
            { command: 'help', description: 'Show help information' }
        ];

        try {
            await this.bot.telegram.setMyCommands(commands);
            this.monitoring.logInfo('Bot commands set successfully');
        } catch (error) {
            this.monitoring.logError('Failed to set bot commands', error);
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            this.monitoring.logInfo(`Received ${signal}, starting graceful shutdown...`);

            try {
                // Stop accepting new updates
                if (this.bot) {
                    this.bot.stop(signal);
                    this.monitoring.logInfo('Telegram bot stopped');
                }

                // Close database connections
                if (this.database && this.database.close) {
                    await this.database.close();
                    this.monitoring.logInfo('Database connections closed');
                }

                // Close Redis connection
                if (this.redis) {
                    this.redis.disconnect();
                    this.monitoring.logInfo('Redis connection closed');
                }

                this.monitoring.logInfo('Graceful shutdown completed');
                process.exit(0);

            } catch (error) {
                this.monitoring.logError('Error during graceful shutdown', error);
                process.exit(1);
            }
        };

        // Handle shutdown signals
        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.monitoring.logError('Uncaught exception', error);
            shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.monitoring.logError('Unhandled rejection', reason, { promise });
            shutdown('unhandledRejection');
        });
    }

    // Health check endpoint
    async healthCheck() {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {}
        };

        try {
            // Check database
            if (this.database) {
                try {
                    await this.database.testConnection();
                    health.services.database = 'healthy';
                } catch (error) {
                    health.services.database = 'unhealthy';
                    health.status = 'degraded';
                }
            }

            // Check Redis
            if (this.redis) {
                try {
                    await this.redis.ping();
                    health.services.redis = 'healthy';
                } catch (error) {
                    health.services.redis = 'unhealthy';
                    health.status = 'degraded';
                }
            }

            // Check Monorail API
            if (this.monorailAPI) {
                try {
                    const apiHealth = await this.monorailAPI.healthCheck();
                    health.services.monorail = apiHealth.success ? 'healthy' : 'unhealthy';
                    if (!apiHealth.success) {
                        health.status = 'degraded';
                    }
                } catch (error) {
                    health.services.monorail = 'unhealthy';
                    health.status = 'degraded';
                }
            }

            // Check Telegram bot
            if (this.bot) {
                try {
                    await this.bot.telegram.getMe();
                    health.services.telegram = 'healthy';
                } catch (error) {
                    health.services.telegram = 'unhealthy';
                    health.status = 'unhealthy';
                }
            }

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    // Get initialization status
    getStatus() {
        return {
            bot: !!this.bot,
            redis: !!this.redis,
            database: !!this.database,
            monorailAPI: !!this.monorailAPI,
            sessionManager: !!this.sessionManager
        };
    }

    // Validate configuration
    validateConfig() {
        const required = [
            'telegram.token',
            'database.host',
            'database.port',
            'database.name',
            'database.user',
            'database.password',
            'monorail.baseUrl',
            'monorail.appId'
        ];

        const missing = [];

        for (const path of required) {
            const keys = path.split('.');
            let current = this.config;
            
            for (const key of keys) {
                if (current && typeof current === 'object' && key in current) {
                    current = current[key];
                } else {
                    missing.push(path);
                    break;
                }
            }
        }

        if (missing.length > 0) {
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }

        return true;
    }
}

module.exports = BotInitializer;
