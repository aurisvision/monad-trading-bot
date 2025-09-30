/**
 * ModularBot - Refactored main bot class using modular components
 * This replaces the monolithic structure with organized, maintainable modules
 */

const { Telegraf } = require('telegraf');

// Core modules
const BotInitializer = require('./BotInitializer');
const SettingsManager = require('./SettingsManager');
const MiddlewareManager = require('./MiddlewareManager');
const HandlerRegistry = require('./HandlerRegistry');
const HealthServerManager = require('./HealthServerManager');

// Migration system
const HandlerManager = require('./HandlerManager');
const MigrationConfig = require('../config/MigrationConfig');

class ModularBot {
    constructor() {
        this.bot = null;
        this.dependencies = {};
        this.modules = {};
        this.isInitialized = false;
        this.isStarted = false;
    }

    /**
     * Initialize the bot and all its components
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Area51 Modular Bot...');

            // 1. Initialize core bot
            await this.initializeBot();

            // 2. Initialize all dependencies
            await this.initializeDependencies();

            // 3. Initialize modular components
            await this.initializeModules();

            // 4. Setup middleware
            await this.setupMiddleware();

            // 5. Register handlers (with migration support)
            await this.registerHandlers();

            // 6. Start health server
            await this.startHealthServer();

            this.isInitialized = true;
            console.log('✅ Area51 Modular Bot initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize bot:', error);
            this.dependencies.monitoring?.logError('Bot initialization failed', error);
            throw error;
        }
    }

    /**
     * Initialize core bot instance
     */
    async initializeBot() {
        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
            throw new Error('BOT_TOKEN environment variable is required');
        }

