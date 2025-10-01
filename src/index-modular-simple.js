// Simplified Modular Area51 Bot - Working Version
// Load environment configuration from .env file
require('dotenv').config();
console.log('🔧 Loaded environment from: .env');

const { Telegraf, Markup } = require('telegraf');
const Database = require('./database-postgresql');
const WalletManager = require('./wallet');
// Legacy trading system - REPLACED by unified system
// const TradingEngine = require('./trading');
const MonorailAPI = require('./monorail');
const UnifiedCacheManager = require('./services/UnifiedCacheManager');
const CacheWarmer = require('./utils/cacheWarmer');
const BackupService = require('./services/BackupService');
const UnifiedMonitoringSystem = require('./monitoring/UnifiedMonitoringSystem');
const { createBotMiddleware } = require('./middleware/botMiddleware');
const UnifiedErrorHandler = require('./middleware/UnifiedErrorHandler');
const TransactionMiddleware = require('./middleware/transactionMiddleware');

// NEW UNIFIED TRADING SYSTEM
const TradingInterface = require('./trading/TradingInterface');

// Comprehensive Tracking System - DISABLED
// const { RateLimiter, SecurityEnhancements, SessionManager, MemoryRateLimiter, MemorySessionManager } = require('./rateLimiter');
const Redis = require('redis');

// Import Redis caching services
const RedisMetrics = require('./services/RedisMetrics');
const RedisFallbackManager = require('./services/RedisFallbackManager');
const BackgroundRefreshService = require('./services/BackgroundRefreshService');
// Import handler modules
const WalletHandlers = require('./handlers/walletHandlers');
// Legacy trading handlers - REPLACED by unified system
// const TradingHandlers = require('./handlers/tradingHandlers');
const PortfolioHandlers = require('./handlers/portfolioHandlers');
const NavigationHandlers = require('./handlers/navigationHandlers');

// Simple Access Code System
const SimpleAccessCode = require('./services/SimpleAccessCode');
const AccessMiddleware = require('./middleware/accessMiddleware');
const SimpleAccessHandler = require('./handlers/simpleAccessHandler');

// Legacy trading optimizers - REPLACED by unified system
// const TradingCacheOptimizer = require('./utils/tradingCacheOptimizer');
const StateManager = require('./services/StateManager');
// const TransactionAccelerator = require('./utils/transactionAccelerator');

class Area51BotModularSimple {
    constructor() {
        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        try {
            await this.initializeComponents();
            await this.cleanupPendingOperations();
            await this.setupMiddleware();
            this.setupHandlers();
            this.initialized = true;
            this.monitoring?.logInfo('Modular bot initialized successfully');
        } catch (error) {
            console.error('❌ Modular bot initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Clean up pending operations on bot restart to prevent old replies
     */
    async cleanupPendingOperations() {
        try {
            // Clear all pending timeouts and operations from previous sessions
            if (this.redis) {
                const pendingKeys = await this.redis.keys('area51:pending:*');
                if (pendingKeys.length > 0) {
                    await this.redis.del(...pendingKeys);
                    console.log(`🧹 Cleaned ${pendingKeys.length} pending operations`);
                }
            }
            
            // Clear any user states that might trigger old operations
            if (this.database) {
                const clearedCount = await this.database.clearAllUserStates();
                console.log(`🧹 Cleared ${clearedCount} user states from previous session`);
            }
            
            // Clear user state cache entries
            if (this.redis) {
                const stateKeys = await this.redis.keys('area51:user_state:*');
                if (stateKeys.length > 0) {
                    await this.redis.del(...stateKeys);
                    console.log(`🧹 Cleared ${stateKeys.length} user state cache entries`);
                }
            }
            
            this.monitoring?.logInfo('Pending operations cleanup completed');
        } catch (error) {
            console.error('⚠️ Error during cleanup:', error.message);
            // Don't throw - this is not critical for bot startup
        }
    }

    async initializeComponents() {
        // Initialize database first
        this.database = new Database();
        await this.database.initialize();
        
        // Initialize Redis with smart fallback (try without username first, then with username)
        try {
            // First attempt: without username (most common case)
            const redisUrl = `redis://:${process.env.REDIS_PASSWORD || ''}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
            this.redis = Redis.createClient({
                url: redisUrl,
                socket: {
                    connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
                    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
                    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
                }
            });

            const connectPromise = this.redis.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis connection timeout')), 8000)
            );

            await Promise.race([connectPromise, timeoutPromise]);
            this.monitoring?.logInfo('Redis connected successfully (without username)');
            
        } catch (error) {
            this.monitoring?.logWarning('Redis connection without username failed, trying with username', { error: error.message });
            
            // Second attempt: with username if provided
            if (process.env.REDIS_USERNAME) {
                try {
                    // Close the previous connection attempt
                    if (this.redis) {
                        try { await this.redis.disconnect(); } catch (e) {}
                    }
                    
                    const redisUrlWithUsername = `redis://${process.env.REDIS_USERNAME}:${process.env.REDIS_PASSWORD || ''}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
                    this.redis = Redis.createClient({
                        url: redisUrlWithUsername,
                        socket: {
                            connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
                            commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
                            reconnectStrategy: (retries) => Math.min(retries * 50, 500)
                        }
                    });

                    const connectPromise2 = this.redis.connect();
                    const timeoutPromise2 = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Redis connection timeout')), 8000)
                    );

                    await Promise.race([connectPromise2, timeoutPromise2]);
                    this.monitoring?.logInfo('Redis connected successfully (with username)');
                    
                } catch (usernameError) {
                    this.monitoring?.logWarning('Redis connection with username also failed, running without cache', { error: usernameError.message });
                    this.redis = null;
                }
            } else {
                this.monitoring?.logWarning('Redis connection failed, running without cache', { error: error.message });
                this.redis = null;
            }
        }

        // Initialize unified monitoring system
        try {
            this.monitoring = new UnifiedMonitoringSystem(this.database, this.redis, console);
            // Initialize unified error handler
            this.errorHandler = new UnifiedErrorHandler(this.monitoring);
            // Unified monitoring system initialized - no need to log to itself
        } catch (error) {
            console.error('❌ Failed to initialize monitoring system:', error.message);
            // Fallback to mock monitoring
            this.monitoring = {
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
        
        // Initialize Redis services after monitoring
        if (this.redis) {
            this.redisMetrics = new RedisMetrics(this.monitoring);
            this.redisFallbackManager = new RedisFallbackManager(this.redis, this.monitoring);
            
            // Initialize Enhanced Cache Cluster System
            const cacheConfig = {
                redis: this.redis, // Pass the existing Redis connection
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                db: parseInt(process.env.REDIS_DB) || 0
            };
            
            // Initialize unified cache system
            this.cacheService = new UnifiedCacheManager(this.redis, this.monitoring);
            this.unifiedCache = this.cacheService; // Unified reference

            // Initialize cache warmer
            this.cacheWarmer = new CacheWarmer(this.database, this.cacheService, this.monitoring);
            this.cacheWarmer.startScheduledWarming();

            // Start periodic cleanup for fallback manager
            this.redisFallbackManager.startPeriodicCleanup();
        } else {
            this.redisMetrics = null;
            this.redisFallbackManager = null;
            this.cacheService = null;
        }

        // Initialize backup service after database and redis
        if (this.database && this.redis) {
            this.backupService = new BackupService(this.database, this.redis, console, this.monitoring);
            await this.backupService.initialize();
            
            // Add backup service to monitoring
            if (this.monitoring) {
                this.monitoring.backupService = this.backupService;
            }
        }

        // Add CacheService to database
        if (this.database) {
            this.database.cacheService = this.cacheService;
            await this.database.startHealthMonitoring();
        }
        
        // Initialize services
        this.monorailAPI = new MonorailAPI(this.redis, this.cacheService);
        this.walletManager = new WalletManager(this.redis, this.database);
        
        // Cache monitoring is now integrated in the unified cache system
        
        // NEW UNIFIED TRADING SYSTEM - Replace legacy trading handlers
        const tradingDependencies = {
            redis: this.redis,
            database: this.database,
            monorailAPI: this.monorailAPI,
            walletManager: this.walletManager,
            monitoring: this.monitoring
        };
        
        this.tradingInterface = new TradingInterface(this.bot, tradingDependencies);
        console.log('✅ Unified Trading System initialized successfully');
        
        // this.portfolioManager = new PortfolioManager(this.monorailAPI, this.database, this.redis); // Removed - using portfolioService instead
        this.portfolioService = new (require('./services/PortfolioService'))(this.monorailAPI, this.redis, this.monitoring);
            
        if (this.redis && this.cacheService) {
            // Initialize background refresh service
            this.backgroundRefreshService = new BackgroundRefreshService(
                this.cacheService,
                this.database, 
                this.monorailAPI, 
                this.monitoring
            );
            this.backgroundRefreshService.start();
            this.monitoring?.logInfo('Background refresh service started', {});

            // Initialize state manager for automatic cleanup
            this.stateManager = new StateManager(this.database, this.cacheService, this.monitoring);
            this.stateManager.startAutoCleanup(5); // Clean every 5 minutes
            this.monitoring?.logInfo('State manager initialized', {});

            // Legacy transaction accelerator - REPLACED by unified system
            // this.transactionAccelerator = new TransactionAccelerator(this.database, this.cacheService, this.monitoring);
            // this.monitoring?.logInfo('Transaction accelerator initialized', {});
        }
        
        // Initialize security and rate limiting - DISABLED
        // if (this.redis) {
        //     this.rateLimiter = new RateLimiter(this.redis, this.monitoring);
        //     this.sessionManager = new SessionManager(this.redis, this.monitoring);
        // } else {
        //     this.rateLimiter = new MemoryRateLimiter(this.monitoring);
        //     this.sessionManager = new MemorySessionManager(this.monitoring);
        // }
        // this.security = new SecurityEnhancements(this.monitoring);
        
        // Start health check server with monitoring endpoints
        await this.startHealthServer();
        
        // Set bot instance for admin alerts (only if real monitoring system)
        if (this.monitoring.setTelegramBot) {
            this.monitoring.setTelegramBot(this.bot);
        }
        
        // Initialize handler modules
        this.walletHandlers = new WalletHandlers(
            this.bot, 
            this.database, 
            this.walletManager, 
            this.monitoring, 
            this.redis,
            this.cacheService
        );
        
        // Unified Trading System already initialized above
        
        this.portfolioHandlers = new PortfolioHandlers(
            this.bot, 
            this.database, 
            this.portfolioService,
            this.monitoring,
            this.cacheService
        );
        
        this.navigationHandlers = new NavigationHandlers(
            this.bot, 
            this.database, 
            this.monorailAPI, 
            this.monitoring, 
            this.redis,
            this.walletManager,
            this, // Pass main bot instance
            this.cacheService
        );
        
        // Legacy trading cache optimizer - REPLACED by unified system
        // this.tradingCacheOptimizer = new TradingCacheOptimizer(
        //     this.database,
        // Initialize Simple Access Code System
        this.accessSystem = new SimpleAccessCode(this.database, this.cacheService);
        this.accessMiddleware = new AccessMiddleware(this.accessSystem);
        this.accessHandler = new SimpleAccessHandler(this.bot, this.database, this.accessSystem);
        
        console.log('[Main] Simple Access Code System initialized');
    }

    async setupMiddleware() {
        // Access control middleware (must be first)
        this.bot.use(async (ctx, next) => {
            await this.accessMiddleware.checkAccess(ctx, next);
        });
        
        // Global error handling
        this.bot.catch((err, ctx) => {
            this.monitoring.logError('Bot error occurred', err, {
                userId: ctx.from?.id,
                updateType: ctx.updateType
            });
        });

        // Rate limiting middleware - DISABLED
        // if (process.env.RATE_LIMIT_ENABLED === 'true' && this.rateLimiter) {
        //     this.bot.use(this.rateLimiter.middleware('requests'));
        // }

        // Security middleware - DISABLED
        // if (this.security) {
        //     this.bot.use(this.security.middleware());
        // }

        // Use monitoring middleware for Telegram (only if real monitoring system)
        if (this.monitoring.getTelegramMiddleware) {
            this.bot.use(this.monitoring.getTelegramMiddleware());
        }

        // Use unified bot middleware (rate limiting, sessions, auth, error handling)
        if (this.database && this.monitoring) {
            const middlewares = createBotMiddleware(this.database, this.monitoring, this.redis, this.cacheService);
            middlewares.forEach(middleware => this.bot.use(middleware));
        }

        // Legacy transaction acceleration middleware - REPLACED by unified system
        // if (this.transactionAccelerator) {
        //     const transactionMiddleware = new TransactionMiddleware(this.transactionAccelerator, this.monitoring);
        //     this.bot.use(transactionMiddleware.middleware());
        //     console.log('🚀 Transaction acceleration middleware enabled');
        // }

        // User activity tracking
        this.bot.use(async (ctx, next) => {
            const userId = ctx.from?.id;
            if (userId && this.database) {
                await this.database.trackUserActivity(userId);
            }
            await next();
        });
    }

    async startHealthServer() {
        if (!this.monitoring || !this.monitoring.initializeEndpoints) {
            console.warn('⚠️ Monitoring system not available, skipping health server');
            return;
        }

        const express = require('express');
        const app = express();
        const port = process.env.HEALTH_CHECK_PORT || 3001;

        // Add JSON middleware
        app.use(express.json());

        // Initialize monitoring endpoints
        this.monitoring.initializeEndpoints(app);

        // Try to start server with retry logic
        const startServer = (retryPort) => {
            return new Promise((resolve, reject) => {
                const server = app.listen(retryPort, () => {
                    console.log(`✅ Health check server started on port ${retryPort}`);
                    console.log(`📊 Metrics: http://localhost:${retryPort}/metrics`);
                    console.log(`🏥 Health: http://localhost:${retryPort}/health`);
                    console.log(`📈 Dashboard: http://localhost:${retryPort}/monitoring`);
                    resolve(server);
                });

                server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        reject(new Error(`Port ${retryPort} is busy`));
                    } else {
                        reject(error);
                    }
                });
            });
        };

