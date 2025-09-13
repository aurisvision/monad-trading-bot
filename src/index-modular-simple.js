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
// const { RateLimiter, SecurityEnhancements, SessionManager, MemoryRateLimiter, MemorySessionManager } = require('./rateLimiter');
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
        this.tradingEngine = new TradingEngine(this.database, this.monorailAPI, this.walletManager, this.monitoring);
        // this.portfolioManager = new PortfolioManager(this.monorailAPI, this.database, this.redis); // Removed - using portfolioService instead
        this.portfolioService = new (require('./portfolioService'))(this.monorailAPI, this.redis, this.monitoring);
        
        // Initialize security and rate limiting - DISABLED
        // if (this.redis) {
        //     this.rateLimiter = new RateLimiter(this.redis, this.monitoring);
        //     this.sessionManager = new SessionManager(this.redis, this.monitoring);
        // } else {
        //     this.rateLimiter = new MemoryRateLimiter(this.monitoring);
        //     this.sessionManager = new MemorySessionManager(this.monitoring);
        // }
        // this.security = new SecurityEnhancements(this.monitoring);
        
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
            this.redis,
            this.walletManager,
            this // Pass main bot instance
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

        // Rate limiting middleware - DISABLED
        // if (process.env.RATE_LIMIT_ENABLED === 'true' && this.rateLimiter) {
        //     this.bot.use(this.rateLimiter.middleware('requests'));
        // }

        // Security middleware - DISABLED
        // if (this.security) {
        //     this.bot.use(this.security.middleware());
        // }

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
            console.log('🔧 Auto Buy Amount 0.1 button pressed by user:', ctx.from.id);
            await this.updateAutoBuyAmount(ctx, 0.1);
        });

        this.bot.action('set_auto_buy_0.5', async (ctx) => {
            console.log('🔧 Auto Buy Amount 0.5 button pressed by user:', ctx.from.id);
            await this.updateAutoBuyAmount(ctx, 0.5);
        });

        this.bot.action('set_auto_buy_1', async (ctx) => {
            console.log('🔧 Auto Buy Amount 1 button pressed by user:', ctx.from.id);
            await this.updateAutoBuyAmount(ctx, 1);
        });

        this.bot.action('set_auto_buy_2', async (ctx) => {
            console.log('🔧 Auto Buy Amount 2 button pressed by user:', ctx.from.id);
            await this.updateAutoBuyAmount(ctx, 2);
        });

        this.bot.action('set_auto_buy_5', async (ctx) => {
            console.log('🔧 Auto Buy Amount 5 button pressed by user:', ctx.from.id);
            await this.updateAutoBuyAmount(ctx, 5);
        });

        this.bot.action('set_auto_buy_10', async (ctx) => {
            console.log('🔧 Auto Buy Amount 10 button pressed by user:', ctx.from.id);
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
            console.log('🔧 Auto Buy Gas 50 button pressed by user:', ctx.from.id);
            await this.updateAutoBuyGas(ctx, 50);
        });

        this.bot.action('set_auto_buy_gas_100', async (ctx) => {
            console.log('🔧 Auto Buy Gas 100 button pressed by user:', ctx.from.id);
            await this.updateAutoBuyGas(ctx, 100);
        });

        this.bot.action('auto_buy_gas_custom', async (ctx) => {
            await this.showCustomGas(ctx, 'auto_buy');
        });

        // Specific Auto Buy Slippage handlers
        this.bot.action('set_auto_buy_slippage_1', async (ctx) => {
            console.log('🔧 Auto Buy Slippage 1% button pressed by user:', ctx.from.id);
            await this.updateAutoBuySlippage(ctx, 1);
        });

        this.bot.action('set_auto_buy_slippage_3', async (ctx) => {
            console.log('🔧 Auto Buy Slippage 3% button pressed by user:', ctx.from.id);
            await this.updateAutoBuySlippage(ctx, 3);
        });

        this.bot.action('set_auto_buy_slippage_5', async (ctx) => {
            console.log('🔧 Auto Buy Slippage 5% button pressed by user:', ctx.from.id);
            await this.updateAutoBuySlippage(ctx, 5);
        });

        this.bot.action('set_auto_buy_slippage_10', async (ctx) => {
            console.log('🔧 Auto Buy Slippage 10% button pressed by user:', ctx.from.id);
            await this.updateAutoBuySlippage(ctx, 10);
        });

        this.bot.action('auto_buy_slippage_custom', async (ctx) => {
            await this.showCustomSlippage(ctx, 'auto_buy');
        });

        this.bot.action('auto_buy_amount_custom', async (ctx) => {
            await this.showCustomAmount(ctx, 'auto_buy');
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

        this.bot.action('confirm_auto_buy_enable', async (ctx) => {
            await this.handleConfirmAutoBuyEnable(ctx);
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
            
            // Get user settings to display current status
            const userSettings = await this.database.getUserSettings(ctx.from.id);
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
            
            const settingsText = `⚡️ *Buy Settings*

Gas: ${gasPrice} Gwei | Slippage: ${slippage}% | Auto Buy: ${autoBuyStatus}

Purchase transaction configuration:

• Gas Price Control - Network fee for buy transactions (minimum 50 Gwei)
• Slippage Tolerance - Price variance acceptance for purchases (no limits)
• Auto Buy System - Automated purchasing (${autoBuyAmount} MON)`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Set Gas Price', 'buy_gas_settings'), Markup.button.callback('Set Slippage', 'buy_slippage_settings')],
                [Markup.button.callback('🔄 Auto Buy Settings', 'auto_buy_settings')],
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
            console.log('🔍 Auto Buy Settings Display - Raw user settings:', {
                auto_buy_enabled: userSettings?.auto_buy_enabled,
                auto_buy_amount: userSettings?.auto_buy_amount,
                auto_buy_gas: userSettings?.auto_buy_gas,
                auto_buy_slippage: userSettings?.auto_buy_slippage,
                userId: ctx.from.id
            });
            
            const autoBuyEnabled = userSettings?.auto_buy_enabled || false;
            // Fix NaN issue by ensuring proper number conversion
            const autoBuyAmount = parseFloat(userSettings?.auto_buy_amount) || 0.1;
            // Use only auto_buy_gas, not fallback to gas_price
            const autoBuyGas = Math.round((userSettings?.auto_buy_gas || 50000000000) / 1000000000);
            // Use only auto_buy_slippage, not fallback to slippage_tolerance
            const autoBuySlippage = userSettings?.auto_buy_slippage || 5;
            const status = autoBuyEnabled ? '🟢 ON' : '🔴 OFF';
            
            console.log('🎯 Auto Buy Settings Display - Processed values:', {
                status,
                amount: autoBuyAmount,
                gas: autoBuyGas,
                slippage: autoBuySlippage
            });
            
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
            
            const settingsText = `💸 **Sell Settings**

*Gas Price:* **${gasPrice} Gwei** | *Slippage:* **${slippage}%**

_Sale transaction configuration:_

• **Gas Price Control** - _Network fee for sell transactions (minimum 50 Gwei)_
• **Slippage Tolerance** - _Price variance acceptance for sales (no limits)_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('Gas Settings', 'sell_gas_settings')],
                [Markup.button.callback('Slippage', 'sell_slippage_settings')],
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
            console.log(`🔧 DEEP DEBUG - updateGasSetting called with:`);
            console.log(`   - field: ${field}`);
            console.log(`   - value: ${value} (${Math.round(value / 1000000000)} Gwei)`);
            console.log(`   - userId: ${userId}`);
            console.log(`   - returnMenu: ${returnMenu}`);
            
            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);
            console.log(`📋 Current settings BEFORE update:`, {
                auto_buy_gas: currentSettings?.auto_buy_gas,
                gas_price: currentSettings?.gas_price,
                [field]: currentSettings?.[field]
            });
            
            // Ensure user settings exist first
            console.log('🔧 Creating user settings if not exists...');
            await this.database.createUserSettings(userId);
            
            console.log('🔧 Calling database.updateUserSettings...');
            const result = await this.database.updateUserSettings(userId, { [field]: value });
            console.log('📊 Database update result:', result);
            
            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            console.log(`✅ Settings AFTER update verification:`, {
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
                    console.log('🗑️ Cleared settings cache for user', userId);
                } catch (cacheError) {
                    console.log('⚠️ Cache clear failed:', cacheError.message);
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
            console.log(`🔧 Updating ${field} to ${value}% for user ${userId}`);
            
            // Ensure user settings exist first
            await this.database.createUserSettings(userId);
            
            const result = await this.database.updateUserSettings(userId, { [field]: value });
            console.log('📊 Database update result:', result);
            
            // Clear cache to ensure fresh data
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`settings:${userId}`),
                        this.redis.del(`user:${userId}`)
                    ]);
                    console.log('🗑️ Cleared settings cache for user', userId);
                } catch (cacheError) {
                    console.log('⚠️ Cache clear failed:', cacheError.message);
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
            console.log(`🔧 DEEP DEBUG - updateAutoBuyAmount called with:`);
            console.log(`   - amount: ${amount} MON`);
            console.log(`   - userId: ${userId}`);
            
            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);
            console.log(`📋 Current settings BEFORE amount update:`, {
                auto_buy_amount: currentSettings?.auto_buy_amount,
                auto_buy_gas: currentSettings?.auto_buy_gas,
                auto_buy_slippage: currentSettings?.auto_buy_slippage
            });
            
            // Ensure user settings exist first
            console.log('🔧 Creating user settings if not exists...');
            await this.database.createUserSettings(userId);
            
            console.log('🔧 Calling database.updateUserSettings for auto_buy_amount...');
            const result = await this.database.updateUserSettings(userId, { auto_buy_amount: amount });
            console.log('📊 Database update result:', result);
            
            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            console.log(`✅ Settings AFTER amount update verification:`, {
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
                    console.log('🗑️ Cleared settings cache for user', userId);
                } catch (cacheError) {
                    console.log('⚠️ Cache clear failed:', cacheError.message);
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
            
            console.log(`🔧 DEEP DEBUG - updateAutoBuyGas called with:`);
            console.log(`   - gasGwei: ${gasGwei} Gwei`);
            console.log(`   - gasWei: ${gasWei} Wei`);
            console.log(`   - userId: ${userId}`);
            
            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);
            console.log(`📋 Current settings BEFORE gas update:`, {
                auto_buy_amount: currentSettings?.auto_buy_amount,
                auto_buy_gas: currentSettings?.auto_buy_gas,
                auto_buy_slippage: currentSettings?.auto_buy_slippage
            });
            
            // Ensure user settings exist first
            console.log('🔧 Creating user settings if not exists...');
            await this.database.createUserSettings(userId);
            
            console.log('🔧 Calling database.updateUserSettings for auto_buy_gas...');
            const result = await this.database.updateUserSettings(userId, { auto_buy_gas: gasWei });
            console.log('📊 Database update result:', result);
            
            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            console.log(`✅ Settings AFTER gas update verification:`, {
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
                    console.log('🗑️ Cleared settings cache for user', userId);
                } catch (cacheError) {
                    console.log('⚠️ Cache clear failed:', cacheError.message);
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
            console.log(`🔧 DEEP DEBUG - updateAutoBuySlippage called with:`);
            console.log(`   - slippage: ${slippage}%`);
            console.log(`   - userId: ${userId}`);
            
            // Check current settings before update
            const currentSettings = await this.database.getUserSettings(userId);
            console.log(`📋 Current settings BEFORE slippage update:`, {
                auto_buy_amount: currentSettings?.auto_buy_amount,
                auto_buy_gas: currentSettings?.auto_buy_gas,
                auto_buy_slippage: currentSettings?.auto_buy_slippage
            });
            
            // Ensure user settings exist first
            console.log('🔧 Creating user settings if not exists...');
            await this.database.createUserSettings(userId);
            
            console.log('🔧 Calling database.updateUserSettings for auto_buy_slippage...');
            const result = await this.database.updateUserSettings(userId, { auto_buy_slippage: slippage });
            console.log('📊 Database update result:', result);
            
            // Verify the update worked
            const verifySettings = await this.database.getUserSettings(userId);
            console.log(`✅ Settings AFTER slippage update verification:`, {
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
                    console.log('🗑️ Cleared settings cache for user', userId);
                } catch (cacheError) {
                    console.log('⚠️ Cache clear failed:', cacheError.message);
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

    async showAutoBuyGasSettings(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            console.log('🔍 Current user settings for gas display:', {
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
