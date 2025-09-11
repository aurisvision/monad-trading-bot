// Simplified Modular Area51 Bot - Working Version
require('dotenv').config({ path: '.env.production' });

const { Telegraf, Markup } = require('telegraf');
const Database = require('./database-postgresql');
const WalletManager = require('./wallet');
const TradingEngine = require('./trading');
// const PortfolioManager = require('./portfolio'); // Removed - using portfolioService instead
const MonorailAPI = require('./monorail');
const MonitoringSystem = require('./monitoring');
const HealthCheckServer = require('./healthCheck');
const { RateLimiter, SecurityEnhancements, SessionManager, MemoryRateLimiter, MemorySessionManager } = require('./rateLimiter');
const Redis = require('redis');

// Import handler modules
const WalletHandlers = require('./handlers/walletHandlers');
const TradingHandlers = require('./handlers/tradingHandlers');
const PortfolioHandlers = require('./handlers/portfolioHandlers');
const NavigationHandlers = require('./handlers/navigationHandlers');

class Area51BotModularSimple {
    constructor() {
        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        try {
            await this.initializeComponents();
            await this.setupMiddleware();
            this.setupHandlers();
            this.initialized = true;
            console.log('✅ Modular bot initialized successfully');
        } catch (error) {
            console.error('❌ Modular bot initialization failed:', error.message);
            throw error;
        }
    }

    async initializeComponents() {
        // Initialize monitoring first
        this.monitoring = new MonitoringSystem();
        
        // Initialize Redis with fallback
        try {
            this.redis = Redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retry_unfulfilled_commands: true,
                retry_delay_on_failover: 100,
                socket: {
                    connectTimeout: 5000,
                    commandTimeout: 5000,
                    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
                }
            });