        // Try original port, then alternatives
        const ports = [port, port + 1, port + 2, port + 10];
        
        for (const tryPort of ports) {
            try {
                this.healthServer = await startServer(tryPort);
                break;
            } catch (error) {
                if (tryPort === ports[ports.length - 1]) {
                    console.warn(`⚠️ All ports busy (${ports.join(', ')}), health server not started`);
                    console.warn('⚠️ Health checks will be available through internal monitoring only');
                }
            }
        }
    }

    setupHandlers() {
        // Additional handlers FIRST (to avoid conflicts)
        this.setupAdditionalHandlers();
        
        // Setup handlers for each module
        this.navigationHandlers.setupHandlers();
        this.walletHandlers.setupHandlers();
        // Legacy trading handlers - REPLACED by unified system (handlers setup in TradingInterface constructor)
        // this.tradingHandlers.setupHandlers();
        this.portfolioHandlers.setupHandlers();
        
        console.log('✅ All handlers setup complete (including unified trading system)');
    }

    setupAdditionalHandlers() {
        // Start Trading handler (for access code success)
        this.bot.action('start_trading', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStart(ctx);
        });

        // Settings handlers
        this.bot.action('settings', async (ctx) => {
            await this.showSettings(ctx);
        });

        // Buy Settings handlers
        this.bot.action('buy_settings', async (ctx) => {
            await this.showBuySettings(ctx);
        });

        this.bot.action('buy_gas_settings', async (ctx) => {
            await this.showBuyGasSettings(ctx);
        });

        this.bot.action('buy_slippage_settings', async (ctx) => {
            await this.showBuySlippageSettings(ctx);
        });

        // Auto Buy handlers
        this.bot.action('auto_buy_settings', async (ctx) => {
            await this.showAutoBuySettings(ctx);
        });

        this.bot.action('toggle_auto_buy', async (ctx) => {
            await this.toggleAutoBuy(ctx);
        });

        this.bot.action('auto_buy_amount', async (ctx) => {
            await this.showAutoBuyAmount(ctx);
        });

        // Sell Settings handlers
        this.bot.action('sell_settings', async (ctx) => {
            await this.showSellSettings(ctx);
        });

        this.bot.action('sell_gas_settings', async (ctx) => {
            await this.showSellGasSettings(ctx);
        });

        this.bot.action('sell_slippage_settings', async (ctx) => {
            await this.showSellSlippageSettings(ctx);
        });

        // Gas Settings handlers - specific handlers for defined buttons
        this.bot.action('set_buy_gas_50', async (ctx) => {
            await this.updateGasSetting(ctx, 'gas_price', 50 * 1000000000, 'buy_settings');
        });

        this.bot.action('set_buy_gas_100', async (ctx) => {
            await this.updateGasSetting(ctx, 'gas_price', 100 * 1000000000, 'buy_settings');
        });

        this.bot.action('set_sell_gas_50', async (ctx) => {
            await this.updateGasSetting(ctx, 'sell_gas_price', 50 * 1000000000, 'sell_settings');
        });

        this.bot.action('set_sell_gas_100', async (ctx) => {
            await this.updateGasSetting(ctx, 'sell_gas_price', 100 * 1000000000, 'sell_settings');
        });

        // Custom Gas handlers
        this.bot.action('buy_gas_custom', async (ctx) => {
            await this.showCustomGas(ctx, 'buy');
        });

        this.bot.action('sell_gas_custom', async (ctx) => {
            await this.showCustomGas(ctx, 'sell');
        });

        // Slippage Settings handlers - specific handlers for defined buttons
        this.bot.action('set_buy_slippage_1', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 1, 'buy_settings');
        });

        this.bot.action('set_buy_slippage_3', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 3, 'buy_settings');
        });

        this.bot.action('set_buy_slippage_5', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 5, 'buy_settings');
        });

        this.bot.action('set_buy_slippage_10', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 10, 'buy_settings');
        });

        this.bot.action('set_sell_slippage_1', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 1, 'sell_settings');
        });

        this.bot.action('set_sell_slippage_3', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 3, 'sell_settings');
        });

        this.bot.action('set_sell_slippage_5', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 5, 'sell_settings');
        });

        this.bot.action('set_sell_slippage_10', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 10, 'sell_settings');
        });

        // Auto Buy Amount handlers - specific handlers only
        this.bot.action('set_auto_buy_0.1', async (ctx) => {

            await this.updateAutoBuyAmount(ctx, 0.1);
        });

        this.bot.action('set_auto_buy_0.5', async (ctx) => {

            await this.updateAutoBuyAmount(ctx, 0.5);
        });

        this.bot.action('set_auto_buy_1', async (ctx) => {

            await this.updateAutoBuyAmount(ctx, 1);
        });

        this.bot.action('set_auto_buy_2', async (ctx) => {

            await this.updateAutoBuyAmount(ctx, 2);
        });

        this.bot.action('set_auto_buy_5', async (ctx) => {

            await this.updateAutoBuyAmount(ctx, 5);
        });

        this.bot.action('set_auto_buy_10', async (ctx) => {

            await this.updateAutoBuyAmount(ctx, 10);
        });


        // Custom Slippage handlers
        this.bot.action('buy_slippage_custom', async (ctx) => {
            await this.showCustomSlippage(ctx, 'buy');
        });

        this.bot.action('sell_slippage_custom', async (ctx) => {
            await this.showCustomSlippage(ctx, 'sell');
        });

        // Auto Buy specific handlers
        this.bot.action('auto_buy_gas', async (ctx) => {
            await this.showAutoBuyGasSettings(ctx);
        });

        this.bot.action('auto_buy_slippage', async (ctx) => {
            await this.showAutoBuySlippageSettings(ctx);
        });

        // Specific Auto Buy Gas handlers (remove regex handler that conflicts)
        this.bot.action('set_auto_buy_gas_50', async (ctx) => {

            await this.updateAutoBuyGas(ctx, 50);
        });

        this.bot.action('set_auto_buy_gas_100', async (ctx) => {

            await this.updateAutoBuyGas(ctx, 100);
        });

        this.bot.action('auto_buy_gas_custom', async (ctx) => {
            await this.showCustomGas(ctx, 'auto_buy');
        });

        // Specific Auto Buy Slippage handlers
        this.bot.action('set_auto_buy_slippage_1', async (ctx) => {

            await this.updateAutoBuySlippage(ctx, 1);
        });

        this.bot.action('set_auto_buy_slippage_3', async (ctx) => {

            await this.updateAutoBuySlippage(ctx, 3);
        });

        this.bot.action('set_auto_buy_slippage_5', async (ctx) => {

            await this.updateAutoBuySlippage(ctx, 5);
        });

        this.bot.action('set_auto_buy_slippage_10', async (ctx) => {

            await this.updateAutoBuySlippage(ctx, 10);
        });

        this.bot.action('auto_buy_slippage_custom', async (ctx) => {
            await this.showCustomSlippage(ctx, 'auto_buy');
        });

        this.bot.action('auto_buy_amount_custom', async (ctx) => {
            await this.showCustomAmount(ctx, 'auto_buy');
        });

        // Custom amounts handlers
        this.bot.action('custom_buy_amounts', async (ctx) => {
            await this.showCustomBuyAmounts(ctx);
        });

        this.bot.action('custom_sell_percentages', async (ctx) => {
            await this.showCustomSellPercentages(ctx);
        });

        // Token interface handlers
        this.bot.action(/^refresh_token_(.+)$/, async (ctx) => {
            const tokenAddress = ctx.match[1];
            await this.navigationHandlers.processTokenAddress(ctx, tokenAddress);
        });

        this.bot.action(/^view_explorer_(.+)$/, async (ctx) => {
            const tokenAddress = ctx.match[1];
            await this.handleViewExplorer(ctx, tokenAddress);
        });

        // Turbo Mode handlers
        this.bot.action('toggle_turbo_mode', async (ctx) => {

            try {
                await this.handleToggleTurboMode(ctx);
            } catch (error) {
                console.error('❌ Error in toggle_turbo_mode handler:', error);
                await ctx.reply('❌ Error processing turbo mode toggle. Please try again.');
            }
        });

        this.bot.action('confirm_turbo_enable', async (ctx) => {
            await this.handleConfirmTurboEnable(ctx);
        });

        this.bot.action('confirm_auto_buy_enable', async (ctx) => {
            await this.handleConfirmAutoBuyEnable(ctx);
        });

        // Edit individual buy amounts handlers
        this.bot.action(/^edit_buy_amount_(\d+)$/, async (ctx) => {
            const buttonIndex = parseInt(ctx.match[1]);
            await this.showEditBuyAmount(ctx, buttonIndex);
        });

        // Edit individual sell percentages handlers
        this.bot.action(/^edit_sell_percentage_(\d+)$/, async (ctx) => {
            const buttonIndex = parseInt(ctx.match[1]);
            await this.showEditSellPercentage(ctx, buttonIndex);
        });

        // Reset custom amounts handlers
        this.bot.action('reset_custom_buy_amounts', async (ctx) => {
            await this.resetCustomBuyAmounts(ctx);
        });

        this.bot.action('reset_custom_sell_percentages', async (ctx) => {
            await this.resetCustomSellPercentages(ctx);
        });

        // Refresh handler removed - handled by navigationHandlers.js to avoid conflicts

        // Command handlers - mirror button functionality
        this.bot.command('buy', async (ctx) => {
            try {
                this.monitoring?.logInfo('Buy command received', { userId: ctx.from.id });
                await this.tradingInterface.handleBuyInterface(ctx);
            } catch (error) {
                this.monitoring?.logError('Buy command failed', error, { userId: ctx.from.id });
                await ctx.reply('Error accessing buy interface. Please try again.');
            }
        });

        this.bot.command('wallet', async (ctx) => {
            try {
                this.monitoring?.logInfo('Wallet command received', { userId: ctx.from.id });
                await this.walletHandlers.showWalletInterface(ctx);
            } catch (error) {
                this.monitoring?.logError('Wallet command failed', error, { userId: ctx.from.id });
                await ctx.reply('Error accessing wallet interface. Please try again.');
            }
        });

        this.bot.command('portfolio', async (ctx) => {
            try {
                this.monitoring?.logInfo('Portfolio command received', { userId: ctx.from.id });
                await this.portfolioHandlers.handleNewPortfolio(ctx);
            } catch (error) {
                this.monitoring?.logError('Portfolio command failed', error, { userId: ctx.from.id });
                await ctx.reply('Error accessing portfolio interface. Please try again.');
            }
        });

        this.bot.command('categories', async (ctx) => {
            try {
                this.monitoring?.logInfo('Categories command received', { userId: ctx.from.id });
                await this.navigationHandlers.showTokenCategories(ctx);
            } catch (error) {
                this.monitoring?.logError('Categories command failed', error, { userId: ctx.from.id });
                await ctx.reply('Error accessing token categories. Please try again.');
            }
        });

        this.bot.command('settings', async (ctx) => {
            try {
                this.monitoring?.logInfo('Settings command received', { userId: ctx.from.id });
                await this.showSettings(ctx);
            } catch (error) {
                this.monitoring?.logError('Settings command failed', error, { userId: ctx.from.id });
                await ctx.reply('Error accessing settings. Please try again.');
            }
        });

        this.bot.command('transfer', async (ctx) => {
            try {
                this.monitoring?.logInfo('Transfer command received', { userId: ctx.from.id });
                await this.navigationHandlers.handleTransfer(ctx);
            } catch (error) {
                this.monitoring?.logError('Transfer command failed', error, { userId: ctx.from.id });
                await ctx.reply('Error accessing transfer interface. Please try again.');
            }
        });

        this.bot.command('refresh', async (ctx) => {
            try {
                this.monitoring?.logInfo('Refresh command received', { userId: ctx.from.id });
                await this.navigationHandlers.handleManualRefresh(ctx);
            } catch (error) {
                this.monitoring?.logError('Refresh command failed', error, { userId: ctx.from.id });
                await ctx.reply('Error refreshing data. Please try again.');
            }
        });

        // Docs command removed - now using direct URL button

        // Start command handler
        this.bot.start(async (ctx) => {
            this.monitoring?.logInfo('Start command received', { userId: ctx.from.id });
            await this.navigationHandlers.handleStart(ctx);
        });

        // Text message handler for custom input
        this.bot.on('text', async (ctx) => {

            const userState = await this.database.getUserState(ctx.from.id);
            this.monitoring?.logInfo('User state retrieved', { userId: ctx.from.id, state: userState?.state });
            
            if (userState?.state === 'awaiting_custom_buy_amounts') {
                await this.handleCustomBuyAmountsInput(ctx);
            } else if (userState?.state === 'awaiting_custom_sell_percentages') {
                await this.handleCustomSellPercentagesInput(ctx);
            } else if (userState?.state === 'awaiting_transfer_address') {
                await this.navigationHandlers.processTransferAddress(ctx, ctx.message.text);
            } else if (userState?.state === 'awaiting_transfer_amount') {
                await this.navigationHandlers.processTransferAmount(ctx, ctx.message.text, userState.data?.recipientAddress);
            } else if (userState?.state?.startsWith('awaiting_edit_buy_amount_')) {
                const buttonIndex = parseInt(userState.state.split('_').pop());
                await this.handleEditBuyAmountInput(ctx, buttonIndex);
            } else if (userState?.state?.startsWith('awaiting_edit_sell_percentage_')) {
                const buttonIndex = parseInt(userState.state.split('_').pop());
                await this.handleEditSellPercentageInput(ctx, buttonIndex);
            } else {
                // Handle token address input for auto buy
                const message = ctx.message.text.trim();
                if (/^0x[a-fA-F0-9]{40}$/.test(message)) {
                    // Valid token address - trigger auto buy
                    await this.navigationHandlers.processTokenAddress(ctx, message);
                } else {
                    // Delegate to navigationHandlers for all other states
                    await this.navigationHandlers.handleTextMessage(ctx);
                }
            }
        });
    }

    async showSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            // Get user settings to display current status with fallback
        let userSettings = null;
        try {
            userSettings = await this.database.getUserSettings(ctx.from.id);
        } catch (settingsError) {
            this.monitoring.logError('Failed to get user settings, using defaults', settingsError, { userId: ctx.from.id });
            // Create default settings if they don't exist
            try {
                await this.database.createUserSettings(ctx.from.id);
                userSettings = await this.database.getUserSettings(ctx.from.id);
            } catch (createError) {
                this.monitoring.logError('Failed to create user settings', createError, { userId: ctx.from.id });
                userSettings = {}; // Use empty object as fallback
            }
        }
        const turboStatus = (userSettings?.turbo_mode || false) ? '🟢' : '🔴';
            
            const settingsText = `⚙️ **Settings**

*Configure your trading preferences with precision:*

• **Buy Settings** - _Gas, slippage & auto buy configuration_
• **Sell Settings** - _Gas & slippage for sales_  
• **Turbo Mode** - _Ultra-fast execution (${turboStatus === '🟢' ? '**enabled**' : '**disabled**'})_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Buy Settings', 'buy_settings'), Markup.button.callback('Sell Settings', 'sell_settings')],
                [Markup.button.callback(`Turbo Mode ${turboStatus}`, 'toggle_turbo_mode')],
                [Markup.button.callback('Back to Main', 'back_to_main')]
            ]);

            try {
                await ctx.editMessageText(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (error) {
                await ctx.replyWithMarkdown(settingsText, keyboard);
            }
            
        } catch (error) {
            this.monitoring.logError('Settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading settings.');
        }
    }

    async start() {
        try {
            await this.init();
            
            // Health server is already started in initialization
            
            // Start the bot
            await this.bot.launch();
            this.monitoring?.logInfo('Bot launched successfully');
            this.monitoring.logInfo('🚀 Modular Area51 Bot started successfully');
            
            // Enable graceful stop
            process.once('SIGINT', () => this.stop('SIGINT'));
            process.once('SIGTERM', () => this.stop('SIGTERM'));
            
        } catch (error) {
            console.error('Bot start failed:', error);
            if (this.monitoring) {
                this.monitoring.logError('Bot start failed', error);
            }
            this.monitoring?.logError('Failed to start bot', error);
            throw error;
        }
    }


    async handleToggleTurboMode(ctx) {
        try {

            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;

            const currentSettings = await this.database.getUserSettings(userId);

            // Handle case where turbo_mode doesn't exist yet
            const currentTurboMode = currentSettings?.turbo_mode || false;
            const newTurboMode = !currentTurboMode;

            // Initialize priority system
            const GasSlippagePriority = require('./utils/gasSlippagePriority');
            const prioritySystem = new GasSlippagePriority(this.database);
            
            // Show warning message when enabling Turbo Mode
            if (newTurboMode) {
                const warningText = `⚠️ *Turbo Mode Enabled*

