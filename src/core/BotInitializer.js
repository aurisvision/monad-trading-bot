/**
 * BotInitializer - Handles all component initialization for Area51 Bot
 * Extracted from main bot file for better modularity and maintainability
 */

const Database = require('../database-postgresql');
const WalletManager = require('../wallet');
const MonorailAPI = require('../monorail');
const UnifiedCacheManager = require('../services/UnifiedCacheManager');
const CacheWarmer = require('../utils/cacheWarmer');
const BackupService = require('../services/BackupService');
const UnifiedMonitoringSystem = require('../monitoring/UnifiedMonitoringSystem');
const UnifiedErrorHandler = require('../middleware/UnifiedErrorHandler');
const TradingInterface = require('../trading/TradingInterface');
const Redis = require('redis');

// Redis services
const RedisMetrics = require('../services/RedisMetrics');
const RedisFallbackManager = require('../services/RedisFallbackManager');
const BackgroundRefreshService = require('../services/BackgroundRefreshService');

// Handler modules
const WalletHandlers = require('../handlers/walletHandlers');
const PortfolioHandlers = require('../handlers/portfolioHandlers');
const NavigationHandlers = require('../handlers/navigationHandlers');

// Access control system
const SimpleAccessCode = require('../services/SimpleAccessCode');
const AccessMiddleware = require('../middleware/accessMiddleware');
const SimpleAccessHandler = require('../handlers/simpleAccessHandler');

// Utilities
const StateManager = require('../services/StateManager');

class BotInitializer {
    constructor(bot) {
        this.bot = bot;
        this.components = {};
    }

    /**
     * Initialize all bot components
     */
    async initializeComponents() {
        try {
            await this.initializeDatabase();
            await this.initializeRedis();
            await this.initializeMonitoring();
            await this.initializeRedisServices();
            await this.initializeBackupService();
            await this.initializeCoreServices();
            await this.initializeTradingSystem();
            await this.initializeHandlers();
            await this.initializeAccessSystem();
            await this.initializeUtilities();
            
            console.log('✅ All components initialized successfully');
            return this.components;
        } catch (error) {
            console.error('❌ Component initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Initialize database connection
     */
    async initializeDatabase() {
        this.components.database = new Database();
        await this.components.database.initialize();
        console.log('✅ Database initialized');
    }

    /**
     * Initialize Redis with smart fallback
     */
    async initializeRedis() {
        try {
            // First attempt: without username (most common case)
            const redisUrl = `redis://:${process.env.REDIS_PASSWORD || ''}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
            this.components.redis = Redis.createClient({
                url: redisUrl,
                socket: {
                    connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
                    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
                    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
                }
            });

            const connectPromise = this.components.redis.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis connection timeout')), 8000)
            );

            await Promise.race([connectPromise, timeoutPromise]);
            console.log('✅ Redis connected successfully (without username)');
            
        } catch (error) {
            console.warn('⚠️ Redis connection without username failed, trying with username');
            
            // Second attempt: with username if provided
            if (process.env.REDIS_USERNAME) {
                try {
                    // Close the previous connection attempt
                    if (this.components.redis) {
                        try { await this.components.redis.disconnect(); } catch (e) {}
                    }
                    
                    const redisUrlWithUsername = `redis://${process.env.REDIS_USERNAME}:${process.env.REDIS_PASSWORD || ''}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
                    this.components.redis = Redis.createClient({
                        url: redisUrlWithUsername,
                        socket: {
                            connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
                            commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
                            reconnectStrategy: (retries) => Math.min(retries * 50, 500)
                        }
                    });

                    const connectPromise2 = this.components.redis.connect();
                    const timeoutPromise2 = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Redis connection timeout')), 8000)
                    );

                    await Promise.race([connectPromise2, timeoutPromise2]);
                    console.log('✅ Redis connected successfully (with username)');
                    
                } catch (usernameError) {
                    console.warn('⚠️ Redis connection with username also failed, running without cache');
                    this.components.redis = null;
                }
            } else {
                console.warn('⚠️ Redis connection failed, running without cache');
                this.components.redis = null;
            }
        }
    }

    /**
     * Initialize monitoring system
     */
    async initializeMonitoring() {
        try {
            this.components.monitoring = new UnifiedMonitoringSystem(
                this.components.database, 
                this.components.redis, 
                console
            );
            this.components.errorHandler = new UnifiedErrorHandler(this.components.monitoring);
            console.log('✅ Monitoring system initialized');
        } catch (error) {
            console.error('❌ Failed to initialize monitoring system:', error.message);
            // Fallback to mock monitoring
            this.components.monitoring = this.createMockMonitoring();
            console.log('⚠️ Using mock monitoring system');
        }
    }

    /**
     * Initialize Redis-related services
     */
    async initializeRedisServices() {
        if (this.components.redis) {
            this.components.redisMetrics = new RedisMetrics(this.components.monitoring);
            this.components.redisFallbackManager = new RedisFallbackManager(
                this.components.redis, 
                this.components.monitoring
            );
            
            // Initialize unified cache system
            this.components.cacheService = new UnifiedCacheManager(
                this.components.redis, 
                this.components.monitoring
            );
            this.components.unifiedCache = this.components.cacheService; // Unified reference

            // Initialize cache warmer
            this.components.cacheWarmer = new CacheWarmer(
                this.components.database, 
                this.components.cacheService, 
                this.components.monitoring
            );
            this.components.cacheWarmer.startScheduledWarming();

            // Start periodic cleanup for fallback manager
            this.components.redisFallbackManager.startPeriodicCleanup();
            
            console.log('✅ Redis services initialized');
        } else {
            this.components.redisMetrics = null;
            this.components.redisFallbackManager = null;
            this.components.cacheService = null;
            console.log('⚠️ Redis services skipped (no Redis connection)');
        }
    }