            const connectPromise = this.redis.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
            );

            await Promise.race([connectPromise, timeoutPromise]);
            this.monitoring.logInfo('Redis connected successfully');
        } catch (error) {
            console.log('⚠️ Redis connection failed, using memory fallback:', error.message);
            this.redis = null;
        }

        // Initialize database
        this.database = new Database(this.monitoring, this.redis);
        await this.database.initialize();
        await this.database.startHealthMonitoring();
        
        // Initialize services
        this.monorailAPI = new MonorailAPI(this.redis);
        this.walletManager = new WalletManager(this.database, this.monitoring);
        this.tradingEngine = new TradingEngine(this.monorailAPI, this.walletManager, this.database);
        // this.portfolioManager = new PortfolioManager(this.monorailAPI, this.database, this.redis); // Removed - using portfolioService instead
        this.portfolioService = new (require('./portfolioService'))(this.monorailAPI, this.redis, this.monitoring);
        
        // Initialize security and rate limiting
        if (this.redis) {
            this.rateLimiter = new RateLimiter(this.redis, this.monitoring);
            this.sessionManager = new SessionManager(this.redis, this.monitoring);
        } else {
            this.rateLimiter = new MemoryRateLimiter(this.monitoring);
            this.sessionManager = new MemorySessionManager(this.monitoring);
        }
        this.security = new SecurityEnhancements(this.monitoring);
        
        // Initialize health check server
        this.healthServer = new HealthCheckServer(this.monitoring, 
            process.env.HEALTH_CHECK_PORT || 3001);
        this.healthServer.start();
        
        // Initialize handler modules
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
            this.tradingEngine, 
            this.monorailAPI, 
            this.monitoring, 
            this.walletManager, 
            this.portfolioService, 
            this.redis
        );
        
        this.portfolioHandlers = new PortfolioHandlers(
            this.bot, 
            this.database, 
            this.portfolioService, 
            this.monitoring
        );
        
        this.navigationHandlers = new NavigationHandlers(
            this.bot, 
            this.database, 
            this.monorailAPI, 
            this.monitoring, 
            this.redis
        );
        
        this.monitoring.logInfo('All components initialized successfully');
    }

    async setupMiddleware() {
        // Global error handling
        this.bot.catch((err, ctx) => {
            this.monitoring.logError('Bot error occurred', err, {
                userId: ctx.from?.id,
                updateType: ctx.updateType
            });
        });

        // Rate limiting middleware
        if (process.env.RATE_LIMIT_ENABLED === 'true' && this.rateLimiter) {
            this.bot.use(this.rateLimiter.middleware('requests'));
        }

        // Security middleware
        this.bot.use(this.security.inputValidationMiddleware());

        // Performance monitoring middleware
        this.bot.use(async (ctx, next) => {
            const start = Date.now();
            const userId = ctx.from?.id;
            
            try {
                await next();
                const duration = (Date.now() - start) / 1000;
                this.monitoring.recordAPIRequest('telegram', 200, duration);
            } catch (error) {
                const duration = (Date.now() - start) / 1000;
                this.monitoring.recordAPIRequest('telegram', 500, duration);
                throw error;
            }
        });

        // User activity tracking
        this.bot.use(async (ctx, next) => {
            const userId = ctx.from?.id;
            if (userId && this.database) {
                await this.database.trackUserActivity(userId);
            }
            await next();
        });
    }

    setupHandlers() {
        // Additional handlers FIRST (to avoid conflicts)
        this.setupAdditionalHandlers();
        
        // Setup handlers for each module
        this.navigationHandlers.setupHandlers();
        this.walletHandlers.setupHandlers();
        this.tradingHandlers.setupHandlers();
        this.portfolioHandlers.setupHandlers();
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

        // Turbo Mode handlers
        this.bot.action('toggle_turbo_mode', async (ctx) => {
            console.log('🚀 Turbo Mode button clicked by user:', ctx.from.id);
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

        // Refresh handler
        this.bot.action('refresh', async (ctx) => {
            await ctx.answerCbQuery('🔄 Refreshing...');
            
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
            
            await this.navigationHandlers.handleBackToMainWithDebug(ctx);
        });
    }

    async showSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Get user settings to display current Turbo Mode status
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const turboStatus = (userSettings?.turbo_mode || false) ? '🟢 ON' : '🔴 OFF';
            
            const settingsText = `⚙️ *Settings*

Configure your trading preferences:

• Slippage tolerance
• Gas settings  
• Turbo Mode: ${turboStatus}
• Notification preferences`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📊 Slippage Settings', 'slippage_settings')],
                [Markup.button.callback('⚡ Gas Settings', 'gas_settings')],
                [Markup.button.callback('🚀 Toggle Turbo Mode', 'toggle_turbo_mode')],
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

    async start() {
        try {
            await this.init();
            
            // Start the bot
            await this.bot.launch();
            this.monitoring.logInfo('🚀 Modular Area51 Bot started successfully');
            
            // Enable graceful stop
            process.once('SIGINT', () => this.stop('SIGINT'));
            process.once('SIGTERM', () => this.stop('SIGTERM'));
            
        } catch (error) {
            this.monitoring.logError('Bot start failed', error);
            throw error;
        }
    }

    async handleToggleTurboMode(ctx) {
        try {
            console.log('🔧 handleToggleTurboMode called for user:', ctx.from.id);
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            console.log('📊 Getting user settings for user:', userId);
            const currentSettings = await this.database.getUserSettings(userId);
            console.log('📊 Current settings:', currentSettings);
            
            // Handle case where turbo_mode doesn't exist yet
            const currentTurboMode = currentSettings?.turbo_mode || false;
            const newTurboMode = !currentTurboMode;
            console.log('🔄 Turbo mode toggle:', currentTurboMode, '->', newTurboMode);
            
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
                // Turbo mode disabled - update database and show success
                await this.database.updateUserSettings(userId, { turbo_mode: false });
                
                await ctx.editMessageText('✅ *Turbo Mode Disabled*\n\nSafe trading mode is now active.', {
                    parse_mode: 'Markdown'
                });
                
                setTimeout(async () => {
                    await this.showSettings(ctx);
                }, 1500);
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
            
            // Confirm turbo mode is enabled
            await this.database.updateUserSettings(userId, { turbo_mode: true });
            
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
                this.healthServer.stop();
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