*WARNING:* Turbo Mode prioritizes speed over safety:
• No balance validations
• No approval checks  
• 20% slippage tolerance
• Higher gas fees for faster execution

Are you sure you want to continue?`;

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Yes, Enable Turbo', 'confirm_turbo_enable')],
                    [Markup.button.callback('❌ Cancel', 'settings')],
                ]);

                await ctx.editMessageText(warningText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } else {
                // Disable turbo mode with timestamp tracking
                await prioritySystem.updateTurboMode(userId, false);
                
                await ctx.editMessageText('✅ *Turbo Mode Disabled*\n\nSafe trading mode is now active.', {
                    parse_mode: 'Markdown'
                });
                
                setTimeout(async () => {
                    await this.showSettings(ctx);
                }, 800);
            }
            
        } catch (error) {
            this.monitoring.logError('Toggle turbo mode failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error updating turbo mode settings.');
        }
    }

    async handleConfirmTurboEnable(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            
            // Confirm turbo mode is enabled with timestamp tracking
            const GasSlippagePriority = require('./utils/gasSlippagePriority');
            const prioritySystem = new GasSlippagePriority(this.database);
            await prioritySystem.updateTurboMode(userId, true);
            
            await ctx.editMessageText('🚀 *Turbo Mode Activated!*\n\nMaximum speed trading is now enabled.\n\n⚠️ *Use with caution!*', {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                await this.showSettings(ctx);
            }, 2000);
            
        } catch (error) {
            this.monitoring.logError('Confirm turbo enable failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error enabling turbo mode.');
        }
    }

    async handleConfirmAutoBuyEnable(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            
            // Enable auto buy in database
            await this.database.updateUserSettings(userId, { auto_buy_enabled: true });
            
            await ctx.editMessageText('🔄 **Auto Buy Activated!**\n\nThe bot will now automatically purchase tokens upon detection.\n\n⚠️ **Monitor your balance carefully!**', {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                await this.showAutoBuySettings(ctx);
            }, 2000);
            
        } catch (error) {
            this.monitoring.logError('Confirm auto buy enable failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error enabling auto buy.');
        }
    }

    // Buy Settings Methods
    async showBuySettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const gasPrice = Math.round((userSettings?.gas_price || 50000000000) / 1000000000);
            const slippage = userSettings?.slippage_tolerance || 5;
            const autoBuyEnabled = userSettings?.auto_buy_enabled || false;
            const autoBuyAmount = userSettings?.auto_buy_amount || 0.1;
            const autoBuyStatus = autoBuyEnabled ? '🟢' : '🔴';
            const customAmounts = userSettings?.custom_buy_amounts || '0.1,0.5,1,5';
            
            const settingsText = `⚡️ *Buy Settings*