    /**
     * Initialize backup service
     */
    async initializeBackupService() {
        if (this.components.database && this.components.redis) {
            this.components.backupService = new BackupService(
                this.components.database, 
                this.components.redis, 
                console, 
                this.components.monitoring
            );
            await this.components.backupService.initialize();
            
            // Add backup service to monitoring
            if (this.components.monitoring) {
                this.components.monitoring.backupService = this.components.backupService;
            }
            
            console.log('✅ Backup service initialized');
        } else {
            console.log('⚠️ Backup service skipped (missing dependencies)');
        }
    }

    /**
     * Initialize core services
     */
    async initializeCoreServices() {
        // Add CacheService to database
        if (this.components.database) {
            this.components.database.cacheService = this.components.cacheService;
            await this.components.database.startHealthMonitoring();
        }
        
        // Initialize core services
        this.components.monorailAPI = new MonorailAPI(
            this.components.redis, 
            this.components.cacheService
        );
        this.components.walletManager = new WalletManager(
            this.components.redis, 
            this.components.database
        );
        
        this.components.portfolioService = new (require('../portfolioService'))(
            this.components.monorailAPI, 
            this.components.redis, 
            this.components.monitoring
        );
        
        console.log('✅ Core services initialized');
    }

    /**
     * Initialize unified trading system
     */
    async initializeTradingSystem() {
        const tradingDependencies = {
            redis: this.components.redis,
            database: this.components.database,
            monorailAPI: this.components.monorailAPI,
            walletManager: this.components.walletManager,
            monitoring: this.components.monitoring
        };
        
        this.components.tradingInterface = new TradingInterface(this.bot, tradingDependencies);
        console.log('✅ Unified Trading System initialized');
    }

    /**
     * Initialize handler modules
     */
    async initializeHandlers() {
        this.components.walletHandlers = new WalletHandlers(
            this.bot, 
            this.components.database, 
            this.components.walletManager, 
            this.components.monitoring, 
            this.components.redis,
            this.components.cacheService
        );
        
        this.components.portfolioHandlers = new PortfolioHandlers(
            this.bot, 
            this.components.database, 
            this.components.portfolioService,
            this.components.monitoring,
            this.components.cacheService
        );
        
        this.components.navigationHandlers = new NavigationHandlers(
            this.bot, 
            this.components.database, 
            this.components.monorailAPI, 
            this.components.monitoring, 
            this.components.redis,
            this.components.walletManager,
            null, // Will be set to main bot instance later
            this.components.cacheService
        );
        
        console.log('✅ Handler modules initialized');
    }

    /**
     * Initialize access control system
     */
    async initializeAccessSystem() {
        this.components.accessSystem = new SimpleAccessCode(
            this.components.database, 
            this.components.cacheService
        );
        this.components.accessMiddleware = new AccessMiddleware(this.components.accessSystem);
        this.components.accessHandler = new SimpleAccessHandler(
            this.bot, 
            this.components.database, 
            this.components.accessSystem
        );
        
        console.log('✅ Access control system initialized');
    }

    /**
     * Initialize utility services
     */
    async initializeUtilities() {
        if (this.components.redis && this.components.cacheService) {
            // Initialize background refresh service
            this.components.backgroundRefreshService = new BackgroundRefreshService(
                this.components.cacheService,
                this.components.database, 
                this.components.monorailAPI, 
                this.components.monitoring
            );
            this.components.backgroundRefreshService.start();

            // Initialize state manager for automatic cleanup
            this.components.stateManager = new StateManager(
                this.components.database, 
                this.components.cacheService, 
                this.components.monitoring
            );
            this.components.stateManager.startAutoCleanup(5); // Clean every 5 minutes
            
            console.log('✅ Utility services initialized');
        } else {
            console.log('⚠️ Utility services skipped (missing dependencies)');
        }
    }

    /**
     * Clean up pending operations on bot restart
     */
    async cleanupPendingOperations() {
        try {
            // Clear all pending timeouts and operations from previous sessions
            if (this.components.redis) {
                const pendingKeys = await this.components.redis.keys('area51:pending:*');
                if (pendingKeys.length > 0) {
                    await this.components.redis.del(...pendingKeys);
                    console.log(`🧹 Cleaned ${pendingKeys.length} pending operations`);
                }
            }
            
            // Clear any user states that might trigger old operations
            if (this.components.database) {
                await this.components.database.clearAllUserStates();
                console.log('🧹 Cleared all user states from previous session');
            }
            
            if (this.components.monitoring) {
                this.components.monitoring.logInfo('Pending operations cleanup completed');
            }
        } catch (error) {
            console.error('⚠️ Error during cleanup:', error.message);
            // Don't throw - this is not critical for bot startup
        }
    }

    /**
     * Create mock monitoring system for fallback
     */
    createMockMonitoring() {
        return {
            logInfo: (msg, meta) => {},
            logError: (msg, error, meta) => {},
            logWarning: (msg, meta) => {},
            getTelegramMiddleware: () => (ctx, next) => next(),
            initializeEndpoints: () => {},
            setTelegramBot: () => {},
            recordCacheHit: () => {},
            recordCacheMiss: () => {},
            updateActiveUsers: () => {},
            wrapDatabaseOperation: (op) => op,
            wrapRedisOperation: (op) => op,
            wrapTradingOperation: (op) => op,
            wrapApiCall: (op) => op
        };
    }

    /**
     * Get all initialized components
     */
    getComponents() {
        return this.components;
    }

    /**
     * Get a specific component
     */
    getComponent(name) {
        return this.components[name];
    }
}

module.exports = BotInitializer;