        this.bot = new Telegraf(botToken);
        console.log('✅ Bot instance created');
    }

    /**
     * Initialize all dependencies using BotInitializer
     */
    async initializeDependencies() {
        console.log('🔧 Initializing dependencies...');

        const initializer = new BotInitializer();
        this.dependencies = await initializer.initializeComponents();

        // Add bot instance to dependencies
        this.dependencies.bot = this.bot;

        console.log('✅ All dependencies initialized');
    }

    /**
     * Initialize modular components
     */
    async initializeModules() {
        console.log('📦 Initializing modules...');

        // Settings Manager
        this.modules.settingsManager = new SettingsManager(
            this.bot,
            this.dependencies.database,
            this.dependencies.monitoring
        );

        // Middleware Manager
        this.modules.middlewareManager = new MiddlewareManager(
            this.bot,
            this.dependencies.database,
            this.dependencies.monitoring,
            this.dependencies.simpleAccessCode
        );

        // Handler Registry
        this.modules.handlerRegistry = new HandlerRegistry(
            this.bot,
            {
                ...this.dependencies,
                settingsManager: this.modules.settingsManager
            }
        );

        // Health Server Manager
        this.modules.healthServerManager = new HealthServerManager(this.dependencies);

        // Migration system (if enabled)
        if (process.env.ENABLE_MIGRATION === 'true') {
            this.modules.migrationConfig = new MigrationConfig();
            this.modules.handlerManager = new HandlerManager(this.dependencies, this.modules.migrationConfig);
            
            console.log('🔄 Migration system enabled');
        }

        console.log('✅ All modules initialized');
    }

    /**
     * Setup middleware
     */
    async setupMiddleware() {
        console.log('🔧 Setting up middleware...');

        await this.modules.middlewareManager.setupMiddleware();

        // Setup optional middleware if enabled
        if (process.env.ENABLE_RATE_LIMITING === 'true') {
            this.modules.middlewareManager.setupOptionalMiddleware();
        }

        console.log('✅ Middleware setup complete');
    }

    /**
     * Register handlers with migration support
     */
    async registerHandlers() {
        console.log('📝 Registering handlers...');

        if (this.modules.handlerManager) {
            // Use migration system for gradual handler rollout
            await this.modules.handlerManager.initializeHandlers();
            console.log('✅ Handlers registered with migration support');
        } else {
            // Use direct handler registration
            await this.modules.handlerRegistry.registerAllHandlers();
            console.log('✅ Handlers registered directly');
        }

        // Log registration statistics
        const stats = this.modules.handlerRegistry.getRegistrationStats();
        console.log(`📊 Handler registration stats: ${stats.totalHandlers} handlers registered`);
    }

    /**
     * Start health server
     */
    async startHealthServer() {
        try {
            await this.modules.healthServerManager.startHealthServer();
            
            const serverInfo = this.modules.healthServerManager.getServerInfo();
            console.log(`🏥 Health server running on port ${serverInfo.port}`);
            
        } catch (error) {
            console.warn('⚠️ Health server failed to start:', error.message);
            this.dependencies.monitoring?.logError('Health server startup failed', error);
            // Don't throw - health server is optional
        }
    }

    /**
     * Start the bot
     */
    async start() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log('🚀 Starting bot...');

            // Start background services
            await this.startBackgroundServices();

            // Launch bot
            await this.bot.launch();

            this.isStarted = true;
            console.log('✅ Area51 Bot is now running!');

            // Setup graceful shutdown
            this.setupGracefulShutdown();

        } catch (error) {
            console.error('❌ Failed to start bot:', error);
            this.dependencies.monitoring?.logError('Bot startup failed', error);
            throw error;
        }
    }

    /**
     * Start background services
     */
    async startBackgroundServices() {
        try {
            console.log('🔄 Starting background services...');

            // Start background refresh service
            if (this.dependencies.backgroundRefreshService) {
                await this.dependencies.backgroundRefreshService.start();
                console.log('✅ Background refresh service started');
            }

            // Start cache warmer
            if (this.dependencies.cacheWarmer) {
                await this.dependencies.cacheWarmer.start();
                console.log('✅ Cache warmer started');
            }

            // Start monitoring
            if (this.dependencies.monitoring) {
                await this.dependencies.monitoring.start();
                console.log('✅ Monitoring started');
            }

        } catch (error) {
            console.warn('⚠️ Some background services failed to start:', error.message);
            this.dependencies.monitoring?.logError('Background services startup failed', error);
            // Don't throw - background services are optional
        }
    }

    /**
     * Setup graceful shutdown
     */
    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
            
            try {
                await this.stop();
                console.log('✅ Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };

        // Handle different shutdown signals
        process.once('SIGINT', () => gracefulShutdown('SIGINT'));
        process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon
    }

    /**
     * Stop the bot and all services
     */
    async stop() {
        try {
            console.log('🛑 Stopping bot...');

            // Stop bot
            if (this.bot && this.isStarted) {
                await this.bot.stop();
                console.log('✅ Bot stopped');
            }

            // Stop background services
            await this.stopBackgroundServices();

            // Stop health server
            if (this.modules.healthServerManager) {
                await this.modules.healthServerManager.stopHealthServer();
            }

            // Close database connections
            if (this.dependencies.database) {
                await this.dependencies.database.close();
                console.log('✅ Database connections closed');
            }

            // Close Redis connections
            if (this.dependencies.redis) {
                await this.dependencies.redis.quit();
                console.log('✅ Redis connections closed');
            }

            this.isStarted = false;
            console.log('✅ Bot shutdown complete');

        } catch (error) {
            console.error('❌ Error during bot shutdown:', error);
            this.dependencies.monitoring?.logError('Bot shutdown error', error);
            throw error;
        }
    }

    /**
     * Stop background services
     */
    async stopBackgroundServices() {
        try {
            console.log('🔄 Stopping background services...');

            // Stop background refresh service
            if (this.dependencies.backgroundRefreshService) {
                await this.dependencies.backgroundRefreshService.stop();
                console.log('✅ Background refresh service stopped');
            }

            // Stop cache warmer
            if (this.dependencies.cacheWarmer) {
                await this.dependencies.cacheWarmer.stop();
                console.log('✅ Cache warmer stopped');
            }

            // Stop monitoring
            if (this.dependencies.monitoring) {
                await this.dependencies.monitoring.stop();
                console.log('✅ Monitoring stopped');
            }

        } catch (error) {
            console.warn('⚠️ Some background services failed to stop cleanly:', error.message);
        }
    }

    /**
     * Get bot status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            started: this.isStarted,
            uptime: this.isStarted ? process.uptime() : 0,
            modules: Object.keys(this.modules),
            dependencies: Object.keys(this.dependencies),
            migration: {
                enabled: !!this.modules.handlerManager,
                config: this.modules.migrationConfig?.getConfig() || null
            }
        };
    }

    /**
     * Get migration status (if enabled)
     */
    getMigrationStatus() {
        if (!this.modules.handlerManager) {
            return { enabled: false, message: 'Migration system not enabled' };
        }

        return this.modules.handlerManager.getMigrationStatus();
    }

    /**
     * Enable handler migration for specific users
     */
    async enableMigrationForUsers(userIds) {
        if (!this.modules.handlerManager) {
            throw new Error('Migration system not enabled');
        }

        return await this.modules.handlerManager.enableHandlerMigration(userIds);
    }

    /**
     * Disable handler migration for specific users
     */
    async disableMigrationForUsers(userIds) {
        if (!this.modules.handlerManager) {
            throw new Error('Migration system not enabled');
        }

        return await this.modules.handlerManager.disableHandlerMigration(userIds);
    }

    /**
     * Perform emergency rollback
     */
    async emergencyRollback() {
        if (!this.modules.handlerManager) {
            throw new Error('Migration system not enabled');
        }

        return await this.modules.handlerManager.emergencyRollback();
    }

    /**
     * Get handler registration statistics
     */
    getHandlerStats() {
        return this.modules.handlerRegistry.getRegistrationStats();
    }

    /**
     * Get health server info
     */
    getHealthServerInfo() {
        return this.modules.healthServerManager.getServerInfo();
    }
}

module.exports = ModularBot;