*Gas:* **${gasPrice} Gwei** | *Slippage:* **${slippage}%** | *Auto Buy:* **${autoBuyStatus}**

_Purchase transaction configuration:_

• **Gas Price Control** - _(minimum 50 Gwei)_
• **Slippage Tolerance** - _(no limits)_
• **Auto Buy System** - _(${autoBuyAmount} MON)_
• **Custom buy buttons** - _(${customAmounts} MON)_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Set Gas Price', 'buy_gas_settings'), Markup.button.callback('Set Slippage', 'buy_slippage_settings')],
                [Markup.button.callback('🔄 Auto Buy Settings', 'auto_buy_settings'), Markup.button.callback('⚙️ Custom Buttons', 'custom_buy_amounts')],
                [Markup.button.callback('Back to Settings', 'settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Buy settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading buy settings.');
        }
    }

    async showBuyGasSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentGas = Math.round((userSettings?.gas_price || 50000000000) / 1000000000);
            const currentCost = (currentGas * 0.00025).toFixed(4);
            
            const settingsText = `⛽️ *Gas Settings - Buy*

Current: ${currentGas} Gwei (~${currentCost} MON)

Network fee for buy transactions:

• Normal (50 Gwei) - ~0.0125 MON standard fee
• Turbo (100 Gwei) - ~0.025 MON priority processing`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Normal (50 Gwei)', 'set_buy_gas_50')],
                [Markup.button.callback('Turbo (100 Gwei)', 'set_buy_gas_100')],
                [Markup.button.callback('📝 Custom', 'buy_gas_custom')],
                [Markup.button.callback('Back', 'buy_settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Buy gas settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading buy gas settings.');
        }
    }

    async showBuySlippageSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentSlippage = userSettings?.slippage_tolerance || 5;
            
            const settingsText = `📊 **Slippage Settings - Buy**

*Current:* **${currentSlippage}%**

_Set price tolerance for market volatility:_

• **1-3%** - _Strict control, may fail in volatile conditions_
• **5-10%** - _Balanced tolerance for standard trading_
• **15-25%** - _High flexibility for volatile tokens_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('1%', 'set_buy_slippage_1'), Markup.button.callback('3%', 'set_buy_slippage_3')],
                [Markup.button.callback('5%', 'set_buy_slippage_5'), Markup.button.callback('10%', 'set_buy_slippage_10')],
                [Markup.button.callback('📝 Custom', 'buy_slippage_custom')],
                [Markup.button.callback('Back', 'buy_settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Buy slippage settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading slippage settings.');
        }
    }

    // Auto Buy Methods
    async showAutoBuySettings(ctx) {
        try {
            // Only answer callback query if it's actually a callback query
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            this.monitoring?.logInfo('Auto Buy Settings Display', {
                userId: ctx.from.id,
                auto_buy_enabled: userSettings?.auto_buy_enabled,
                auto_buy_amount: userSettings?.auto_buy_amount,
                auto_buy_gas: userSettings?.auto_buy_gas,
                auto_buy_slippage: userSettings?.auto_buy_slippage
            });
            
            const autoBuyEnabled = userSettings?.auto_buy_enabled || false;
            // Fix NaN issue by ensuring proper number conversion
            const autoBuyAmount = parseFloat(userSettings?.auto_buy_amount) || 0.1;
            // Use only auto_buy_gas, not fallback to gas_price
            const autoBuyGas = Math.round((userSettings?.auto_buy_gas || 50000000000) / 1000000000);
            // Use only auto_buy_slippage, not fallback to slippage_tolerance
            const autoBuySlippage = userSettings?.auto_buy_slippage || 5;
            const status = autoBuyEnabled ? '🟢 ON' : '🔴 OFF';

            const settingsText = `🔄 **Auto Buy Settings**

