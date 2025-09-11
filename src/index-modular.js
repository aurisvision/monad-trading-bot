// Modular Area51 Bot - Refactored for better maintainability
require('dotenv').config({ path: '.env.production' });

const BotInitializer = require('./initialization');
const BotMiddleware = require('./middleware/botMiddleware');
const BotUtils = require('./utils');

// Import all handler modules
const WalletHandlers = require('./handlers/walletHandlers');
const TradingHandlers = require('./handlers/tradingHandlers');
const PortfolioHandlers = require('./handlers/portfolioHandlers');
const NavigationHandlers = require('./handlers/navigationHandlers');

// Import existing services
const WalletManager = require('./wallet');
const TradingEngine = require('./trading');
// const PortfolioManager = require('./portfolio'); // Removed - using portfolioService instead
const MonorailAPI = require('./monorail');
const MonitoringSystem = require('./monitoring');
const HealthCheckServer = require('./healthCheck');

class Area51BotModular {
    constructor() {
        this.initialized = false;
        this.config = this.loadConfiguration();
        this.monitoring = new MonitoringSystem();
        
        // Initialize components
        this.bot = null;
        this.redis = null;
        this.database = null;
        this.monorailAPI = null;
        this.sessionManager = null;
        
        // Initialize services
        this.walletManager = null;
        this.tradingEngine = null;
        this.portfolioManager = null;
        this.portfolioService = null;
        
        // Initialize handlers
        this.walletHandlers = null;
        this.tradingHandlers = null;
        this.portfolioHandlers = null;
        this.navigationHandlers = null;
        
        // Initialize middleware and utils
        this.middleware = null;
        this.utils = null;
        this.healthServer = null;
    }