**Status:** ${status} | **Amount:** ${autoBuyAmount} MON
**Gas:** ${autoBuyGas} Gwei | **Slippage:** ${autoBuySlippage}%

⚠️ **Auto purchases tokens when detected**

Configure your automatic buying preferences:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback(`Auto Buy ${status}`, 'toggle_auto_buy')],
                [Markup.button.callback('Set Amount', 'auto_buy_amount'), Markup.button.callback('Set Gas', 'auto_buy_gas')],
                [Markup.button.callback('Set Slippage', 'auto_buy_slippage')],
                [Markup.button.callback('Back to Settings', 'settings')]
            ]);

            // Send message based on context type
            if (ctx.callbackQuery) {
                try {
                    await ctx.editMessageText(settingsText, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    });
                } catch (editError) {
                    // If message can't be edited, send new message
                    if (editError.message.includes('message is not modified') || 
                        editError.message.includes('message can\'t be edited')) {
                        await ctx.reply(settingsText, {
                            parse_mode: 'Markdown',
                            reply_markup: keyboard.reply_markup
                        });
                    } else {
                        throw editError;
                    }
                }
            } else {
                // For regular messages, always send new message
                await ctx.reply(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            }
            
        } catch (error) {
            this.monitoring.logError('Auto buy settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading auto buy settings.');
        }
    }

    async toggleAutoBuy(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const currentSettings = await this.database.getUserSettings(userId);
            const currentStatus = currentSettings?.auto_buy_enabled || false;
            const newStatus = !currentStatus;
            
            // Show warning when enabling Auto Buy
            if (newStatus) {
                const autoBuyAmount = currentSettings?.auto_buy_amount || 0.1;
                const warningText = `⚠️ **Enable Auto Buy?**

**WARNING:** This will automatically purchase **${autoBuyAmount} MON** worth of tokens immediately when new tokens are detected.

**Risks:**
• Automatic spending without manual approval
• Potential losses on volatile or scam tokens
• No manual review before purchase

Are you sure you want to enable Auto Buy?`;

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Yes, Enable Auto Buy', 'confirm_auto_buy_enable')],
                    [Markup.button.callback('❌ Cancel', 'auto_buy_settings')],
                ]);

                await ctx.editMessageText(warningText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } else {
                // Auto Buy disabled - update database and show success
                await this.database.updateUserSettings(userId, { auto_buy_enabled: false });
                
                await ctx.editMessageText('✅ **Auto Buy Disabled**\n\nManual trading mode is now active.', {
                    parse_mode: 'Markdown'
                });
                
                setTimeout(async () => {
                    await this.showAutoBuySettings(ctx);
                }, 800);
            }
            
        } catch (error) {
            this.monitoring.logError('Toggle auto buy failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error updating auto buy settings.');
        }
    }

    async showAutoBuyAmount(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentAmount = userSettings?.auto_buy_amount || 0.1;
            
            const settingsText = `💰 **Auto Buy Amount**

*Current:* **${currentAmount} MON**

_Select purchase quantity for automated buying:_

• **0.1-0.5 MON** - _Conservative amounts for testing_
• **1-2 MON** - _Standard position sizes_
• **5-10 MON** - _Aggressive position sizes_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('0.1 MON', 'set_auto_buy_0.1'), Markup.button.callback('0.5 MON', 'set_auto_buy_0.5')],
                [Markup.button.callback('1 MON', 'set_auto_buy_1'), Markup.button.callback('2 MON', 'set_auto_buy_2')],
                [Markup.button.callback('Custom Amount', 'auto_buy_amount_custom')],
                [Markup.button.callback('Back', 'auto_buy_settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Auto buy amount settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading amount settings.');
        }
    }

    // Sell Settings Methods
    async showSellSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const gasPrice = Math.round((userSettings?.sell_gas_price || userSettings?.gas_price || 50000000000) / 1000000000);
            const slippage = userSettings?.sell_slippage_tolerance || userSettings?.slippage_tolerance || 5;
            
            const customPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            
            const settingsText = `⚡️ *Sell Settings*

*Gas Price:* **${gasPrice} Gwei** | *Slippage:* **${slippage}%**

_Sale transaction configuration:_

• **Gas Price Control** - _(minimum 50 Gwei)_
• **Slippage Tolerance** - _(no limits)_
• **Custom Percentages** - _Quick sell buttons_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Gas Settings', 'sell_gas_settings'), Markup.button.callback('Slippage', 'sell_slippage_settings')],
                [Markup.button.callback('⚙️ Custom Percentages', 'custom_sell_percentages')],
                [Markup.button.callback('Back to Settings', 'settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Sell settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading sell settings.');
        }
    }

    async showSellGasSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentGas = Math.round((userSettings?.sell_gas_price || userSettings?.gas_price || 50000000000) / 1000000000);
            const currentCost = (currentGas * 0.00025).toFixed(4);
            
            const settingsText = `⚡ **Gas Settings - Sell**

*Current:* **${currentGas} Gwei** (~${currentCost} MON)

_Network fee for sell transactions:_

• **Normal (50 Gwei)** - _~0.0125 MON standard fee_
• **Turbo (100 Gwei)** - _~0.025 MON priority processing_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Normal (50 Gwei)', 'set_sell_gas_50')],
                [Markup.button.callback('Turbo (100 Gwei)', 'set_sell_gas_100')],
                [Markup.button.callback('📝 Custom', 'sell_gas_custom')],
                [Markup.button.callback('Back', 'sell_settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Sell gas settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading sell gas settings.');
        }
    }

    async showSellSlippageSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentSlippage = userSettings?.sell_slippage_tolerance || userSettings?.slippage_tolerance || 5;
            
            const settingsText = `📊 **Slippage Settings - Sell**

*Current:* **${currentSlippage}%**

_Price variance tolerance for sell transactions:_