    loadConfiguration() {
        return {
            telegram: {
                token: process.env.TELEGRAM_BOT_TOKEN
            },
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                name: process.env.DB_NAME || 'area51_bot',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || '',
                ssl: process.env.DB_SSL === 'true'
            },
            redis: {
                enabled: process.env.REDIS_ENABLED !== 'false',
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                db: process.env.REDIS_DB || 0
            },
            monorail: {
                baseUrl: process.env.MONORAIL_BASE_URL || 'https://testnet-api.monorail.xyz',
                appId: process.env.MONORAIL_APP_ID || '2837175649443187'
            },
            healthCheck: {
                port: process.env.HEALTH_CHECK_PORT || 3001
            },
            rateLimiting: {
                enabled: process.env.RATE_LIMIT_ENABLED === 'true'
            }
        };
    }

    async init() {
        if (this.initialized) return;
        
        try {
            this.monitoring.logInfo('Starting modular bot initialization...');

            // Initialize core components
            await this.initializeCore();
            
            // Initialize services
            await this.initializeServices();
            
            // Initialize handlers
            await this.initializeHandlers();
            
            // Setup middleware
            await this.setupMiddleware();
            
            // Setup all handlers
            this.setupAllHandlers();
            
            // Initialize health check
            await this.initializeHealthCheck();
            
            // Initialize MON price cache
            await this.initializeMonPriceCache();
            
            this.initialized = true;
            this.monitoring.logInfo('✅ Modular bot initialized successfully');
            
        } catch (error) {
            this.monitoring.logError('❌ Modular bot initialization failed', error);
            throw error;
        }
    }

    async initializeCore() {
        // Use the BotInitializer to set up core components
        const initializer = new BotInitializer(this.config, this.monitoring);
        
        // Validate configuration first
        initializer.validateConfig();
        
        // Initialize all core components
        const components = await initializer.initialize();
        
        this.bot = components.bot;
        this.redis = components.redis;
        this.database = components.database;
        this.monorailAPI = components.monorailAPI;
        this.sessionManager = components.sessionManager;
        
        this.monitoring.logInfo('Core components initialized');
    }

    async initializeServices() {
        try {
            // Initialize wallet manager
            this.walletManager = new WalletManager(this.database, this.monitoring);
            
            // Initialize trading engine
            this.tradingEngine = new TradingEngine(this.monorailAPI, this.walletManager, this.database);
            
            // Initialize portfolio manager
            // this.portfolioManager = new PortfolioManager(this.monorailAPI, this.database, this.redis); // Removed - using portfolioService instead
            
            // Initialize portfolio service
            const PortfolioService = require('./portfolioService');
            this.portfolioService = new PortfolioService(this.monorailAPI, this.redis, this.monitoring);
            
            // Initialize utilities
            this.utils = new BotUtils(this.monitoring);
            
            this.monitoring.logInfo('Services initialized');
            
        } catch (error) {
            this.monitoring.logError('Services initialization failed', error);
            throw error;
        }
    }

    async initializeHandlers() {
        try {
            // Initialize all handler modules
            this.walletHandlers = new WalletHandlers(
                this.bot, 
                this.database, 
                this.walletManager, 
                this.monitoring, 
                this.redis
            );
            
            this.tradingHandlers = new TradingHandlers(
                this.bot, 
                this.database, 
                this.monorailAPI, 
                this.tradingEngine, 
                this.monitoring, 
                this.redis
            );
            
            this.portfolioHandlers = new PortfolioHandlers(
                this.bot, 
                this.database, 
                this.portfolioService, 
                this.monorailAPI, 
                this.monitoring, 
                this.redis
            );
            
            this.navigationHandlers = new NavigationHandlers(
                this.bot, 
                this.database, 
                this.monorailAPI, 
                this.monitoring, 
                this.redis
            );
            
            this.monitoring.logInfo('Handlers initialized');
            
        } catch (error) {
            this.monitoring.logError('Handlers initialization failed', error);
            throw error;
        }
    }

    async setupMiddleware() {
        try {
            // Initialize middleware
            this.middleware = new BotMiddleware(this.database, this.monitoring, this.redis);
            
            // Apply all middleware in order
            const middlewares = this.middleware.getAllMiddleware();
            for (const middleware of middlewares) {
                this.bot.use(middleware);
            }
            
            // Start session cleanup
            this.middleware.startSessionCleanup();
            
            this.monitoring.logInfo('Middleware setup completed');
            
        } catch (error) {
            this.monitoring.logError('Middleware setup failed', error);
            throw error;
        }
    }

    setupAllHandlers() {
        try {
            // Setup handlers for each module
            this.navigationHandlers.setupHandlers();
            this.walletHandlers.setupHandlers();
            this.tradingHandlers.setupHandlers();
            this.portfolioHandlers.setupHandlers();
            
            // Setup additional handlers that might be in the original file
            this.setupAdditionalHandlers();
            
            this.monitoring.logInfo('All handlers setup completed');
            
        } catch (error) {
            this.monitoring.logError('Handlers setup failed', error);
            throw error;
        }
    }

    setupAdditionalHandlers() {
        // Settings handlers
        this.bot.action('settings', async (ctx) => {
            await this.showSettings(ctx);
        });

        this.bot.action('slippage_settings', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.reply('⚙️ Slippage settings coming soon!');
        });

        this.bot.action('gas_settings', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.reply('⚙️ Gas settings coming soon!');
        });

        this.bot.action('notification_settings', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.reply('⚙️ Notification settings coming soon!');
        });

        // Refresh handler
        this.bot.action('refresh', async (ctx) => {
            await ctx.answerCbQuery('🔄 Refreshing...');
            
            // Clear relevant caches
            const userId = ctx.from.id;
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`main_menu:${userId}`),
                        this.redis.del(`balance:${userId}`),
                        this.redis.del(`portfolio:${userId}`)
                    ]);
                } catch (error) {
                    this.monitoring.logError('Cache clear failed during refresh', error, { userId });
                }
            }
            
            // Navigate back to main menu with fresh data
            await this.navigationHandlers.handleBackToMainWithDebug(ctx);
        });

        // Help handler
        this.bot.action('help', async (ctx) => {
            await this.navigationHandlers.showHelp(ctx);
        });
    }

    async showSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const settingsText = `⚙️ *Settings*

Configure your trading preferences:

• Slippage tolerance
• Gas settings  
• Notification preferences`;

            const { Markup } = require('telegraf');
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📊 Slippage', 'slippage_settings'), Markup.button.callback('⛽ Gas', 'gas_settings')],
                [Markup.button.callback('🔔 Notifications', 'notification_settings')],
                [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
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

    async initializeHealthCheck() {
        try {
            this.healthServer = new HealthCheckServer(this.monitoring, this.config.healthCheck.port);
            this.healthServer.start();
            
            this.monitoring.logInfo('Health check server initialized');
            
        } catch (error) {
            this.monitoring.logWarning('Health check server initialization failed', error);
        }
    }

    async initializeMonPriceCache() {
        try {
            if (!this.redis) {
                this.monitoring.logInfo('Redis not available, skipping MON price cache initialization');
                return;
            }

            // Initialize MON price cache with 5-minute intervals
            const updateMonPrice = async () => {
                try {
                    const priceData = await this.monorailAPI.getMONPrice(false);
                    if (priceData && priceData.price) {
                        await this.redis.setEx('mon_price_usd', 300, JSON.stringify(priceData)); // 5 min TTL
                        this.monitoring.logInfo('MON price cache updated', { price: priceData.price });
                    }
                } catch (error) {
                    this.monitoring.logError('MON price cache update failed', error);
                }
            };

            // Update immediately and then every 5 minutes
            await updateMonPrice();
            setInterval(updateMonPrice, 5 * 60 * 1000);
            
            this.monitoring.logInfo('MON price cache initialized');
            
        } catch (error) {
            this.monitoring.logError('MON price cache initialization failed', error);
        }
    }

    async start() {
        try {
            await this.init();
            
            // Start the bot
            await this.bot.launch();
            this.monitoring.logInfo('🚀 Area51 Bot started successfully');
            
            // Enable graceful stop
            process.once('SIGINT', () => this.stop('SIGINT'));
            process.once('SIGTERM', () => this.stop('SIGTERM'));
            
        } catch (error) {
            this.monitoring.logError('Bot start failed', error);
            throw error;
        }
    }

    async stop(signal) {
        this.monitoring.logInfo(`Received ${signal}, stopping bot...`);
        
        try {
            // Stop the bot
            this.bot.stop(signal);
            
            // Close database connections
            if (this.database && this.database.close) {
                await this.database.close();
            }
            
            // Close Redis connection
            if (this.redis) {
                this.redis.disconnect();
            }
            
            // Stop health server
            if (this.healthServer) {
                this.healthServer.stop();
            }
            
            this.monitoring.logInfo('Bot stopped gracefully');
            process.exit(0);
            
        } catch (error) {
            this.monitoring.logError('Error during bot shutdown', error);
            process.exit(1);
        }
    }

    // Health check method
    async getHealthStatus() {
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

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }
}

// Create and start the bot if this file is run directly
if (require.main === module) {
    const bot = new Area51BotModular();
    bot.start().catch(error => {
        console.error('Failed to start bot:', error);
        process.exit(1);
    });
}

module.exports = Area51BotModular;