• **1-3%** - _Strict control, may fail in volatile conditions_
• **5-10%** - _Balanced tolerance for standard trading_
• **15-25%** - _High tolerance for volatile tokens_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('1%', 'set_sell_slippage_1'), Markup.button.callback('3%', 'set_sell_slippage_3')],
                [Markup.button.callback('5%', 'set_sell_slippage_5'), Markup.button.callback('10%', 'set_sell_slippage_10')],
                [Markup.button.callback('📝 Custom', 'sell_slippage_custom')],
                [Markup.button.callback('Back', 'sell_settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Sell slippage settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading slippage settings.');
        }
    }

    // Helper Methods for Settings Updates
    async updateGasSetting(ctx, field, value, returnMenu) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;


            this.monitoring?.logInfo('Gas value update', { value, gweiValue: Math.round(value / 1000000000) });


            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);

            // Ensure user settings exist first

            await this.database.createUserSettings(userId);

            const result = await this.database.updateUserSettings(userId, { [field]: value });

            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            this.monitoring?.logInfo('Settings verification after update', {
                userId,
                auto_buy_gas: verifySettings?.auto_buy_gas,
                gas_price: verifySettings?.gas_price,
                [field]: verifySettings?.[field]
            });
            
            // Clear cache to ensure fresh data
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`settings:${userId}`),
                        this.redis.del(`user:${userId}`)
                    ]);

                } catch (cacheError) {

                }
            }
            
            await ctx.editMessageText(`✅ Gas price updated to ${Math.round(value / 1000000000)} Gwei`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                if (returnMenu === 'buy_settings') {
                    await this.showBuySettings(ctx);
                } else if (returnMenu === 'sell_settings') {
                    await this.showSellSettings(ctx);
                } else if (returnMenu === 'auto_buy_settings') {
                    await this.showAutoBuySettings(ctx);
                }
            }, 800);
            
        } catch (error) {
            console.error('❌ Update gas setting failed:', error);
            this.monitoring.logError('Update gas setting failed', error, { userId: ctx.from.id, field, value });
            await ctx.reply('❌ Error updating gas settings.');
        }
    }

    async updateSlippageSetting(ctx, field, value, returnMenu) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;

            // Ensure user settings exist first
            await this.database.createUserSettings(userId);
            
            const result = await this.database.updateUserSettings(userId, { [field]: value });

            // Clear cache to ensure fresh data
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`settings:${userId}`),
                        this.redis.del(`user:${userId}`)
                    ]);

                } catch (cacheError) {

                }
            }
            
            await ctx.editMessageText(`✅ Slippage updated to ${value}%`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                if (returnMenu === 'buy_settings') {
                    await this.showBuySettings(ctx);
                } else if (returnMenu === 'sell_settings') {
                    await this.showSellSettings(ctx);
                } else if (returnMenu === 'auto_buy_settings') {
                    await this.showAutoBuySettings(ctx);
                }
            }, 800);
            
        } catch (error) {
            console.error('❌ Update slippage setting failed:', error);
            this.monitoring.logError('Update slippage setting failed', error, { userId: ctx.from.id, field, value });
            await ctx.reply('❌ Error updating slippage settings.');
        }
    }

    async updateAutoBuyAmount(ctx, amount) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;



            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);

            // Ensure user settings exist first

            await this.database.createUserSettings(userId);

            const result = await this.database.updateUserSettings(userId, { auto_buy_amount: amount });

            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            this.monitoring?.logInfo('Settings verification after amount update', {
                userId,
                auto_buy_amount: verifySettings?.auto_buy_amount,
                auto_buy_gas: verifySettings?.auto_buy_gas,
                auto_buy_slippage: verifySettings?.auto_buy_slippage
            });
            
            // Clear cache to ensure fresh data
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`settings:${userId}`),
                        this.redis.del(`user:${userId}`)
                    ]);

                } catch (cacheError) {

                }
            }
            
            await ctx.editMessageText(`✅ Auto buy amount set to ${amount} MON`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                await this.showAutoBuySettings(ctx);
            }, 800);
            
        } catch (error) {
            console.error('❌ Update auto buy amount failed:', error);
            this.monitoring.logError('Update auto buy amount failed', error, { userId: ctx.from.id, amount });
            await ctx.reply('❌ Error updating auto buy amount.');
        }
    }

    async updateAutoBuyGas(ctx, gasGwei) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const gasWei = gasGwei * 1000000000; // Convert Gwei to Wei




            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);

            // Ensure user settings exist first

            await this.database.createUserSettings(userId);

            const result = await this.database.updateUserSettings(userId, { auto_buy_gas: gasWei });

            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            this.monitoring?.logInfo('Settings verification after gas update', {
                userId,
                auto_buy_amount: verifySettings?.auto_buy_amount,
                auto_buy_gas: verifySettings?.auto_buy_gas,
                auto_buy_slippage: verifySettings?.auto_buy_slippage
            });
            
            // Clear cache to ensure fresh data
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`settings:${userId}`),
                        this.redis.del(`user:${userId}`)
                    ]);

                } catch (cacheError) {

                }
            }
            
            await ctx.editMessageText(`✅ Auto buy gas set to ${gasGwei} Gwei`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                await this.showAutoBuySettings(ctx);
            }, 800);
            
        } catch (error) {
            console.error('❌ Update auto buy gas failed:', error);
            this.monitoring.logError('Update auto buy gas failed', error, { userId: ctx.from.id, gasGwei });
            await ctx.reply('❌ Error updating auto buy gas.');
        }
    }

    async updateAutoBuySlippage(ctx, slippage) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;



            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);

            // Ensure user settings exist first

            await this.database.createUserSettings(userId);

            const result = await this.database.updateUserSettings(userId, { auto_buy_slippage: slippage });

            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            this.monitoring?.logInfo('Settings verification after slippage update', {
                userId,
                auto_buy_amount: verifySettings?.auto_buy_amount,
                auto_buy_gas: verifySettings?.auto_buy_gas,
                auto_buy_slippage: verifySettings?.auto_buy_slippage
            });
            
            // Clear cache to ensure fresh data
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`settings:${userId}`),
                        this.redis.del(`user:${userId}`)
                    ]);

                } catch (cacheError) {

                }
            }
            
            await ctx.editMessageText(`✅ Auto buy slippage set to ${slippage}%`, {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                await this.showAutoBuySettings(ctx);
            }, 800);
            
        } catch (error) {
            console.error('❌ Update auto buy slippage failed:', error);
            this.monitoring.logError('Update auto buy slippage failed', error, { userId: ctx.from.id, slippage });
            await ctx.reply('❌ Error updating auto buy slippage.');
        }
    }

    async handleViewExplorer(ctx, tokenAddress) {
        try {
            await ctx.answerCbQuery();
            
            const explorerUrl = `https://monad.blockscout.com/token/${tokenAddress}`;
            
            await ctx.reply(`🔍 **View Token on Explorer**

📍 **Token Address:** \`${tokenAddress}\`

🌐 **Explorer Link:** [View on Blockscout](${explorerUrl})

Click the link above to view token details on the blockchain explorer.`, {
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            });
            
        } catch (error) {
            this.monitoring.logError('View explorer failed', error, { userId: ctx.from.id, tokenAddress });
            await ctx.reply('❌ Error opening explorer link.');
        }
    }

    async showCustomSlippage(ctx, type) {
        try {
            await ctx.answerCbQuery();
            
            const settingsText = `📝 **Custom Slippage - ${type === 'buy' ? 'Buy' : type === 'sell' ? 'Sell' : 'Auto Buy'}**

*Enter custom slippage percentage (minimum 0.1%):*

_Examples: 5, 25, 50, 100_

Enter any percentage up to 100% - unlimited slippage for maximum speed.`;

            await ctx.editMessageText(settingsText, {
                parse_mode: 'Markdown'
            });

            // Set user state to await custom slippage input
            const returnMenu = type === 'buy' ? 'buy_slippage_settings' : 
                             type === 'sell' ? 'sell_slippage_settings' : 
                             'auto_buy_slippage_settings';
            
            await this.database.setUserState(ctx.from.id, `awaiting_custom_slippage_${type}`, {
                returnMenu: returnMenu
            });
            
        } catch (error) {
            this.monitoring.logError('Show custom slippage failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading custom slippage.');
        }
    }

    async showCustomGas(ctx, type) {
        try {
            await ctx.answerCbQuery();
            
            const settingsText = `📝 **Custom Gas - ${type === 'buy' ? 'Buy' : type === 'sell' ? 'Sell' : 'Auto Buy'}**

*Enter custom gas price (minimum 50 Gwei):*

_Examples: 75, 200, 500, 1000_

• **50 Gwei** = ~0.0125 MON
• **200 Gwei** = ~0.05 MON
• **500 Gwei** = ~0.125 MON

Enter any gas price above 50 Gwei - unlimited for maximum speed.`;

            await ctx.editMessageText(settingsText, {
                parse_mode: 'Markdown'
            });

            // Set user state to await custom gas input
            const returnMenu = type === 'buy' ? 'buy_gas_settings' : 
                             type === 'sell' ? 'sell_gas_settings' : 
                             'auto_buy_gas_settings';
            
            await this.database.setUserState(ctx.from.id, `awaiting_custom_gas_${type}`, {
                returnMenu: returnMenu
            });
            
        } catch (error) {
            this.monitoring.logError('Show custom gas failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error showing custom gas settings.');
        }
    }

    async showCustomAmount(ctx, type) {
        try {
            await ctx.answerCbQuery();
            
            const settingsText = `📝 **Custom Auto Buy Amount**

*Enter custom amount for automatic purchases (0.01-100 MON):*

_Examples: 0.25, 1.5, 3.0_

• **0.1-1 MON** = Small auto buy positions
• **1-5 MON** = Medium auto buy positions  
• **5+ MON** = Large auto buy positions

⚠️ This amount will be used for automatic token purchases when new tokens are detected.

Please enter a number between 0.01 and 100.`;

            await ctx.editMessageText(settingsText, {
                parse_mode: 'Markdown'
            });

            // Set user state to await custom amount input
            const returnMenu = type === 'auto_buy' ? 'auto_buy_amount' : 'buy_amount_settings';
            
            await this.database.setUserState(ctx.from.id, `awaiting_custom_amount_${type}`, {
                returnMenu: returnMenu
            });
            
        } catch (error) {
            this.monitoring.logError('Show custom amount failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error showing custom amount settings.');
        }
    }

    async showCustomBuyAmounts(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            let currentAmounts = userSettings?.custom_buy_amounts || '0.1,0.5,1,5';
            
            // Ensure currentAmounts is a string
            if (typeof currentAmounts !== 'string') {
                currentAmounts = '0.1,0.5,1,5';
            }
            
            const amountsArray = currentAmounts.split(',');
            
            const settingsText = `⚙️ ***Custom Buy Amounts***

💰 **Current Buy Buttons:**
${amountsArray.map((amount, index) => `**Button ${index + 1}:** *${amount.trim()} MON*`).join('\n')}

**Click a button to edit its value:**`;

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`Edit: ${amountsArray[0]?.trim() || '0.1'}`, `edit_buy_amount_0`),
                    Markup.button.callback(`Edit: ${amountsArray[1]?.trim() || '0.5'}`, `edit_buy_amount_1`)
                ],
                [
                    Markup.button.callback(`Edit: ${amountsArray[2]?.trim() || '1'}`, `edit_buy_amount_2`),
                    Markup.button.callback(`Edit: ${amountsArray[3]?.trim() || '5'}`, `edit_buy_amount_3`)
                ],
                [Markup.button.callback('🔄 Reset to Default', 'reset_custom_buy_amounts')],
                [Markup.button.callback('🔙 Back to Buy Settings', 'buy_settings')]
            ]);

            try {
                await ctx.editMessageText(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (editError) {
                // If edit fails, send new message
                await ctx.reply(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            }
            
        } catch (error) {
            console.error('Error showing custom buy amounts:', error);
            console.error('Full error details:', error.stack || error);
            console.error('Context details:', {
                userId: ctx.from?.id,
                messageId: ctx.message?.message_id,
                callbackQuery: !!ctx.callbackQuery
            });
            // Always send reply on error
            await ctx.reply('❌ Error loading custom buy amounts settings. Please try again.');
        }
    }

    async showCustomSellPercentages(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            const percentagesArray = currentPercentages.split(',');
            
            const settingsText = `⚙️ ***Custom Sell Percentages***

📊 **Current Sell Buttons:**
${percentagesArray.map((percentage, index) => `**Button ${index + 1}:** *${percentage.trim()}%*`).join('\n')}

**Click a button to edit its value:**`;

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`Edit: ${percentagesArray[0]?.trim() || '25'}%`, `edit_sell_percentage_0`),
                    Markup.button.callback(`Edit: ${percentagesArray[1]?.trim() || '50'}%`, `edit_sell_percentage_1`)
                ],
                [
                    Markup.button.callback(`Edit: ${percentagesArray[2]?.trim() || '75'}%`, `edit_sell_percentage_2`),
                    Markup.button.callback(`Edit: ${percentagesArray[3]?.trim() || '100'}%`, `edit_sell_percentage_3`)
                ],
                [Markup.button.callback('🔄 Reset to Default', 'reset_custom_sell_percentages')],
                [Markup.button.callback('🔙 Back to Sell Settings', 'sell_settings')]
            ]);

            try {
                await ctx.editMessageText(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (editError) {
                // If edit fails, send new message
                await ctx.reply(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            }
            
        } catch (error) {
            console.error('Error showing custom sell percentages:', error);
            try {
                await ctx.reply('❌ Error loading custom sell percentages settings.');
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }

    async showEditBuyAmount(ctx, buttonIndex) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            let currentAmounts = userSettings?.custom_buy_amounts || '0.1,0.5,1,5';
            
            // Ensure currentAmounts is a string
            if (typeof currentAmounts !== 'string') {
                currentAmounts = '0.1,0.5,1,5';
            }
            
            const amountsArray = currentAmounts.split(',');
            const currentValue = amountsArray[buttonIndex]?.trim() || '0.1';
            
            const settingsText = `✏️ ***Edit Buy Amount - Button ${buttonIndex + 1}***

**Current Value:** *${currentValue} MON*

Send the new amount for this button:
*Example: 2.5*

**Limits:** Between 0.01 and 1000 MON`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Custom Buy Amounts', 'custom_buy_amounts')]
            ]);

            try {
                await ctx.editMessageText(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (editError) {
                // If edit fails, send new message
                await ctx.reply(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            }
            
            // Set user state to expect input for this specific button
            await this.database.setUserState(ctx.from.id, `awaiting_edit_buy_amount_${buttonIndex}`);
            
        } catch (error) {
            console.error('Error showing edit buy amount:', error);
            console.error('Full error details:', error.stack || error);
            console.error('Context details:', {
                userId: ctx.from?.id,
                buttonIndex: buttonIndex,
                callbackQuery: !!ctx.callbackQuery
            });
            await ctx.reply('❌ Error loading edit interface. Please try again.');
        }
    }

    async showEditSellPercentage(ctx, buttonIndex) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            const percentagesArray = currentPercentages.split(',');
            const currentValue = percentagesArray[buttonIndex]?.trim() || '25';
            
            const settingsText = `✏️ ***Edit Sell Percentage - Button ${buttonIndex + 1}***

**Current Value:** *${currentValue}%*

Send the new percentage for this button:
*Example: 30*

**Limits:** Between 1 and 100%`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Custom Sell Percentages', 'custom_sell_percentages')]
            ]);

            try {
                await ctx.editMessageText(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (editError) {
                // If edit fails, send new message
                await ctx.reply(settingsText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            }
            
            // Set user state to expect input for this specific button
            await this.database.setUserState(ctx.from.id, `awaiting_edit_sell_percentage_${buttonIndex}`);
            
        } catch (error) {
            console.error('Error showing edit sell percentage:', error);
            await ctx.reply('❌ Error loading edit interface.');
        }
    }

    async handleEditBuyAmountInput(ctx, buttonIndex) {
        try {
            const input = ctx.message.text.trim();
            const amount = parseFloat(input);
            
            // Validate input
            if (isNaN(amount) || amount < 0.01 || amount > 1000) {
                await ctx.reply('❌ Invalid amount. Please enter a value between 0.01 and 1000 MON.');
                return;
            }
            
            // Get current settings
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            let currentAmounts = userSettings?.custom_buy_amounts || '0.1,0.5,1,5';
            
            // Ensure currentAmounts is a string
            if (typeof currentAmounts !== 'string') {
                currentAmounts = '0.1,0.5,1,5';
            }
            
            const amountsArray = currentAmounts.split(',');
            
            // Update the specific button
            amountsArray[buttonIndex] = amount.toString();
            const newAmounts = amountsArray.join(',');
            
            // Save to database
            await this.database.updateUserSettings(ctx.from.id, { custom_buy_amounts: newAmounts });
            
            // Clear cache
            if (this.redis) {
                await this.redis.del(`settings:${ctx.from.id}`);
            }
            
            // Clear user state
            await this.database.clearUserState(ctx.from.id);
            
            await ctx.reply(`✅ Button ${buttonIndex + 1} updated to ${amount} MON`);
            
            // Show updated custom buy amounts after short delay
            setTimeout(async () => {
                try {
                    await this.showCustomBuyAmounts(ctx);
                } catch (error) {
                    console.error('Error showing updated custom buy amounts:', error);
                }
            }, 800);
            
        } catch (error) {
            console.error('Error handling edit buy amount input:', error);
            await ctx.reply('❌ Error updating buy amount.');
        }
    }

    async handleEditSellPercentageInput(ctx, buttonIndex) {
        try {
            const input = ctx.message.text.trim();
            const percentage = parseFloat(input);
            
            // Validate input
            if (isNaN(percentage) || percentage < 1 || percentage > 100) {
                await ctx.reply('❌ Invalid percentage. Please enter a value between 1 and 100.');
                return;
            }
            
            // Get current settings
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            const percentagesArray = currentPercentages.split(',');
            
            // Update the specific button
            percentagesArray[buttonIndex] = percentage.toString();
            const newPercentages = percentagesArray.join(',');
            
            // Save to database
            await this.database.updateUserSettings(ctx.from.id, { custom_sell_percentages: newPercentages });
            
            // Clear cache
            if (this.redis) {
                await this.redis.del(`settings:${ctx.from.id}`);
            }
            
            // Clear user state
            await this.database.clearUserState(ctx.from.id);
            
            await ctx.reply(`✅ Button ${buttonIndex + 1} updated to ${percentage}%`);
            
            // Show updated custom sell percentages after short delay
            setTimeout(async () => {
                try {
                    await this.showCustomSellPercentages(ctx);
                } catch (error) {
                    console.error('Error showing updated custom sell percentages:', error);
                }
            }, 800);
            
        } catch (error) {
            console.error('Error handling edit sell percentage input:', error);
            await ctx.reply('❌ Error updating sell percentage.');
        }
    }

    async showAutoBuyGasSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            this.monitoring?.logInfo('Current user settings for gas display', {
                auto_buy_gas: userSettings?.auto_buy_gas,
                gas_price: userSettings?.gas_price,
                userId: ctx.from.id
            });
            
            // Use auto_buy_gas specifically, with proper default of 50 Gwei
            const currentGas = Math.round((userSettings?.auto_buy_gas || 50000000000) / 1000000000);
            const currentCost = (currentGas * 0.00025).toFixed(4);
            
            const settingsText = `⚡ **Auto Buy Gas Settings**

*Current:* **${currentGas} Gwei** (~${currentCost} MON)

_Network fee for automated purchases:_

• **Normal (50 Gwei)** - _~0.0125 MON standard fee_
• **Turbo (100 Gwei)** - _~0.025 MON priority processing_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Normal (50 Gwei)', 'set_auto_buy_gas_50')],
                [Markup.button.callback('Turbo (100 Gwei)', 'set_auto_buy_gas_100')],
                [Markup.button.callback('📝 Custom', 'auto_buy_gas_custom')],
                [Markup.button.callback('Back', 'auto_buy_settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Auto buy gas settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading auto buy gas settings.');
        }
    }

    async showAutoBuySlippageSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const currentSlippage = userSettings?.auto_buy_slippage || userSettings?.slippage_tolerance || 5;
            
            const settingsText = `📊 **Auto Buy Slippage Settings**

*Current:* **${currentSlippage}%**

_Price tolerance for automated purchases:_

• **1-3%** - _Strict control, may fail in volatile conditions_
• **5-10%** - _Balanced tolerance for standard trading_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('1%', 'set_auto_buy_slippage_1'), Markup.button.callback('3%', 'set_auto_buy_slippage_3')],
                [Markup.button.callback('5%', 'set_auto_buy_slippage_5'), Markup.button.callback('10%', 'set_auto_buy_slippage_10')],
                [Markup.button.callback('📝 Custom', 'auto_buy_slippage_custom')],
                [Markup.button.callback('Back', 'auto_buy_settings')]
            ]);

            await ctx.reply(settingsText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Auto buy slippage settings failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading auto buy slippage settings.');
        }
    }

    // Custom amounts input handlers
    async handleCustomBuyAmountsInput(ctx) {
        try {
            const input = ctx.message.text.trim();
            
            // Validate format
            const amounts = input.split(',').map(a => parseFloat(a.trim()));
            
            // Validation checks
            if (amounts.length > 6) {
                return await ctx.reply('❌ Maximum 6 amounts allowed. Please try again.');
            }
            
            if (amounts.some(a => isNaN(a) || a < 0.01 || a > 1000)) {
                return await ctx.reply('❌ All amounts must be between 0.01 and 1000 MON. Please try again.');
            }
            
            // Update database
            await this.database.updateUserSettings(ctx.from.id, { 
                custom_buy_amounts: amounts.join(',') 
            });
            
            // Clear user state
            await this.database.clearUserState(ctx.from.id);
            
            await ctx.reply(`✅ Custom buy amounts updated: **${amounts.join(', ')} MON**`, {
                parse_mode: 'Markdown'
            });
            
            // Return to buy settings after delay
            setTimeout(async () => {
                try {
                    await this.showBuySettings(ctx);
                } catch (error) {
                    console.error('Error returning to buy settings:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error handling custom buy amounts input:', error);
            await ctx.reply('❌ Invalid format. Use comma-separated numbers (e.g., 0.1,0.5,1,5)');
        }
    }

    async handleCustomSellPercentagesInput(ctx) {
        try {
            const input = ctx.message.text.trim();
            
            // Validate format
            const percentages = input.split(',').map(p => parseInt(p.trim()));
            
            // Validation checks
            if (percentages.length > 6) {
                return await ctx.reply('❌ Maximum 6 percentages allowed. Please try again.');
            }
            
            if (percentages.some(p => isNaN(p) || p < 1 || p > 100)) {
                return await ctx.reply('❌ All percentages must be between 1 and 100. Please try again.');
            }
            
            // Update database
            await this.database.updateUserSettings(ctx.from.id, { 
                custom_sell_percentages: percentages.join(',') 
            });
            
            // Clear user state
            await this.database.clearUserState(ctx.from.id);
            
            await ctx.reply(`✅ Custom sell percentages updated: **${percentages.join(', ')}%**`, {
                parse_mode: 'Markdown'
            });
            
            // Return to sell settings after delay
            setTimeout(async () => {
                try {
                    await this.showSellSettings(ctx);
                } catch (error) {
                    console.error('Error returning to sell settings:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error handling custom sell percentages input:', error);
            await ctx.reply('❌ Invalid format. Use comma-separated numbers (e.g., 25,50,75,100)');
        }
    }

    async resetCustomBuyAmounts(ctx) {
        try {
            await ctx.answerCbQuery();
            
            await this.database.updateUserSettings(ctx.from.id, { 
                custom_buy_amounts: '0.1,0.5,1,5' 
            });
            
            await ctx.reply('✅ Custom buy amounts reset to default: **0.1, 0.5, 1, 5 MON**', {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                try {
                    await this.showBuySettings(ctx);
                } catch (error) {
                    console.error('Error returning to buy settings after reset:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error resetting custom buy amounts:', error);
            await ctx.reply('❌ Error resetting custom buy amounts.');
        }
    }

    async resetCustomSellPercentages(ctx) {
        try {
            await ctx.answerCbQuery();
            
            await this.database.updateUserSettings(ctx.from.id, { 
                custom_sell_percentages: '25,50,75,100' 
            });
            
            await ctx.reply('✅ Custom sell percentages reset to default: **25, 50, 75, 100%**', {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                try {
                    await this.showSellSettings(ctx);
                } catch (error) {
                    console.error('Error returning to sell settings after reset:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error resetting custom sell percentages:', error);
            await ctx.reply('❌ Error resetting custom sell percentages.');
        }
    }

    async stop(signal) {
        this.monitoring.logInfo(`Received ${signal}, stopping bot...`);
        
        try {
            this.bot.stop(signal);
            
            if (this.database && this.database.close) {
                await this.database.close();
            }
            
            if (this.redis) {
                this.redis.disconnect();
            }
            
            if (this.healthServer) {
                this.healthServer.close();
            }

            // Close monitoring system if available
            if (this.monitoring && this.monitoring.destroy) {
                this.monitoring.destroy();
            }
            
            this.monitoring.logInfo('Bot stopped gracefully');
            process.exit(0);
            
        } catch (error) {
            this.monitoring.logError('Error during bot shutdown', error);
            process.exit(1);
        }
    }
}

// Create and start the bot if this file is run directly
if (require.main === module) {
    const bot = new Area51BotModularSimple();
    bot.start().catch(error => {
        console.error('Failed to start bot:', error);
        process.exit(1);
    });
}

module.exports = Area51BotModularSimple;
