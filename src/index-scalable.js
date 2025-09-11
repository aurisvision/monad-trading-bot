// Scalable version of Area51 Bot with PostgreSQL, Redis, and monitoring
require('dotenv').config({ path: '.env.production' });

const { Telegraf, Markup } = require('telegraf');
const Database = require('./database-postgresql');
const WalletManager = require('./wallet');
const TradingEngine = require('./trading');
const PortfolioManager = require('./portfolio');
const MonorailAPI = require('./monorail');
const MonitoringSystem = require('./monitoring');
const HealthCheckServer = require('./healthCheck');
const { RateLimiter, SecurityEnhancements, SessionManager, MemoryRateLimiter, MemorySessionManager } = require('./rateLimiter');
const { formatAddress, formatBalance, validateAddress, validateAmount, parseCustomAmounts, parseCustomPercentages, getExplorerUrl } = require('./utils');
// CircuitBreaker implementation to be added later
const Redis = require('redis');

class Area51BotScalable {
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
            console.log('✅ Bot initialized successfully');
        } catch (error) {
            console.error('❌ Bot initialization failed:', error.message);
            throw error;
        }
    }

    async initializeComponents() {
        // Initialize monitoring first
        this.monitoring = new MonitoringSystem();
        
        // Initialize Redis with fallback and timeout
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

            // Add connection timeout
            const connectPromise = this.redis.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
            );

            await Promise.race([connectPromise, timeoutPromise]);
            this.monitoring.logInfo('Redis connected successfully');
        } catch (error) {
            console.log('⚠️ Redis connection failed, using memory fallback:', error.message);
            this.redis = null; // Use memory fallback
        }

        // Initialize database with monitoring
        this.database = new Database(this.monitoring, this.redis);
        await this.database.initialize();
        await this.database.startHealthMonitoring();
        
        // Initialize Monorail API with Redis
        this.monorailAPI = new MonorailAPI(this.redis);
        this.walletManager = new WalletManager(this.database, this.monitoring);
        this.tradingEngine = new TradingEngine(this.monorailAPI, this.walletManager, this.database);
        this.portfolioManager = new PortfolioManager(this.monorailAPI, this.database, this.redis);
        this.portfolioService = new (require('./portfolioService'))(this.monorailAPI, this.redis, this.monitoring);
        
        // Initialize security and rate limiting with proper fallback
        if (this.redis) {
            this.rateLimiter = new RateLimiter(this.redis, this.monitoring);
            this.sessionManager = new SessionManager(this.redis, this.monitoring);
        } else {
            // Memory-based fallbacks when Redis is not available
            this.rateLimiter = new MemoryRateLimiter(this.monitoring);
            this.sessionManager = new MemorySessionManager(this.monitoring);
        }
        this.security = new SecurityEnhancements(this.monitoring);
        
        // Circuit breaker to be implemented later for API resilience
        
        // Initialize health check server
        this.healthServer = new HealthCheckServer(this.monitoring, 
            process.env.HEALTH_CHECK_PORT || 3001);
        this.healthServer.start();
        
        // Initialize MON price caching system
        await this.initializeMonPriceCache();
        
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
        // Start command with enhanced welcome
        this.bot.start(async (ctx) => {
            await this.handleStart(ctx);
        });

        // Main navigation handlers
        this.bot.action('back_to_main', async (ctx) => {
            console.log('🔍 DEBUG: back_to_main called for user:', ctx.from.id);
            await ctx.answerCbQuery();
            await this.handleBackToMainWithDebug(ctx);
        });

        this.bot.action('main', async (ctx) => {
            console.log('🔍 DEBUG: main called for user:', ctx.from.id);
            await ctx.answerCbQuery();
            await this.handleBackToMainWithDebug(ctx);
        });

        // Wallet management handlers
        this.bot.action('wallet', async (ctx) => {
            await this.showWalletInterface(ctx);
        });

        this.bot.action('generate_wallet', async (ctx) => {
            await this.handleGenerateWallet(ctx);
        });

        this.bot.action('import_wallet', async (ctx) => {
            await this.handleImportWallet(ctx);
        });

        this.bot.action('export_private_key', async (ctx) => {
            await this.handleExportPrivateKey(ctx);
        });


        this.bot.action('delete_wallet', async (ctx) => {
            await this.handleDeleteWallet(ctx);
        });

        this.bot.action('confirm_delete_wallet', async (ctx) => {
            await this.handleConfirmDeleteWallet(ctx);
        });

        // Portfolio handlers
        this.bot.action('portfolio', async (ctx) => {
            await this.handleNewPortfolio(ctx);
        });

        // Portfolio pagination handlers
        this.bot.action(/^portfolio:page:(\d+)$/, async (ctx) => {
            await this.handlePortfolioPage(ctx);
        });

        // Portfolio refresh handler
        this.bot.action('portfolio:refresh', async (ctx) => {
            await this.handlePortfolioRefresh(ctx);
        });

        this.bot.action('refresh', async (ctx) => {
            await this.handleRefreshWithWelcome(ctx);
        });

        this.bot.action('refresh_balance', async (ctx) => {
            await this.handleRefresh(ctx);
        });

        // Trading handlers
        this.bot.action('buy', async (ctx) => {
            await this.handleBuyInterface(ctx);
        });

        this.bot.action('sell', async (ctx) => {
            await this.handleSellInterface(ctx);
        });

        // Buy amount handlers - updated for new flow
        this.bot.action(/^buy_amount_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleBuyAmount(ctx);
        });

        this.bot.action('buy_amount_custom', async (ctx) => {
            await this.handleCustomBuy(ctx);
        });

        // Sell percentage handlers
        this.bot.action(/^sell_(\d+)$/, async (ctx) => {
            await this.handleSellPercentage(ctx);
        });

        this.bot.action('sell_custom', async (ctx) => {
            await this.handleCustomSell(ctx);
        });

        // Token selection handlers
        this.bot.action(/^buy_token_(.+)$/, async (ctx) => {
            await this.handleBuyTokenFromCategory(ctx);
        });

        this.bot.action(/^sell_token_(.+)$/, async (ctx) => {
            await this.handleSelectTokenToSell(ctx);
        });

        // Handle sell from portfolio (new format)
        this.bot.action(/^sell:([A-Z]+)$/, async (ctx) => {
            await this.handleSellFromNewPortfolio(ctx);
        });

        // Handle sell from portfolio (legacy format)
        this.bot.action(/^sell_([A-Z]+)$/, async (ctx) => {
            await this.handleSellFromPortfolio(ctx);
        });

        // Handle sell percentage selection
        this.bot.action(/^sell_percentage_([A-Z]+)_(\d+)$/, async (ctx) => {
            await this.handleSellPercentageSelection(ctx);
        });

        // Handle custom sell percentage
        this.bot.action(/^sell_custom_([A-Z]+)$/, async (ctx) => {
            await this.handleCustomSellPercentage(ctx);
        });

        // Confirmation handlers
        this.bot.action(/^confirm_buy_(.+)_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleConfirmBuy(ctx);
        });

        this.bot.action(/^confirm_sell_(.+)$/, async (ctx) => {
            await this.handleConfirmSell(ctx);
        });

        // Handle confirm portfolio sell - allow lowercase and numbers in token symbols
        this.bot.action(/^confirm_portfolio_sell_([A-Za-z0-9]+)_(\d+)$/, async (ctx) => {
            await this.handleConfirmPortfolioSell(ctx);
        });

        this.bot.action('cancel_trade', async (ctx) => {
            await this.handleCancelTrade(ctx);
        });

        // Categories handlers
        this.bot.action('token_categories', async (ctx) => {
            await ctx.answerCbQuery();
            const categoriesText = `
🔥 *Monad Testnet Token Explorer*

Explore and trade tokens in the Monad ecosystem. Browse by category, check your holdings, or discover new opportunities on testnet.

*Choose a category to explore:*
            `;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Verified Tokens', 'category_verified'), Markup.button.callback('💵 Stablecoins', 'category_stable')],
                [Markup.button.callback('🌐 Bridged Assets', 'category_bridged'), Markup.button.callback('🐸 Meme Coins', 'category_meme')],
                [Markup.button.callback('🥩 Liquid Staking', 'category_lst')],
                [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
            ]);
            
            try {
                await ctx.editMessageText(categoriesText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (error) {
                // If editing fails, send new message
                await ctx.replyWithMarkdown(categoriesText, keyboard);
            }
        });

        // Handle token category actions with pagination
        this.bot.action(/^category_(.+?)(?:_page_(\d+))?$/, async (ctx) => {
            await ctx.answerCbQuery();
            const fullMatch = ctx.match[0];
            
            // Extract category and page more carefully
            let category, page = 1;
            
            if (fullMatch.includes('_page_')) {
                const parts = fullMatch.replace('category_', '').split('_page_');
                category = parts[0];
                page = parseInt(parts[1]) || 1;
            } else {
                category = ctx.match[1];
            }
            
            await this.showTokensByCategory(ctx, category, page);
        });

        // Transfer handlers
        this.bot.action('transfer', async (ctx) => {
            await this.showTransferInterface(ctx);
        });

        this.bot.action(/^confirm_transfer_(.+)_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleConfirmTransfer(ctx);
        });

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

        this.bot.action('toggle_turbo_mode', async (ctx) => {
            await this.handleToggleTurboMode(ctx);
        });

        this.bot.action('confirm_turbo_enable', async (ctx) => {
            await this.handleConfirmTurboEnable(ctx);
        });

        // Help handler
        this.bot.action('help', async (ctx) => {
            await this.showHelp(ctx);
        });

        // Portfolio "Show More" handler
        this.bot.action('portfolio_more', async (ctx) => {
            await this.handlePortfolioMore(ctx);
        });

        // Reveal handlers for security
        this.bot.action(/^reveal_key_(.+)$/, async (ctx) => {
            await this.handleRevealPrivateKey(ctx);
        });


        // Text message handler
        this.bot.on('text', async (ctx) => {
            await this.handleTextMessage(ctx);
        });
    }

    async handleStart(ctx) {
        const userId = ctx.from.id;
        
        try {
            // Check Redis cache first for existing user
            let user = null;
            let fromCache = false;
            
            if (this.redis) {
                try {
                    const cachedUser = await this.redis.get(`user:${userId}`);
                    if (cachedUser) {
                        user = JSON.parse(cachedUser);
                        fromCache = true;
                        this.monitoring.logInfo('User data loaded from Redis cache', { userId, fromCache: true });
                    }
                } catch (redisError) {
                    this.monitoring.logError('Redis cache read failed', redisError, { userId });
                }
            }
            
            // If not in cache, query database
            if (!user) {
                user = await this.database.getUserByTelegramId(userId);
                
                // Cache user data in Redis for 24 hours if user exists
                if (user && this.redis) {
                    try {
                        await this.redis.setEx(`user:${userId}`, 86400, JSON.stringify({
                            id: user.id,
                            telegram_id: user.telegram_id,
                            wallet_address: user.wallet_address,
                            username: ctx.from.username,
                            first_name: ctx.from.first_name,
                            created_at: user.created_at
                        }));
                        this.monitoring.logInfo('User data cached in Redis', { userId, ttl: '24h' });
                    } catch (redisError) {
                        this.monitoring.logError('Redis cache write failed', redisError, { userId });
                    }
                }
            }
            
            // Create session if session manager is available
            if (this.sessionManager) {
                await this.sessionManager.createSession(userId, {
                    username: ctx.from.username,
                    firstName: ctx.from.first_name
                });
            }
            
            if (!user) {
                await this.showWelcomeNewUser(ctx);
            } else {
                await this.showWelcome(ctx, fromCache);
            }
            
            this.monitoring.logInfo('User started bot', { userId, fromCache });
        } catch (error) {
            this.monitoring.logError('Start command failed', error, { userId });
            await ctx.reply('⚠️ An error occurred. Please try again.');
        }
    }

    async showWelcomeNewUser(ctx) {
        const welcomeText = `**🛸 Welcome to Area51!**
_The main area for real nads!_

Choose how you want to set up your wallet:

🆕 **Generate New Wallet** - Create a fresh wallet with secure encryption
📥 **Import Existing Wallet** - Use your existing private key or mnemonic phrase`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Generate New Wallet', 'generate_wallet')],
            [Markup.button.callback('📥 Import Existing Wallet', 'import_wallet')],
            [Markup.button.callback('❓ Help', 'help')]
        ]);

        try {
            const sentMessage = await ctx.replyWithMarkdown(welcomeText, keyboard);
            // Don't store message ID for new users since they don't exist in users table yet
            // The message ID will be stored after wallet creation
        } catch (error) {
            await ctx.replyWithMarkdown(welcomeText, keyboard);
        }
    }

    async showWelcomeWithEdit(ctx) {
        const userId = ctx.from.id;
        
        try {
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await this.showWelcomeNewUser(ctx);
                return;
            }

            // Get MON balance, portfolio value, and MON price using new simplified APIs
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address),
                this.monorailAPI.getPortfolioValue(user.wallet_address),
                this.monorailAPI.getMONPriceUSD()
            ]);

            // Extract values with better error handling and fallbacks
            let monBalance = 0;
            let monPriceUSD = 3.25;
            let portfolioValueUSD = 0;

            // Handle MON balance - check actual response structure
            if (monBalanceData && monBalanceData.balance) {
                // Convert from wei to MON (divide by 10^18)
                const balanceWei = monBalanceData.balance;
                monBalance = parseFloat(balanceWei) / Math.pow(10, 18);
                
                // If balanceFormatted exists, use it instead
                if (monBalanceData.balanceFormatted) {
                    monBalance = parseFloat(monBalanceData.balanceFormatted);
                }
            }

            // Handle MON price
            if (monPriceData) {
                monPriceUSD = parseFloat(monPriceData.price || monPriceData.priceUSD || '3.25');
            }

            // Handle portfolio value - check actual response structure
            if (portfolioValueData && portfolioValueData.value) {
                portfolioValueUSD = parseFloat(portfolioValueData.value);
            }

            const portfolioValueMON = portfolioValueUSD / monPriceUSD;
            const monValueUSD = monBalance * monPriceUSD;

            const welcomeText = `🛸 *Welcome to Area51!*
_The main area for real nads!_

🧾 *Your Wallet Address:*
\`${user.wallet_address}\`

💼 *Balance:*
• MON: ${monBalance.toFixed(6)} ~$${monValueUSD.toFixed(2)}
• Portfolio Value: ${portfolioValueMON.toFixed(6)} MON ~$${portfolioValueUSD.toFixed(2)}

🟣 Current MON Price: $${monPriceUSD.toFixed(4)}

▫️What you can do:
• Buy and sell tokens instantly
• Track your portfolio with real-time P&L
• Browse trending token categories
• Manage your wallet securely

💡 Click on the Refresh button to update your current balance.`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💰 Buy', 'buy'), Markup.button.callback('💸 Sell', 'sell')],
                [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
                [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
                [Markup.button.callback('❓ Help', 'help')]
            ]);

            await ctx.editMessageText(welcomeText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            this.monitoring.logError('Welcome display failed', error, { userId });
            // Use editMessageText for error message too to maintain inline buttons context
            try {
                await ctx.editMessageText('❌ Error loading data. Please try again.', {
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Try Again', 'refresh')],
                        [Markup.button.callback('🏠 Main Menu', 'main')]
                    ]).reply_markup
                });
            } catch (editError) {
                await ctx.reply('❌ Error loading data. Please try again.');
            }
        }
    }

    async showWelcome(ctx, fromCache = false) {
        const userId = ctx.from.id;
        
        try {
            let user;
            
            // If data came from cache, we already have user data
            if (fromCache) {
                // Get user from cache again to ensure we have it
                const cachedUser = await this.redis.get(`user:${userId}`);
                user = cachedUser ? JSON.parse(cachedUser) : null;
            }
            
            // Fallback to database if no cached data
            if (!user) {
                user = await this.database.getUserByTelegramId(userId);
                if (!user) {
                    await this.showWelcomeNewUser(ctx);
                    return;
                }
            }

            // Get MON balance, portfolio value, and MON price using new simplified APIs
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address),
                this.monorailAPI.getPortfolioValue(user.wallet_address),
                this.monorailAPI.getMONPriceUSD()
            ]);

            // Debug logging to check API responses
            console.log('API Responses:', {
                monBalanceData,
                portfolioValueData,
                monPriceData
            });

            // Extract values with better error handling and fallbacks
            let monBalance = 0;
            let monPriceUSD = 3.25;
            let portfolioValueUSD = 0;

            // Handle MON balance - check actual response structure
            if (monBalanceData && monBalanceData.balance) {
                // Convert from wei to MON (divide by 10^18)
                const balanceWei = monBalanceData.balance;
                monBalance = parseFloat(balanceWei) / Math.pow(10, 18);
                
                // If balanceFormatted exists, use it instead
                if (monBalanceData.balanceFormatted) {
                    monBalance = parseFloat(monBalanceData.balanceFormatted);
                }
            }

            // Handle MON price
            if (monPriceData) {
                monPriceUSD = parseFloat(monPriceData.price || monPriceData.priceUSD || '3.25');
            }

            // Handle portfolio value - check actual response structure
            if (portfolioValueData && portfolioValueData.value) {
                portfolioValueUSD = parseFloat(portfolioValueData.value);
            }

            const portfolioValueMON = portfolioValueUSD / monPriceUSD;
            const monValueUSD = monBalance * monPriceUSD;

            console.log('Processed values:', {
                monBalance,
                monPriceUSD,
                portfolioValueUSD,
                portfolioValueMON,
                monValueUSD
            });

            const welcomeText = `🛸 *Welcome to Area51!*
_The main area for real nads!_

🧾 *Your Wallet Address:*
\`${user.wallet_address}\`

💼 *Balance:*
• MON: ${monBalance.toFixed(6)} ~$${monValueUSD.toFixed(2)}
• Portfolio Value: ${portfolioValueMON.toFixed(6)} MON ~$${portfolioValueUSD.toFixed(2)}

🟣 *Current MON Price:* $${monPriceUSD.toFixed(4)}

▫️*What you can do:*
• Buy and sell tokens instantly
• Track your portfolio with real-time P&L
• Browse trending token categories
• Manage your wallet securely

💡 Click on the Refresh button to update your current balance.`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💰 Buy', 'buy'), Markup.button.callback('💸 Sell', 'sell')],
                [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
                [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
                [Markup.button.callback('❓ Help', 'help')]
            ]);

            try {
                if (ctx.callbackQuery) {
                    await ctx.editMessageText(welcomeText, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                } else {
                    await ctx.replyWithMarkdown(welcomeText, keyboard);
                }
            } catch (error) {
                await ctx.replyWithMarkdown(welcomeText, keyboard);
            }
        } catch (error) {
            this.monitoring.logError('Welcome display failed', error, { userId });
            await ctx.reply('❌ Error loading data. Please try again.');
        }
    }

    async handleBackToMainWithDebug(ctx) {
        const userId = ctx.from.id;
        
        console.log('🔍 DEBUG: handleBackToMainWithDebug called for user:', userId);
        console.log('🔍 DEBUG: ctx.callbackQuery exists:', !!ctx.callbackQuery);
        console.log('🔍 DEBUG: ctx.message exists:', !!ctx.message);
        
        try {
            // Get fresh user data
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                console.log('🔍 DEBUG: No user found');
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            console.log('🔍 DEBUG: User found:', user.wallet_address);

            // Get fresh data
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address),
                this.monorailAPI.getPortfolioValue(user.wallet_address),
                this.monorailAPI.getMONPriceUSD()
            ]);

            // Extract values
            let monBalance = 0;
            let monPriceUSD = 3.25;
            let portfolioValueUSD = 0;

            if (monBalanceData && monBalanceData.balance) {
                const balanceWei = monBalanceData.balance;
                monBalance = parseFloat(balanceWei) / Math.pow(10, 18);
                if (monBalanceData.balanceFormatted) {
                    monBalance = parseFloat(monBalanceData.balanceFormatted);
                }
            }

            if (monPriceData) {
                monPriceUSD = parseFloat(monPriceData.price || monPriceData.priceUSD || '3.25');
            }

            if (portfolioValueData && portfolioValueData.value) {
                portfolioValueUSD = parseFloat(portfolioValueData.value);
            }

            const portfolioValueMON = portfolioValueUSD / monPriceUSD;
            const monValueUSD = monBalance * monPriceUSD;

            const welcomeText = `🛸 *Welcome to Area51!*
_The main area for real nads!_

🧾 *Your Wallet Address:*
\`${user.wallet_address}\`

💼 *Balance:*
• MON: ${monBalance.toFixed(6)} ~$${monValueUSD.toFixed(2)}
• Portfolio Value: ${portfolioValueMON.toFixed(6)} MON ~$${portfolioValueUSD.toFixed(2)}

🟣 Current MON Price: $${monPriceUSD.toFixed(4)}

▫️What you can do:
• Buy and sell tokens instantly
• Track your portfolio with real-time P&L
• Browse trending token categories
• Manage your wallet securely

💡 Click on the Refresh button to update your current balance.`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💰 Buy', 'buy'), Markup.button.callback('💸 Sell', 'sell')],
                [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
                [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
                [Markup.button.callback('❓ Help', 'help')]
            ]);

            console.log('🔍 DEBUG: Keyboard created with buttons:', keyboard.reply_markup.inline_keyboard.length);
            console.log('🔍 DEBUG: Full keyboard structure:', JSON.stringify(keyboard.reply_markup, null, 2));

            // CRITICAL FIX: Always delete and send new message for back navigation
            try {
                console.log('🔍 DEBUG: Deleting current message...');
                await ctx.deleteMessage();
                console.log('🔍 DEBUG: Message deleted, sending new one...');
                
                const sentMessage = await ctx.replyWithMarkdown(welcomeText, keyboard);
                console.log('🔍 DEBUG: New message sent with ID:', sentMessage.message_id);
                console.log('🔍 DEBUG: Message has reply_markup:', !!sentMessage.reply_markup);
                
            } catch (deleteError) {
                console.log('🔍 DEBUG: Delete failed, trying edit...', deleteError.message);
                
                try {
                    await ctx.editMessageText(welcomeText, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    });
                    console.log('🔍 DEBUG: Message edited successfully');
                } catch (editError) {
                    console.log('🔍 DEBUG: Edit failed, sending new...', editError.message);
                    const sentMessage = await ctx.replyWithMarkdown(welcomeText, keyboard);
                    console.log('🔍 DEBUG: Fallback message sent with ID:', sentMessage.message_id);
                }
            }

            console.log('🔍 DEBUG: Back to main completed successfully');
            
        } catch (error) {
            console.log('🔍 DEBUG: Back to main failed:', error);
            await ctx.reply('❌ Error loading main menu. Please try /start');
        }
    }

    async handleRefreshWithWelcome(ctx) {
        const userId = ctx.from.id;
        
        console.log('🔍 DEBUG: handleRefreshWithWelcome called for user:', userId);
        console.log('🔍 DEBUG: ctx.callbackQuery exists:', !!ctx.callbackQuery);
        
        try {
            await ctx.answerCbQuery('🔄 Refreshing...');
            
            // Get fresh user data first
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.answerCbQuery('⚠️ User not found');
                return;
            }

            console.log('🔍 DEBUG: User found:', user.wallet_address);

            // Force refresh of all cached data
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address, true),
                this.monorailAPI.getPortfolioValue(user.wallet_address, true),
                this.monorailAPI.getMONPriceUSD(true)
            ]);

            // Extract values with better error handling and fallbacks
            let monBalance = 0;
            let monPriceUSD = 3.25;
            let portfolioValueUSD = 0;

            // Handle MON balance - check actual response structure
            if (monBalanceData && monBalanceData.balance) {
                // Convert from wei to MON (divide by 10^18)
                const balanceWei = monBalanceData.balance;
                monBalance = parseFloat(balanceWei) / Math.pow(10, 18);
                
                // If balanceFormatted exists, use it instead
                if (monBalanceData.balanceFormatted) {
                    monBalance = parseFloat(monBalanceData.balanceFormatted);
                }
            }

            // Handle MON price
            if (monPriceData) {
                monPriceUSD = parseFloat(monPriceData.price || monPriceData.priceUSD || '3.25');
            }

            // Handle portfolio value - check actual response structure
            if (portfolioValueData && portfolioValueData.value) {
                portfolioValueUSD = parseFloat(portfolioValueData.value);
            }

            const portfolioValueMON = portfolioValueUSD / monPriceUSD;
            const monValueUSD = monBalance * monPriceUSD;

            const welcomeText = `🛸 *Welcome to Area51!*
_The main area for real nads!_

🧾 *Your Wallet Address:*
\`${user.wallet_address}\`

💼 *Balance:*
• MON: ${monBalance.toFixed(6)} ~$${monValueUSD.toFixed(2)}
• Portfolio Value: ${portfolioValueMON.toFixed(6)} MON ~$${portfolioValueUSD.toFixed(2)}

🟣 Current MON Price: $${monPriceUSD.toFixed(4)}

▫️What you can do:
• Buy and sell tokens instantly
• Track your portfolio with real-time P&L
• Browse trending token categories
• Manage your wallet securely

💡 Click on the Refresh button to update your current balance.`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💰 Buy', 'buy'), Markup.button.callback('💸 Sell', 'sell')],
                [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
                [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
                [Markup.button.callback('❓ Help', 'help')]
            ]);

            console.log('🔍 DEBUG: Keyboard created:', JSON.stringify(keyboard, null, 2));
            console.log('🔍 DEBUG: Keyboard reply_markup:', JSON.stringify(keyboard.reply_markup, null, 2));
            console.log('🔍 DEBUG: Inline keyboard buttons count:', keyboard.reply_markup?.inline_keyboard?.length || 0);

            // CRITICAL: Delete the current message first, then send new one with buttons
            try {
                console.log('🔍 DEBUG: Attempting to delete current message...');
                await ctx.deleteMessage();
                console.log('🔍 DEBUG: Message deleted successfully');
                
                console.log('🔍 DEBUG: Sending new message with keyboard...');
                const sentMessage = await ctx.replyWithMarkdown(welcomeText, keyboard);
                console.log('🔍 DEBUG: New message sent successfully with ID:', sentMessage.message_id);
                
            } catch (deleteError) {
                console.log('🔍 DEBUG: Delete failed, trying editMessageText...', deleteError.message);
                
                try {
                    await ctx.editMessageText(welcomeText, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    });
                    console.log('🔍 DEBUG: Message edited successfully');
                } catch (editError) {
                    console.log('🔍 DEBUG: Edit failed, sending new message...', editError.message);
                    const sentMessage = await ctx.replyWithMarkdown(welcomeText, keyboard);
                    console.log('🔍 DEBUG: Fallback message sent with ID:', sentMessage.message_id);
                }
            }

            await ctx.answerCbQuery('✅ Data refreshed successfully!');
            console.log('🔍 DEBUG: Refresh completed successfully');
            
        } catch (error) {
            console.log('🔍 DEBUG: Refresh failed with error:', error);
            this.monitoring.logError('Refresh failed', error, { userId });
            await ctx.answerCbQuery('❌ Refresh failed. Please try again.');
        }
    }

    async handleRefresh(ctx) {
        const userId = ctx.from.id;
        
        try {
            await ctx.answerCbQuery('🔄 Refreshing...');
            
            // Get fresh user data first
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.answerCbQuery('⚠️ User not found');
                return;
            }

            // Force refresh of all cached data using new API endpoints
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address, true), // Force refresh
                this.monorailAPI.getPortfolioValue(user.wallet_address, true), // Force refresh
                this.monorailAPI.getMONPriceUSD(true) // Force refresh
            ]);

            // Extract values
            const monBalance = parseFloat(monBalanceData.balanceFormatted || '0');
            const monPriceUSD = parseFloat(monPriceData.price || '3.25');
            const portfolioValueUSD = parseFloat(portfolioValueData.usdValue || '0');
            const portfolioValueMON = portfolioValueUSD / monPriceUSD;

            // Calculate MON value in USD
            const monValueUSD = monBalance * monPriceUSD;

            const welcomeText = `🛸 *Welcome to Area51!*
_The main area for real nads!_

🧾 *Your Wallet Address:*
\`${user.wallet_address}\`

💼 *Balance:*
• MON: ${monBalance.toFixed(6)} ~$${monValueUSD.toFixed(2)}
• Portfolio Value: ${portfolioValueMON.toFixed(6)} MON ~$${portfolioValueUSD.toFixed(2)}

🟣 *Current MON Price:* $${monPriceUSD.toFixed(4)}

▫️*What you can do:*
• Buy and sell tokens instantly
• Track your portfolio with real-time P&L
• Browse trending token categories
• Manage your wallet securely

💡 Click on the Refresh button to update your current balance.`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💰 Buy', 'buy'), Markup.button.callback('💸 Sell', 'sell')],
                [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
                [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
                [Markup.button.callback('❓ Help', 'help')]
            ]);

            // Update the message with fresh data
            await ctx.editMessageText(welcomeText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            await ctx.answerCbQuery('✅ Data refreshed successfully!');
        } catch (error) {
            this.monitoring.logError('Refresh failed', error, { userId });
            await ctx.answerCbQuery('❌ Refresh failed. Please try again.');
        }
    }

    async handlePortfolioAction(ctx) {
        const userId = ctx.from.id;
        
        try {
            await ctx.answerCbQuery();
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(userId, user.wallet_address, 1, false);
            
            await ctx.editMessageText(portfolioDisplay.text, {
                parse_mode: 'Markdown',
                reply_markup: portfolioDisplay.keyboard
            });
        } catch (error) {
            this.monitoring.logError('Portfolio display failed', error, { userId });
            await ctx.reply('❌ Error loading portfolio. Please try again.');
        }
    }

    // Essential handler methods from index.js
    async handleGenerateWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('⚠️ Please create a wallet first using /start');
                return;
            }

            // Get portfolio data directly from API (real data)
            let portfolioTokens = [];
            try {
                portfolioTokens = await this.monorailAPI.getWalletBalance(user.wallet_address, false); // Use cache
                console.log(`📊 Portfolio loaded (${portfolioTokens.length} tokens)`);
            } catch (error) {
                this.monitoring.logError('Portfolio fetch failed', error, { userId });
                portfolioTokens = [];
            }

            let portfolioText = `📊 **Your Portfolio**\n\n`;
            
            if (!portfolioTokens || portfolioTokens.length === 0) {
                portfolioText += `💼 **Portfolio Summary**\n`;
                portfolioText += `No tokens found in your portfolio.\n\n`;
                portfolioText += `Start trading to build your portfolio! 🚀`;
            } else {
                // Filter tokens: exclude MON and only show tokens with mon_value >= 0.01
                const significantTokens = portfolioTokens.filter(token => {
                    const monValue = parseFloat(token.mon_value || '0');
                    const isNotMON = token.address.toLowerCase() !== '0x0000000000000000000000000000000000000000';
                    return monValue >= 0.01 && isNotMON;
                });
                
                // Sort by mon_value descending
                significantTokens.sort((a, b) => {
                    const aValue = parseFloat(a.mon_value || '0');
                    const bValue = parseFloat(b.mon_value || '0');
                    return bValue - aValue;
                });
                
                // Get MON token for price info
                const monToken = portfolioTokens.find(token => 
                    token.address.toLowerCase() === '0x0000000000000000000000000000000000000000'
                );
                const monPriceUSD = monToken ? parseFloat(monToken.usd_per_token || '3.25') : 3.25;
                
                // Calculate total portfolio value in MON (excluding MON balance itself)
                let totalMonValue = 0;
                for (const token of significantTokens) {
                    totalMonValue += parseFloat(token.mon_value || '0');
                }
                
                const totalUsdValue = totalMonValue * monPriceUSD;
                
                portfolioText += `💼 ***Portfolio Summary***\n`;
                portfolioText += `_Total Value:_ **${totalMonValue.toFixed(6)} MON** (~$${totalUsdValue.toFixed(2)})\n`;
                portfolioText += `_MON Price:_ **$${monPriceUSD.toFixed(4)}**\n\n`;
                
                if (significantTokens.length > 0) {
                    const topTokens = significantTokens.slice(0, 3);
                    const hasMoreTokens = significantTokens.length > 3;
                    
                    portfolioText += `🏆 ***Top Holdings:***\n`;
                    
                    for (const token of topTokens) {
                        const balance = parseFloat(token.balance || '0');
                        const usdPerToken = parseFloat(token.usd_per_token || '0');
                        const monPerToken = parseFloat(token.mon_per_token || '0');
                        const monValue = parseFloat(token.mon_value || '0');
                        const usdValue = balance * usdPerToken;
                        
                        portfolioText += `\n**${token.name}** _(${token.symbol})_\n`;
                        portfolioText += `• Balance: **${balance.toFixed(6)}**\n`;
                        portfolioText += `• Price: **${monPerToken.toFixed(6)} MON** (~$${usdPerToken.toFixed(2)})\n`;
                        portfolioText += `• Value: **${monValue.toFixed(6)} MON** (~$${usdValue.toFixed(2)})\n`;
                    }
                    
                    if (hasMoreTokens) {
                        portfolioText += `\n_+${significantTokens.length - 3} more tokens..._\n`;
                    }
                } else {
                    portfolioText += `📈 ***Holdings:***\n`;
                    portfolioText += `_No tokens with significant value (≥0.01 MON) found._\n\n`;
                    portfolioText += `Start trading to build your portfolio! 🚀`;
                }
            }

            // Create keyboard with action buttons
            let keyboardButtons = [];
            
            if (portfolioTokens && portfolioTokens.length > 0) {
                // Filter significant tokens (excluding MON)
                const significantTokens = portfolioTokens.filter(token => {
                    const monValue = parseFloat(token.mon_value || '0');
                    const isNotMON = token.address.toLowerCase() !== '0x0000000000000000000000000000000000000000';
                    return monValue >= 0.01 && isNotMON;
                });
                
                if (significantTokens.length > 3) {
                    keyboardButtons.push([Markup.button.callback('📋 Show More Tokens', 'portfolio_more')]);
                }
            }
            
            keyboardButtons.push([
                Markup.button.callback('🔄 Refresh', 'refresh'),
                Markup.button.callback('💰 Buy', 'buy')
            ]);
            keyboardButtons.push([Markup.button.callback('🔙 Main Menu', 'main')]);
            
            const keyboard = Markup.inlineKeyboard(keyboardButtons);

            try {
                await ctx.editMessageText(portfolioText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (error) {
                await ctx.replyWithMarkdown(portfolioText, keyboard);
            }

        } catch (error) {
            this.monitoring.logError('Portfolio display failed', error, { userId });
            try {
                await ctx.reply('⚠️ Unable to load portfolio. Please try again.');
            } catch (replyError) {
                // If reply fails, try to edit the message instead
                try {
                    await ctx.editMessageText('⚠️ Unable to load portfolio. Please try again.');
                } catch (editError) {
                    console.error('Failed to send error message:', editError);
                }
            }
        }
    }

    // Essential handler methods from index.js
    async handleGenerateWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            // Import required modules
            const WalletManager = require('./wallet');
            const walletManager = new WalletManager();
            
            const wallet = await walletManager.generateWallet();
            
            await this.database.createUser(userId, wallet.address, wallet.encryptedPrivateKey, wallet.mnemonic, ctx.from.username);
            
            // Now store the welcome message ID after user is created
            try {
                const userState = await this.database.getUserState(userId, 'welcome_message');
                if (!userState) {
                    // Find the original welcome message and store its ID
                    await this.database.setUserState(userId, 'welcome_message', { messageId: ctx.callbackQuery?.message?.message_id });
                }
            } catch (stateError) {
                // Silent error handling for state storage
            }
            
            const message = `🛸 *Wallet Created Successfully*

Your new wallet has been generated:

*Address:* \`${wallet.address}\`
*Private Key:* \`${this.maskPrivateKey(wallet.privateKey)}\`

⚠️ *SECURITY NOTICE*
• Store these credentials securely offline
• Private key is partially hidden for security
• This message auto-deletes in 30 seconds

Your wallet is ready to use!`;

            const startKeyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🚀 Start Trading', 'main')]
            ]);
            
            // Try to edit the welcome message instead of sending a new one
            try {
                // Use the callback query message ID as the welcome message
                const welcomeMessageId = ctx.callbackQuery?.message?.message_id;
                if (welcomeMessageId) {
                    await ctx.telegram.editMessageText(
                        ctx.chat.id,
                        welcomeMessageId,
                        null,
                        message,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: startKeyboard.reply_markup
                        }
                    );
                } else {
                    throw new Error('No welcome message to edit');
                }
            } catch (editError) {
                // Fallback to sending new message
                const sentMessage = await ctx.reply(message, { 
                    parse_mode: 'Markdown',
                    reply_markup: startKeyboard.reply_markup
                });
                
                // Auto-delete after 30 seconds
                setTimeout(async () => {
                    try {
                        await ctx.deleteMessage(sentMessage.message_id);
                    } catch (error) {
                        // Silent error handling
                    }
                }, 30000);
            }
            
        } catch (error) {
            this.monitoring.logError('Wallet generation failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error generating wallet. Please try again.');
        }
    }

    async handleImportWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Check if user already exists, if not create a temporary entry
            const userId = ctx.from.id;
            const existingUser = await this.database.getUser(userId);
            
            if (!existingUser) {
                // Create a temporary user entry to satisfy foreign key constraint
                const tempWallet = await this.walletManager.generateWallet();
                await this.database.createUser(
                    userId,
                    tempWallet.address,
                    tempWallet.encryptedPrivateKey,
                    tempWallet.encryptedMnemonic,
                    ctx.from.username || 'Unknown'
                );
            }
            
            const importText = `🔑 *Import Existing Wallet*

Please send your private key or mnemonic phrase.

⚠️ *Security Notice:*
• Your message will be automatically deleted
• Never share your private key with anyone else
• Make sure you're in a private chat`;

            // Try to edit the welcome message instead of sending a new one
            try {
                // Use the callback query message ID as the welcome message
                const welcomeMessageId = ctx.callbackQuery?.message?.message_id;
                if (welcomeMessageId) {
                    await ctx.telegram.editMessageText(
                        ctx.chat.id,
                        welcomeMessageId,
                        null,
                        importText,
                        {
                            parse_mode: 'Markdown'
                        }
                    );
                } else {
                    throw new Error('No welcome message to edit');
                }
            } catch (editError) {
                // Fallback to sending new message
                await ctx.replyWithMarkdown(importText);
            }
            
            await this.database.setUserState(ctx.from.id, 'importing_wallet');
            console.log(`🔍 DEBUG: Set user state to 'importing_wallet' for user ${ctx.from.id}`);
            
        } catch (error) {
            this.monitoring.logError('Import wallet failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error starting wallet import. Please try again.');
        }
    }

    async handleExportPrivateKey(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                return ctx.reply('❌ No wallet found.');
            }

            const WalletManager = require('./wallet');
            const walletManager = new WalletManager();
            const privateKey = walletManager.decrypt(user.encrypted_private_key);
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔓 Reveal Full Key', `reveal_key_${userId}`)],
                [Markup.button.callback('🔙 Back to Wallet', 'wallet')]
            ]);

            await ctx.editMessageText(`🔑 *Private Key Export*

*Masked Key:* \`${this.maskPrivateKey(privateKey)}\`

⚠️ *SECURITY WARNING*
• Never share your private key
• Anyone with this key can access your funds
• Store it securely offline

Click below to reveal the full key:`, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Export private key failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error exporting private key.');
        }
    }


    async handleDeleteWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const confirmationText = `⚠️ *Delete Wallet Confirmation*

Are you sure you want to permanently delete your wallet?

⚠️ *Important Warning:*
• All your data will be permanently deleted
• You cannot recover the wallet after deletion
• Make sure to save your private key before deleting
• This action cannot be undone!`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Yes, Delete Wallet', 'confirm_delete_wallet')],
                [Markup.button.callback('❌ Cancel', 'wallet')]
            ]);

            await ctx.editMessageText(confirmationText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Delete wallet confirmation failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error showing delete confirmation. Please try again.');
        }
    }

    async handleConfirmDeleteWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            // Delete user from database
            await this.database.deleteUser(userId);
            
            const successText = `✅ *Wallet Deleted Successfully*

Your wallet and all associated data have been permanently removed.

You can create a new wallet anytime using /start`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🆕 Create New Wallet', 'generate_wallet')],
                [Markup.button.callback('📥 Import Wallet', 'import_wallet')]
            ]);

            await ctx.editMessageText(successText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Delete wallet failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error deleting wallet. Please try again.');
        }
    }

    async showWalletInterface(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                return ctx.reply('❌ No wallet found. Please create one first.');
            }

            const walletText = `👛 *Wallet Management*

*Address:* \`${user.wallet_address}\`

Manage your wallet securely:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔑 Export Private Key', 'export_private_key')],
                [Markup.button.callback('🗑️ Delete Wallet', 'delete_wallet')],
                [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
            ]);

            try {
                await ctx.editMessageText(walletText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (error) {
                await ctx.replyWithMarkdown(walletText, keyboard);
            }
            
        } catch (error) {
            this.monitoring.logError('Wallet interface failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading wallet interface.');
        }
    }

    async showTokenCategories(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const categoriesText = `🔥 *Monad Testnet Token Explorer*

Explore and trade tokens in the Monad ecosystem:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Verified Tokens', 'category_verified'), Markup.button.callback('💵 Stablecoins', 'category_stable')],
                [Markup.button.callback('🌐 Bridged Assets', 'category_bridged'), Markup.button.callback('🐸 Meme Coins', 'category_meme')],
                [Markup.button.callback('🥩 Liquid Staking', 'category_lst')],
                [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
            ]);

            try {
                await ctx.editMessageText(categoriesText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (error) {
                await ctx.replyWithMarkdown(categoriesText, keyboard);
            }
            
        } catch (error) {
            this.monitoring.logError('Token categories failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading token categories.');
        }
    }

    async showSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Get user settings to display current Turbo Mode status
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            const turboStatus = userSettings.turbo_mode ? '🟢 ON' : '🔴 OFF';
            
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

    async handleToggleTurboMode(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const currentSettings = await this.database.getUserSettings(userId);
            const newTurboMode = !currentSettings.turbo_mode;
            
            // Update turbo mode in database
            await this.database.updateUserSettings(userId, { turbo_mode: newTurboMode });
            
            // Show warning message when enabling Turbo Mode
            if (newTurboMode) {
                const warningText = `⚠️ *Turbo Mode Enabled*

*WARNING:* Turbo Mode prioritizes speed over safety:
• No balance validations
• No approval checks  
• 20% slippage tolerance
• Immediate execution

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
                // Turbo mode disabled - show success and return to settings
                await ctx.editMessageText('🔴 Turbo Mode disabled. Trading will use normal safety checks.', {
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Back to Settings', 'settings')]
                    ]).reply_markup
                });
            }
            
        } catch (error) {
            this.monitoring.logError('Toggle turbo mode failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error toggling turbo mode.');
        }
    }

    async handleConfirmTurboEnable(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            
            // Confirm turbo mode is enabled in database
            await this.database.updateUserSettings(userId, { turbo_mode: true });
            
            await ctx.editMessageText('🟢 *Turbo Mode Enabled!*\n\nTrading will now prioritize maximum speed over safety checks.', {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Settings', 'settings')]
                ]).reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Confirm turbo enable failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error enabling turbo mode.');
        }
    }

    async showHelp(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const helpText = `🛸 *Area51 Trading Bot Help*

*Commands:*
/start - Initialize bot and wallet
/buy - Buy tokens with MON
/sell - Sell tokens for MON
/portfolio - View portfolio and P&L
/wallet - Wallet management
/transfer - Send MON to address
/categories - Browse token categories
/settings - Configure preferences
/help - Show this help

*Quick Actions:*
• Click Buy/Sell for instant trading
• Use Portfolio to track gains/losses
• Settings to customize slippage & fees

*Support:* Contact admin for help`;

            await ctx.reply(helpText);
            
        } catch (error) {
            this.monitoring.logError('Help failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading help.');
        }
    }

    async showTransferInterface(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const transferText = `📤 *Transfer MON*

Send MON to another address.

Please enter the recipient address:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
            ]);

            await ctx.replyWithMarkdown(transferText, keyboard);
            await this.database.setUserState(ctx.from.id, 'transfer_address');
            
        } catch (error) {
            this.monitoring.logError('Transfer interface failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading transfer interface.');
        }
    }

    // Utility methods
    maskPrivateKey(privateKey) {
        if (!privateKey || privateKey.length < 10) return '***INVALID***';
        return privateKey.substring(0, 6) + '...' + privateKey.substring(privateKey.length - 4);
    }

    // Professional trading and wallet management handlers
    async handleBuyInterface(ctx) {
        await ctx.answerCbQuery();
        
        const buyText = `💰 *Buy Tokens*

Please enter the token contract address you want to buy:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
        ]);

        await ctx.editMessageText(buyText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });

        // Set user state to expect token address input
        await this.database.setUserState(ctx.from.id, 'awaiting_token_address', {});
    }

    async handleSellInterface(ctx) {
        await ctx.answerCbQuery();
        
        const sellText = `💸 *Sell Tokens*

Select percentage to sell:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('25%', 'sell_25'), Markup.button.callback('50%', 'sell_50')],
            [Markup.button.callback('75%', 'sell_75'), Markup.button.callback('100%', 'sell_100')],
            [Markup.button.callback('📝 Custom %', 'sell_custom')],
            [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
        ]);

        await ctx.editMessageText(sellText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }

    async handleBuyAmount(ctx) {
        await ctx.answerCbQuery();
        const amount = ctx.match[1];
        
        try {
            // Get user state to find the selected token
            const userState = await this.database.getUserState(ctx.from.id);
            
            if ((userState?.state !== 'awaiting_buy_amount' && userState?.state !== 'buy_token') || !userState?.data?.tokenAddress) {
                return ctx.reply('❌ Token selection expired. Please try again.');
            }
            
            const tokenAddress = userState.data.tokenAddress;
            
            // Get token info for confirmation
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            if (!tokenInfo.success) {
                return ctx.reply('❌ Token not found. Please try again.');
            }
            
            const confirmText = `💰 *Confirm Purchase*

*Token:* ${tokenInfo.token.name} (${tokenInfo.token.symbol})
*Amount:* ${amount} MON
*Address:* \`${tokenAddress}\`

Proceed with purchase?`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirm', `confirm_buy_${tokenAddress}_${amount}`)],
                [Markup.button.callback('❌ Cancel', 'cancel_trade')]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Buy amount handler failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing purchase. Please try again.');
        }
    }

    async handleCustomBuy(ctx) {
        await ctx.answerCbQuery();
        
        await ctx.reply('💰 Enter the amount of MON you want to spend:');
        await this.database.setUserState(ctx.from.id, 'custom_buy');
    }

    async handleSellPercentage(ctx) {
        await ctx.answerCbQuery();
        const percentage = ctx.match[1];
        
        await this.database.setUserState(ctx.from.id, 'sell_percentage', { percentage });
        
        // Show user's tokens for selling
        try {
            const userId = ctx.from.id;
            const user = await this.database.getUserByTelegramId(userId);
            
            if (!user) {
                return ctx.reply('❌ No wallet found. Please create one first.');
            }

            const portfolio = await this.portfolioManager.getPortfolio(user.wallet_address);
            
            if (!portfolio.tokens || portfolio.tokens.length === 0) {
                return ctx.reply('📭 No tokens found in your portfolio.');
            }

            let tokensText = `💸 *Select Token to Sell (${percentage}%)*\n\n`;
            const buttons = [];

            portfolio.tokens.forEach((token, index) => {
                if (index < 10) { // Limit to 10 tokens
                    tokensText += `${index + 1}. ${token.symbol} - ${token.balance} tokens\n`;
                    buttons.push([Markup.button.callback(`${token.symbol}`, `sell_token_${token.address}`)]);
                }
            });

            buttons.push([Markup.button.callback('🔙 Back', 'sell')]);

            const keyboard = Markup.inlineKeyboard(buttons);
            await ctx.editMessageText(tokensText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Sell percentage handler failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading portfolio. Please try again.');
        }
    }

    async handleCustomSell(ctx) {
        await ctx.answerCbQuery();
        
        await ctx.reply('💸 Enter the percentage you want to sell (1-100):');
        await this.database.setUserState(ctx.from.id, 'custom_sell');
    }

    async handleBuyTokenFromCategory(ctx) {
        await ctx.answerCbQuery();
        const tokenAddress = ctx.match[1];
        
        console.log('Buy token clicked, address:', tokenAddress);
        
        // Validate token address
        if (!tokenAddress || tokenAddress === 'undefined') {
            return ctx.reply('❌ Invalid token address. Please try again.');
        }
        
        // Get token info to display in buy screen
        const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
        if (!tokenInfo.success) {
            return ctx.reply('❌ Token not found. Please try again.');
        }
        
        // Set the token address and show buy amounts
        await this.database.setUserState(ctx.from.id, 'buy_token', { tokenAddress });
        
        const settings = await this.database.getUserSettings(ctx.from.id);
        const amounts = parseCustomAmounts(settings.custom_buy_amounts);
        
        const buyText = `
💰 *Buy ${tokenInfo.token.symbol}*

*Token:* ${tokenInfo.token.name} (${tokenInfo.token.symbol})
*Address:* \`${tokenAddress}\`

Select amount of MON to spend:
        `;
        
        const keyboard = Markup.inlineKeyboard([
            amounts.map(amount => Markup.button.callback(`${amount} MON`, `buy_amount_${amount}`)),
            [Markup.button.callback('📝 Custom Amount', 'buy_amount_custom')],
            [Markup.button.callback('🔙 Back', 'token_categories')]
        ]);
        
        await ctx.replyWithMarkdown(buyText, keyboard);
    }

    async handleSelectTokenToSell(ctx) {
        await ctx.answerCbQuery();
        const tokenAddress = ctx.match[1];
        
        try {
            const userState = await this.database.getUserState(ctx.from.id);
            const percentage = userState?.data?.percentage || '50';
            
            const confirmText = `💸 *Confirm Sale*

*Token:* ${tokenAddress.slice(0, 8)}...
*Percentage:* ${percentage}%

Proceed with sale?`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirm', `confirm_sell_${tokenAddress}`)],
                [Markup.button.callback('❌ Cancel', 'cancel_trade')]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Select token to sell failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing sale. Please try again.');
        }
    }

    async handleConfirmBuy(ctx) {
        await ctx.answerCbQuery();
        const [, tokenAddress, amount] = ctx.match;
        
        await ctx.editMessageText('🔄 Processing purchase...', { parse_mode: 'Markdown' });
        
        try {
            const userId = ctx.from.id;
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.editMessageText('❌ User not found. Please restart the bot with /start');
                return;
            }

            // Check if user has Turbo Mode enabled
            const userSettings = await this.database.getUserSettings(userId);
            const isTurboMode = userSettings.turbo_mode;

            if (isTurboMode) {
                // Turbo Mode: Skip all safety checks and execute immediately
                const result = await this.tradingEngine.executeBuyTurbo(userId, tokenAddress, parseFloat(amount));
                
                if (result.success) {
                    // Clear cache after successful turbo transaction
                    await this.portfolioService.clearUserPortfolioCache(userId);
                    if (this.redis) {
                        try {
                            await Promise.all([
                                this.redis.del(`balance:${userId}`),
                                this.redis.del(`user:${userId}`)
                            ]);
                        } catch (redisError) {
                            this.monitoring.logError('Cache clear failed after turbo buy', redisError, { userId });
                        }
                    }
                    
                    await ctx.editMessageText(
                        `🚀 *Turbo Purchase Complete!*\n\n` +
                        `[✅ View Transaction](https://testnet.monadexplorer.com/tx/${result.txHash})`,
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await ctx.editMessageText(`❌ Turbo purchase failed: ${result.error}`);
                }
                return;
            }

            // Normal Mode: Full safety checks
            const wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);
            const balance = await this.walletManager.getBalance(wallet.address);
            const requiredAmount = parseFloat(amount);
            const gasBuffer = 0.05;
            
            if (parseFloat(balance) < (requiredAmount + gasBuffer)) {
                await ctx.editMessageText(
                    `❌ **Insufficient Balance**\n\n` +
                    `💰 Current: ${balance} MON\n` +
                    `💸 Required: ${requiredAmount} MON\n` +
                    `⛽ Gas buffer: ${gasBuffer} MON\n` +
                    `📊 Total needed: ${(requiredAmount + gasBuffer).toFixed(4)} MON\n\n` +
                    `Please add more MON to your wallet or try a smaller amount.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // Execute buy transaction with normal slippage
            const result = await this.tradingEngine.executeBuy(userId, tokenAddress, parseFloat(amount), 5);
            
        if (result.success) {
            // Clear cache to force fresh data after successful transaction
            await this.portfolioService.clearUserPortfolioCache(userId);
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`balance:${userId}`),
                        this.redis.del(`user:${userId}`) // Clear user cache to refresh main menu balance
                    ]);
                    this.monitoring.logInfo('Cache cleared after successful buy transaction', { userId, txHash: result.txHash });
                } catch (redisError) {
                    this.monitoring.logError('Cache clear failed after buy transaction', redisError, { userId });
                }
            }
                
            const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.txHash}`;
            
            await ctx.editMessageText(`[✅ Purchase Successful!](${explorerUrl})`, {
                parse_mode: 'Markdown'
            });
        } else {
            await ctx.editMessageText(`❌ *Purchase Failed*

${result.error}

Please try again or contact support.`, {
                parse_mode: 'Markdown'
            });
        }

    } catch (error) {
        this.monitoring.logError('Confirm buy failed', error, { userId: ctx.from.id });
        await ctx.editMessageText('❌ Transaction failed. Please try again.');
    }
}

async handleConfirmSell(ctx) {
    await ctx.answerCbQuery();
    const tokenAddress = ctx.match[1];
        
    await ctx.editMessageText('🔄 Processing sale...', { parse_mode: 'Markdown' });
        
    try {
        const userId = ctx.from.id;
        const user = await this.database.getUserByTelegramId(userId);
        const userState = await this.database.getUserState(userId);
        const percentage = userState?.data?.percentage || '50';
            
        if (!user) {
            return ctx.editMessageText('❌ No wallet found.');
        }

        // Execute sell transaction
        const result = await this.tradingEngine.executeSell(userId, tokenAddress, percentage);
            
        if (result.success) {
            // Clear cache to force fresh data after successful transaction
            if (this.redis) {
                try {
                    await Promise.all([
                        this.redis.del(`balance:${userId}`),
                        this.redis.del(`portfolio:${userId}`),
                        this.redis.del(`user:${userId}`) // Clear user cache to refresh main menu balance
                    ]);
                    this.monitoring.logInfo('Cache cleared after successful sell transaction', { userId, txHash: result.txHash });
                } catch (redisError) {
                    this.monitoring.logError('Cache clear failed after sell transaction', redisError, { userId });
                }
            }
                
            await ctx.editMessageText(`✅ *Sale Successful!*

*Percentage:* ${percentage}%
*Token:* ${tokenAddress.slice(0, 8)}...
*Transaction:* \`${result.txHash}\`

MON received: ${result.monReceived || 'Calculating...'}`, {
                parse_mode: 'Markdown'
            });
        } else {
            await ctx.editMessageText(`❌ *Sale Failed*

${result.error}

Please try again or contact support.`, {
                parse_mode: 'Markdown'
            });
        }

    } catch (error) {
        this.monitoring.logError('Confirm sell failed', error, { userId: ctx.from.id });
        await ctx.editMessageText('❌ Transaction failed. Please try again.');
    }
}

async handleCancelTrade(ctx) {
    await ctx.answerCbQuery();
    await ctx.editMessageText('❌ Trade cancelled.', { parse_mode: 'Markdown' });
    await this.database.clearUserState(ctx.from.id);
}

async handleTokenCategory(ctx) {
        await ctx.answerCbQuery();
        const match = ctx.match[1];
        const page = parseInt(ctx.match[2]) || 1;
        
        try {
            const category = match;
            const tokensPerPage = 8;
            
            // Get real tokens from Monorail API
            const result = await this.monorailAPI.getTokensByCategory(category);
            
            let tokens = [];
            if (result.success && result.tokens) {
                tokens = result.tokens;
            } else {
                // Fallback to trending tokens if category fails
                const trendingResult = await this.monorailAPI.getTrendingTokens(20);
                if (trendingResult.success) {
                    tokens = trendingResult.tokens;
                }
            }

            const totalTokens = tokens.length;
            const totalPages = Math.ceil(totalTokens / tokensPerPage);
            const startIndex = (page - 1) * tokensPerPage;
            const endIndex = startIndex + tokensPerPage;
            const pageTokens = tokens.slice(startIndex, endIndex);

            let categoryText = `🔥 *${category.charAt(0).toUpperCase() + category.slice(1)} Tokens*\n\n`;
            
            if (pageTokens.length === 0) {
                categoryText += 'No tokens found in this category.\n\n💡 *Try these categories:*\n• Verified tokens\n• Trending tokens\n• Your wallet tokens';
            } else {
                pageTokens.forEach((token, index) => {
                    const symbol = token.symbol || 'Unknown';
                    const name = token.name || 'Unknown Token';
                    const price = token.price ? `$${parseFloat(token.price).toFixed(6)}` : 'Price N/A';
                    categoryText += `${startIndex + index + 1}. *${symbol}* - ${name}\n💰 ${price}\n\n`;
                });
            }

            categoryText += `📄 Page ${page} of ${Math.max(1, totalPages)}`;

            const buttons = [];
            
            // Add token buttons in pairs
            for (let i = 0; i < pageTokens.length; i += 2) {
                const row = [];
                if (pageTokens[i] && pageTokens[i].address) {
                    row.push(Markup.button.callback(
                        `💰 ${pageTokens[i].symbol || 'Token'}`, 
                        `buy_token_${pageTokens[i].address}`
                    ));
                }
                
                if (i + 1 < pageTokens.length && pageTokens[i + 1] && pageTokens[i + 1].address) {
                    row.push(Markup.button.callback(
                        `💰 ${pageTokens[i + 1].symbol || 'Token'}`, 
                        `buy_token_${pageTokens[i + 1].address}`
                    ));
                }
                if (row.length > 0) {
                    buttons.push(row);
                }
            }

            // Add pagination buttons
            if (totalPages > 1) {
                const navButtons = [];
                if (page > 1) {
                    navButtons.push(Markup.button.callback('⬅️ Previous', `category_${category}_${page - 1}`));
                }
                if (page < totalPages) {
                    navButtons.push(Markup.button.callback('➡️ Next', `category_${category}_${page + 1}`));
                }
                if (navButtons.length > 0) {
                    buttons.push(navButtons);
                }
            }

            buttons.push([Markup.button.callback('🔙 Back to Categories', 'token_categories')]);

            const keyboard = Markup.inlineKeyboard(buttons);
            await ctx.editMessageText(categoryText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Token category handler failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading tokens. Please try again.');
        }
    }

    async handleConfirmTransfer(ctx) {
        await ctx.answerCbQuery();
        const [, address, amount] = ctx.match;
        
        await ctx.editMessageText('🔄 Processing transfer...', { parse_mode: 'Markdown' });
        
        try {
            const userId = ctx.from.id;
            const user = await this.database.getUserByTelegramId(userId);
            
            if (!user) {
                return ctx.editMessageText('❌ No wallet found.');
            }

            // Execute transfer
            const result = await this.tradingEngine.transferMON(user.wallet_address, address, amount);
            
            if (result.success) {
                // Clear cache to force fresh data after successful transfer
                if (this.redis) {
                    try {
                        await Promise.all([
                            this.redis.del(`balance:${userId}`),
                            this.redis.del(`portfolio:${userId}`),
                            this.redis.del(`user:${userId}`) // Clear user cache to refresh main menu balance
                        ]);
                        this.monitoring.logInfo('Cache cleared after successful transfer', { userId, txHash: result.txHash });
                    } catch (redisError) {
                        this.monitoring.logError('Cache clear failed after transfer', redisError, { userId });
                    }
                }
                
                await ctx.editMessageText(`✅ *Transfer Successful!*

*To:* \`${address}\`
*Amount:* ${amount} MON
*Transaction:* \`${result.txHash}\``, {
                    parse_mode: 'Markdown'
                });
            } else {
                await ctx.editMessageText(`❌ *Transfer Failed*

${result.error}

{{ ... }}
Please check the address and try again.`, {
                    parse_mode: 'Markdown'
                });
            }

        } catch (error) {
            this.monitoring.logError('Confirm transfer failed', error, { userId: ctx.from.id });
            await ctx.editMessageText('❌ Transfer failed. Please try again.');
        }
    }

    async handleRevealPrivateKey(ctx) {
        await ctx.answerCbQuery();
        const userId = ctx.match[1];
        
        try {
            // Security check
            if (parseInt(userId) !== ctx.from.id) {
                return ctx.reply('❌ Access denied.');
            }
            
            const user = await this.database.getUserByTelegramId(ctx.from.id);
            if (!user) {
                return ctx.reply('❌ No wallet found.');
            }

            const privateKey = this.walletManager.decrypt(user.encrypted_private_key);
            
            const message = await ctx.editMessageText(`🔑 *Private Key*

\`${privateKey}\`

⚠️ *KEEP THIS SECURE!*
_Never share your private key with anyone._

_This message will be deleted in 15 seconds._`, {
                parse_mode: 'Markdown'
            });

            // Auto-delete after 15 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage();
                } catch (error) {
                    // Silent error handling
                }
            }, 15000);
            
        } catch (error) {
            this.monitoring.logError('Reveal private key failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error revealing private key.');
        }
    }


    async handleTextMessage(ctx) {
        // Handle text messages based on user state
        const userId = ctx.from.id;
        const userState = await this.database.getUserState(userId);
        
        console.log(`🔍 DEBUG: Text message from user ${userId}`);
        console.log(`🔍 DEBUG: User state:`, userState);
        console.log(`🔍 DEBUG: Message text:`, ctx.message.text);
        
        if (!userState || userState.state === null) {
            console.log(`🔍 DEBUG: No valid user state, rejecting message`);
            await ctx.reply('Please use the menu buttons to interact with the bot.');
            return;
        }

        // Handle different states
        switch (userState.state) {
            case 'importing_wallet':
                await this.processWalletImport(ctx, ctx.message.text);
                break;
            case 'transfer_address':
                await ctx.reply('Transfer address handler coming soon!');
                break;
            case 'awaiting_token_address':
                await this.processTokenAddress(ctx, ctx.message.text);
                break;
            default:
                // Check if message looks like a token address for direct buy
                const messageText = ctx.message.text.trim();
                if (/^0x[a-fA-F0-9]{40}$/.test(messageText)) {
                    console.log(`🔍 DEBUG: Detected token address: ${messageText}`);
                    await this.processTokenAddress(ctx, messageText);
                } else {
                    await ctx.reply('Please use the menu buttons to interact with the bot.');
                }
        }
    }

    async processTokenAddress(ctx, tokenAddress) {
        try {
            const userId = ctx.from.id;
            
            // Validate token address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress.trim())) {
                await ctx.reply('❌ Invalid token address format. Please enter a valid contract address (0x...)');
                return;
            }

            const cleanAddress = tokenAddress.trim();
            
            // Verify token exists by getting token info
            const tokenInfo = await this.monorailAPI.getTokenInfo(cleanAddress);
            if (!tokenInfo.success) {
                await ctx.reply('❌ Token not found or invalid. Please check the contract address and try again.');
                return;
            }

            // Store token address in user state and ask for amount
            await this.database.setUserState(userId, 'awaiting_buy_amount', {
                tokenAddress: cleanAddress,
                tokenName: tokenInfo.token.name,
                tokenSymbol: tokenInfo.token.symbol
            });

            const buyAmountText = `💰 *Buy ${tokenInfo.token.name} (${tokenInfo.token.symbol})*

Select amount of MON to spend:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('0.1 MON', 'buy_amount_0.1'), Markup.button.callback('0.5 MON', 'buy_amount_0.5')],
                [Markup.button.callback('1 MON', 'buy_amount_1'), Markup.button.callback('5 MON', 'buy_amount_5')],
                [Markup.button.callback('10 MON', 'buy_amount_10'), Markup.button.callback('25 MON', 'buy_amount_25')],
                [Markup.button.callback('📝 Custom Amount', 'buy_amount_custom')],
                [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
            ]);

            await ctx.reply(buyAmountText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Process token address failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing token address. Please try again.');
        }
    }

    async processWalletImport(ctx, input) {
        try {
            const userId = ctx.from.id;
            
            // Delete the user's message for security
            try {
                await ctx.deleteMessage();
            } catch (error) {
                // Message might be too old to delete
            }
            
            // Validate input
            if (!input || input.trim().length < 10) {
                await ctx.reply('❌ Invalid input. Please provide a valid private key or mnemonic phrase.');
                return;
            }
            
            const trimmedInput = input.trim();
            let wallet;
            
            try {
                // Try to import as private key first
                if (trimmedInput.startsWith('0x') && trimmedInput.length === 66) {
                    wallet = await this.walletManager.importFromPrivateKey(trimmedInput);
                } 
                // Try as mnemonic phrase
                else if (trimmedInput.split(' ').length >= 12) {
                    wallet = await this.walletManager.importFromMnemonic(trimmedInput);
                } 
                else {
                    await ctx.reply('❌ Invalid format. Please provide either:\n• Private key (starts with 0x)\n• Mnemonic phrase (12+ words)');
                    return;
                }
                
                // Save wallet to database
                await this.database.createUser(
                    userId,
                    wallet.address,
                    wallet.encryptedPrivateKey,
                    wallet.encryptedMnemonic,
                    ctx.from.username || 'Unknown'
                );
                
                // Clear user state
                await this.database.clearUserState(userId);
                
                // Show success message by editing the import message
                const successText = `✅ *Wallet Imported Successfully!*

🧾 **Your Wallet Address:**
\`${wallet.address}\`

💼 **Balance:** Loading...

Welcome back to Area51! 🛸`;

                // Try to edit the import message instead of creating a new one
                try {
                    const importMessageState = await this.database.getUserState(userId, 'import_message_id');
                    if (importMessageState && importMessageState.messageId) {
                        // Edit the import message with success message
                        await ctx.telegram.editMessageText(
                            ctx.chat.id,
                            importMessageState.messageId,
                            null,
                            successText,
                            {
                                parse_mode: 'Markdown',
                                reply_markup: Markup.inlineKeyboard([
                                    [Markup.button.callback('🔄 Refresh Balance', 'refresh')],
                                    [Markup.button.callback('📊 View Portfolio', 'portfolio')],
                                    [Markup.button.callback('🔙 Main Menu', 'main')]
                                ]).reply_markup
                            }
                        );
                        
                        // Clear the import message ID state
                        await this.database.clearUserState(userId, 'import_message_id');
                    } else {
                        throw new Error('No import message to edit');
                    }
                } catch (editError) {
                    // Fallback to regular reply
                    await ctx.replyWithMarkdown(successText, 
                        Markup.inlineKeyboard([
                            [Markup.button.callback('🔄 Refresh Balance', 'refresh')],
                            [Markup.button.callback('📊 View Portfolio', 'portfolio')],
                            [Markup.button.callback('🔙 Main Menu', 'main')]
                        ])
                    );
                }
                
                this.monitoring.logInfo('Wallet imported successfully', { userId });
                
            } catch (walletError) {
                this.monitoring.logError('Wallet import failed', walletError, { userId });
                await ctx.reply('❌ Failed to import wallet. Please check your private key or mnemonic phrase and try again.');
            }
            
        } catch (error) {
            this.monitoring.logError('Process wallet import failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing wallet import. Please try again.');
        }
    }

    async showTokensByCategory(ctx, category, page = 1) {
        try {
            const user = await this.database.getUserByTelegramId(ctx.from.id);
            if (!user) {
                return ctx.reply('❌ Please start the bot first with /start');
            }

            const wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);
            const address = category === 'wallet' ? wallet.address : null;
            
            const result = await this.monorailAPI.getTokensByCategory(category, address);
            
            if (!result.success) {
                return ctx.reply('❌ Failed to fetch tokens. Please try again.');
            }

            // Filter out incomplete tokens
            const filteredTokens = result.tokens.filter(token => {
                // Exclude tokens with missing essential data
                if (!token.symbol || !token.name || token.symbol.length < 2) return false;
                
                // For wallet category, only show tokens with balance > 0
                if (category === 'wallet') {
                    const balance = parseFloat(token.balance || '0');
                    return balance > 0.000001; // Minimum threshold
                }
                
                // For other categories, ensure price data exists
                const hasPrice = token.usd_per_token && parseFloat(token.usd_per_token) > 0;
                const hasConfidence = token.pconf && parseFloat(token.pconf) >= 50; // Minimum 50% confidence
                
                return hasPrice || hasConfidence;
            });

            if (filteredTokens.length === 0) {
                const emptyMessages = {
                    wallet: '👛 *Your wallet is empty*\n\n💡 Start by buying some tokens to see them here!',
                    verified: '🔍 *No verified tokens available*\n\n⏳ Tokens are being updated...',
                    stable: '💰 *No stablecoins found*\n\n🔄 Market data refreshing...',
                    default: `📭 *No tokens found in ${category}*\n\n🔄 Try refreshing or check other categories`
                };
                return ctx.reply(emptyMessages[category] || emptyMessages.default, { parse_mode: 'Markdown' });
            }

            const categoryNames = {
                verified: '✅ **Verified Tokens**',
                stable: '💵 **Stablecoins**',
                bridged: '🌐 **Bridged Assets**',
                meme: '🐸 **Meme Coins**',
                lst: '🥩 **Liquid Staking Tokens**',
                wallet: '👛 **Your Holdings**'
            };

            const tokensPerPage = 8;
            const totalPages = Math.ceil(filteredTokens.length / tokensPerPage);
            const startIndex = (page - 1) * tokensPerPage;
            const endIndex = startIndex + tokensPerPage;
            const tokensToShow = filteredTokens.slice(startIndex, endIndex);

            let message = `${categoryNames[category] || category.toUpperCase()}\n\n`;
            message += `📊 *Found ${filteredTokens.length} tokens*\n`;
            if (totalPages > 1) {
                message += `📄 *Page ${page} of ${totalPages}*\n`;
            }
            message += `\n`;

            const pairedButtons = [];
            for (let i = 0; i < tokensToShow.length; i += 2) {
                const token1 = tokensToShow[i];
                const token2 = tokensToShow[i + 1];
                
                const row = [Markup.button.callback(
                    `${token1.symbol}`,
                    `buy_token_${token1.address}`
                )];
                
                if (token2) {
                    row.push(Markup.button.callback(
                        `${token2.symbol}`,
                        `buy_token_${token2.address}`
                    ));
                }
                
                pairedButtons.push(row);
            }

            // Pagination buttons
            if (totalPages > 1) {
                const paginationRow = [];
                if (page > 1) {
                    paginationRow.push(Markup.button.callback('⬅️ Previous', `category_${category}_page_${page - 1}`));
                }
                if (page < totalPages) {
                    paginationRow.push(Markup.button.callback('Next ➡️', `category_${category}_page_${page + 1}`));
                }
                if (paginationRow.length > 0) {
                    pairedButtons.push(paginationRow);
                }
            }
            
            // Navigation buttons
            pairedButtons.push([Markup.button.callback('🔄 Refresh', `category_${category}`)]);
            pairedButtons.push([Markup.button.callback('🔙 Categories', 'token_categories'), Markup.button.callback('🏠 Main Menu', 'main')]);
            
            const keyboard = Markup.inlineKeyboard(pairedButtons);
            
            try {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (error) {
                await ctx.replyWithMarkdown(message, keyboard);
            }
            
        } catch (error) {
            this.monitoring.logError('Show tokens by category failed', error, { userId: ctx.from.id, category });
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    }

    async trackUserActivity(userId) {
        try {
            if (this.redis) {
                const key = `activity:${userId}`;
                await this.redis.setEx(key, 3600, Date.now().toString()); // 1 hour expiry
            }
        } catch (error) {
            this.monitoring.logError('User activity tracking failed', error, { userId });
        }
    }

    async getActiveUserCount() {
        try {
            if (this.redis) {
                const keys = await this.redis.keys('activity:*');
                return keys.length;
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    async updateMetrics() {
        try {
            const activeUsers = await this.getActiveUserCount();
            const totalUsers = await this.database.getUserCount();
            
            this.monitoring.updateUserMetrics(activeUsers, totalUsers);
            
            // Update database connection metrics
            const dbStats = await this.database.getConnectionStats();
            this.monitoring.updateDatabaseConnections(dbStats.active);
            
        } catch (error) {
            this.monitoring.logError('Metrics update failed', error);
        }
    }

    async gracefulShutdown() {
        this.monitoring.logInfo('Starting graceful shutdown');
        
        try {
            // Stop accepting new updates
            this.bot.stop();
            
            // Close health check server
            this.healthServer.stop();
            
            // Close database connections
            await this.database.close();
            
            // Close Redis connection
            await this.redis.quit();
            
            // Shutdown monitoring
            await this.monitoring.shutdown();
            
            this.monitoring.logInfo('Graceful shutdown completed');
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }

    async start() {
        try {
            // Wait for initialization to complete
            await this.init();
            
            // Start metrics collection
            setInterval(() => {
                this.updateMetrics();
            }, 60000); // Every minute
            
            // Start the bot
            await this.bot.launch();
            this.monitoring.logInfo('Area51 Bot started successfully');
            
            // Handle graceful shutdown
            process.once('SIGINT', () => this.gracefulShutdown());
            process.once('SIGTERM', () => this.gracefulShutdown());
            
        } catch (error) {
            this.monitoring.logError('Bot startup failed', error);
            throw error;
        }
    }

    async handleSellFromPortfolio(ctx) {
        const userId = ctx.from.id;
        const tokenSymbol = ctx.match[1];
        
        try {
            await ctx.answerCbQuery(`💸 Selling ${tokenSymbol}...`);
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('⚠️ Please create a wallet first using /start');
                return;
            }

            // Get token info from portfolio
            const portfolioTokens = await this.monorailAPI.getWalletBalance(user.wallet_address);
            const token = portfolioTokens.find(t => t.symbol === tokenSymbol);
            
            if (!token) {
                await ctx.reply(`⚠️ Token ${tokenSymbol} not found in your portfolio`);
                return;
            }

            // Store token info for selling
            await this.database.setUserState(userId, 'selling_token', {
                symbol: token.symbol,
                address: token.address,
                balance: token.balance,
                name: token.name
            });

            const sellText = `💸 **Sell ${token.name} (${token.symbol})**

📊 **Token Info:**
• Balance: ${parseFloat(token.balance).toFixed(6)} ${token.symbol}
• Current Price: ${parseFloat(token.mon_per_token).toFixed(6)} MON (~$${parseFloat(token.usd_per_token).toFixed(2)})
• Total Value: ${parseFloat(token.mon_value).toFixed(6)} MON

🎯 **Select percentage to sell:**`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('25%', `sell_percentage_${tokenSymbol}_25`), Markup.button.callback('50%', `sell_percentage_${tokenSymbol}_50`)],
                [Markup.button.callback('75%', `sell_percentage_${tokenSymbol}_75`), Markup.button.callback('100%', `sell_percentage_${tokenSymbol}_100`)],
                [Markup.button.callback('📝 Custom %', `sell_custom_${tokenSymbol}`)],
                [Markup.button.callback('🔙 Back to Portfolio', 'portfolio')]
            ]);

            await ctx.editMessageText(sellText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Sell from portfolio failed', error, { userId, tokenSymbol });
            await ctx.reply('⚠️ Failed to load sell interface. Please try again.');
        }
    }

    async handleSellPercentageSelection(ctx) {
        const userId = ctx.from.id;
        const tokenSymbol = ctx.match[1];
        const percentage = parseInt(ctx.match[2]);
        
        try {
            await ctx.answerCbQuery(`💸 Selling ${percentage}% of ${tokenSymbol}...`);
            
            // Get stored token info
            const userState = await this.database.getUserState(userId);
            const tokenInfo = userState?.selling_token;
            
            console.log(`🔍 DEBUG: User state:`, userState);
            console.log(`🔍 DEBUG: Token info:`, tokenInfo);
            console.log(`🔍 DEBUG: Looking for symbol:`, tokenSymbol);
            console.log(`🔍 DEBUG: Button callback data:`, ctx.callbackQuery?.data);
            
            // Fix: Access the data property correctly
            const actualTokenInfo = userState?.data || tokenInfo;
            
            if (!actualTokenInfo || actualTokenInfo.symbol !== tokenSymbol) {
                console.log(`❌ DEBUG: Token info mismatch - stored: ${actualTokenInfo?.symbol}, requested: ${tokenSymbol}`);
                await ctx.reply(`⚠️ Token information not found. Stored: ${actualTokenInfo?.symbol || 'none'}, Requested: ${tokenSymbol}. Please try again.`);
                return;
            }
            
            // Use the correct token info
            const tokenInfoToUse = actualTokenInfo;

            const balance = parseFloat(tokenInfoToUse.balance);
            const sellAmount = (balance * percentage) / 100;
            
            // Calculate estimated MON output
            const monValue = parseFloat(tokenInfoToUse.mon_value || '0');
            const estimatedMON = (monValue * percentage) / 100;
            
            const confirmText = `💸 **Confirm Sale**

🪙 **Token:** ${tokenInfoToUse.name} (${tokenSymbol})
📊 **Selling:** ${sellAmount.toFixed(6)} ${tokenSymbol} (${percentage}%)
💰 **Expected MON:** ~${estimatedMON.toFixed(6)} MON

⚠️ **This action cannot be undone!**

Proceed with the sale?`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirm Sale', `confirm_portfolio_sell_${tokenSymbol}_${percentage}`)],
                [Markup.button.callback('❌ Cancel', 'portfolio')],
                [Markup.button.callback('🔙 Back', `sell_${tokenSymbol}`)]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Sell percentage selection failed', error, { userId, tokenSymbol, percentage });
            await ctx.reply('⚠️ Failed to process selection. Please try again.');
        }
    }

    async handleCustomSellPercentage(ctx) {
        const userId = ctx.from.id;
        const tokenSymbol = ctx.match[1];
        
        try {
            await ctx.answerCbQuery('📝 Enter custom percentage...');
            
            await this.database.setUserState(userId, 'awaiting_custom_sell_percentage', {
                tokenSymbol: tokenSymbol
            });

            const customText = `📝 **Custom Sell Percentage**

Enter the percentage you want to sell (1-100):

Example: 33.5 for 33.5%`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel', `sell_${tokenSymbol}`)]
            ]);

            await ctx.editMessageText(customText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Custom sell percentage failed', error, { userId, tokenSymbol });
            await ctx.reply('⚠️ Failed to load custom percentage input. Please try again.');
        }
    }

    async handleConfirmPortfolioSell(ctx) {
        try {
            console.log(`🔍 DEBUG: handleConfirmPortfolioSell called with data:`, ctx.callbackQuery?.data);
            console.log(`🔍 DEBUG: Match groups:`, ctx.match);
            
            await ctx.answerCbQuery('🔄 Processing sale...');
            const userId = ctx.from.id;
            const tokenSymbol = ctx.match[1];
            const percentage = parseInt(ctx.match[2]);
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            // Get stored token info - fix the data access issue
            const userState = await this.database.getUserState(userId);
            console.log(`🔍 DEBUG: Full user state:`, userState);
            
            // The token info is stored in userState.data, not userState.selling_token
            const tokenInfo = userState?.data;
            console.log(`🔍 DEBUG: Retrieved token info:`, tokenInfo);
            
            if (!tokenInfo || tokenInfo.symbol !== tokenSymbol) {
                console.log(`❌ DEBUG: Token mismatch - stored: ${tokenInfo?.symbol}, requested: ${tokenSymbol}`);
                await ctx.reply('⚠️ Token information not found. Please try again.');
                return;
            }

            const balance = parseFloat(tokenInfo.balance);
            let sellAmount = (balance * percentage) / 100;
            
            // Apply 99.99% buffer to prevent floating-point precision errors
            // This ensures we never try to sell more than we actually have
            if (percentage === 100) {
                sellAmount = balance * 0.9999; // 99.99% of balance for 100% sells
                console.log(`🔧 Applied 99.99% buffer: ${balance} -> ${sellAmount}`);
            }

            // Show processing message - escape special characters
            const sanitizedTokenName = tokenInfo.name.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
            const processingText = `🔄 Processing Sale...

🪙 Token: ${sanitizedTokenName} (${tokenSymbol})
📊 Selling: ${sellAmount.toFixed(6)} ${tokenSymbol} (${percentage}%)

⏳ Please wait while we process your transaction...`;

            await ctx.editMessageText(processingText, {
                parse_mode: 'Markdown'
            });

            // Execute the sell transaction - use token address, not symbol
            const result = await this.tradingEngine.sellToken(
                user.wallet_address,
                tokenInfo.address,
                sellAmount.toString()
            );

            if (result.success) {
                await ctx.editMessageText(`[✅ Sale Completed!](${result.explorerUrl || '#'})`, {
                    parse_mode: 'Markdown'
                });

                // Clear user state and portfolio cache after successful sell
                await this.database.clearUserState(userId);
                await this.portfolioService.clearUserPortfolioCache(userId);
                
                // Also clear the general user cache to force fresh data
                if (this.redis) {
                    await this.redis.del(`user:${userId}`);
                    await this.redis.del(`balance:${userId}`);
                    console.log(`🗑️ Invalidated user cache for user ${userId}`);
                }

            } else {
                // Force refresh portfolio data after failed transaction to get accurate balances
                await this.portfolioService.clearUserPortfolioCache(userId);
                if (this.redis) {
                    await this.redis.del(`balance:${userId}`);
                    console.log(`🔄 Forced portfolio refresh after failed transaction`);
                }
                
                // Escape special characters in error message to prevent Telegram parsing errors
                const sanitizedError = (result.error || 'Unknown error occurred')
                    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
                const sanitizedTokenName = tokenInfo.name.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
                
                const errorText = `❌ Sale Failed

🪙 Token: ${sanitizedTokenName} (${tokenSymbol})
📊 Amount: ${sellAmount.toFixed(6)} ${tokenSymbol}

Error: ${sanitizedError}

Please try again or contact support if the issue persists.`;

                await ctx.editMessageText(errorText);
            }

        } catch (error) {
            this.monitoring.logError('Confirm portfolio sell failed', error, { 
                userId: ctx.from.id, 
                tokenSymbol: ctx.match[1], 
                percentage: ctx.match[2] 
            });
            
            const errorText = `❌ **Transaction Error**

An unexpected error occurred while processing your sale. Please try again.

If the problem persists, please contact support.`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('🔙 Main Menu', 'main')]
            ]);

            await ctx.editMessageText(errorText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        }
    }

    async handleNewPortfolio(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(
                userId, 
                user.wallet_address, 
                1, // page 1
                false // don't force refresh
            );

            await ctx.editMessageText(portfolioDisplay.text, {
                parse_mode: 'Markdown',
                reply_markup: portfolioDisplay.keyboard
            });

        } catch (error) {
            this.monitoring.logError('New portfolio display failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading portfolio. Please try again.');
        }
    }

    async handlePortfolioPage(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const page = parseInt(ctx.match[1]);
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(
                userId, 
                user.wallet_address, 
                page, 
                false // don't force refresh
            );

            await ctx.editMessageText(portfolioDisplay.text, {
                parse_mode: 'Markdown',
                reply_markup: portfolioDisplay.keyboard
            });

        } catch (error) {
            this.monitoring.logError('Portfolio page navigation failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading portfolio page. Please try again.');
        }
    }

    async handlePortfolioRefresh(ctx) {
        try {
            await ctx.answerCbQuery('🔄 Refreshing portfolio...');
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            // Force refresh from API
            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(
                userId, 
                user.wallet_address, 
                1, // reset to page 1
                true // force refresh
            );

            await ctx.editMessageText(portfolioDisplay.text, {
                parse_mode: 'Markdown',
                reply_markup: portfolioDisplay.keyboard
            });

        } catch (error) {
            this.monitoring.logError('Portfolio refresh failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error refreshing portfolio. Please try again.');
        }
    }

    async handlePortfolioMore(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            // Get full portfolio data
            const portfolio = await this.portfolioManager.getPortfolio(user.wallet_address);
            
            // Filter tokens with meaningful balance (>= 0.01 MON value) and exclude MON
            const significantTokens = portfolio.filter(token => {
                const monValue = parseFloat(token.mon_value || '0');
                return monValue >= 0.01 && token.symbol !== 'MON';
            });

            if (significantTokens.length === 0) {
                await ctx.editMessageText(
                    `📊 **Full Portfolio**\n\n_No tokens with significant value found._\n\n💡 _Tokens must have a value ≥ 0.01 MON to be displayed._`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('🔄 Refresh', 'refresh')],
                            [Markup.button.callback('🔙 Back', 'main')]
                        ]).reply_markup
                    }
                );
                return;
            }

            // Sort by MON value (highest first)
            significantTokens.sort((a, b) => parseFloat(b.mon_value || '0') - parseFloat(a.mon_value || '0'));

            let portfolioText = `📊 **Complete Portfolio**\n\n`;
            
            // Show all tokens
            significantTokens.forEach((token, index) => {
                const balance = parseFloat(token.balanceFormatted || '0');
                const priceUSD = parseFloat(token.priceUSD || '0');
                const monValue = parseFloat(token.mon_value || '0');
                
                portfolioText += `**${index + 1}. ${token.name || token.symbol}** _(${token.symbol})_\n`;
                portfolioText += `💰 Balance: **${balance.toFixed(6)}**\n`;
                portfolioText += `💵 Price: **$${priceUSD.toFixed(6)}**\n`;
                portfolioText += `🏦 Value: **${monValue.toFixed(4)} MON**\n\n`;
            });

            // Calculate total portfolio value
            const totalValue = significantTokens.reduce((sum, token) => {
                return sum + parseFloat(token.mon_value || '0');
            }, 0);

            portfolioText += `**📈 Total Portfolio Value: ${totalValue.toFixed(4)} MON**`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh Portfolio', 'refresh')],
                [Markup.button.callback('🔙 Back to Summary', 'main')]
            ]);

            await ctx.editMessageText(portfolioText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Portfolio more display failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading full portfolio. Please try again.');
        }
    }

    async handleSellFromNewPortfolio(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const tokenSymbol = ctx.match[1];
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            // Get token info from portfolio with force refresh to ensure latest data
            const tokens = await this.portfolioService.getUserPortfolio(userId, user.wallet_address, true);
            const token = tokens.find(t => t.symbol === tokenSymbol);
            
            console.log(`🔍 DEBUG: Looking for token ${tokenSymbol} in portfolio`);
            console.log(`🔍 DEBUG: Available tokens:`, tokens.map(t => ({ symbol: t.symbol, balance: t.balance })));
            
            if (!token) {
                console.log(`❌ DEBUG: Token ${tokenSymbol} not found in portfolio of ${tokens.length} tokens`);
                await ctx.reply(`❌ Token ${tokenSymbol} not found in your portfolio. Available tokens: ${tokens.map(t => t.symbol).join(', ')}`);
                return;
            }

            // Store token info for sell process - include address for trading
            await this.database.setUserState(userId, 'selling_token', {
                symbol: token.symbol,
                name: token.name,
                balance: token.balance,
                mon_value: token.mon_value,
                address: token.address
            });

            const balance = parseFloat(token.balance || '0');
            const monValue = parseFloat(token.mon_value || '0');

            const sellText = `💸 **Sell ${tokenSymbol}**

🪙 **Token:** ${token.name} (${tokenSymbol})
💰 **Balance:** \`${balance.toFixed(6)}\`
🏦 **Value:** \`${monValue.toFixed(4)} MON\`

**Choose sell percentage:**`;

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('25%', `sell_percentage_${tokenSymbol}_25`),
                    Markup.button.callback('50%', `sell_percentage_${tokenSymbol}_50`)
                ],
                [
                    Markup.button.callback('75%', `sell_percentage_${tokenSymbol}_75`),
                    Markup.button.callback('100%', `sell_percentage_${tokenSymbol}_100`)
                ],
                [Markup.button.callback('📝 Custom %', `sell_custom_${tokenSymbol}`)],
                [Markup.button.callback('🔙 Back to Portfolio', 'portfolio')]
            ]);

            await ctx.editMessageText(sellText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Sell from new portfolio failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing sell request. Please try again.');
        }
    }

    async initializeMonPriceCache() {
        // Initialize MON price caching with 5-minute intervals
        try {
            await this.updateMonPrice();
            
            // Set up periodic updates every 5 minutes
            setInterval(async () => {
                try {
                    await this.updateMonPrice();
                } catch (error) {
                    this.monitoring.logError('Periodic MON price update failed', error);
                }
            }, 5 * 60 * 1000); // 5 minutes

            this.monitoring.logInfo('MON price caching initialized');
        } catch (error) {
            this.monitoring.logError('MON price cache initialization failed', error);
        }
    }

    async updateMonPrice() {
        try {
            // Fetch MON price using the new simplified API
            const response = await this.monorailAPI.getMONPriceUSD();
            
            if (response && response.price) {
                const monPrice = parseFloat(response.price);
                
                // Price is already cached by getMONPriceUSD method
                this.monitoring.logInfo('MON price updated in cache', { price: monPrice });
                
                return monPrice;
            } else {
                throw new Error('Invalid MON price response');
            }
        } catch (error) {
            this.monitoring.logError('MON price update failed', error);
            
            // Return cached price if available, otherwise fallback
            if (this.redis) {
                const cachedPrice = await this.redis.get('mon_price_usd');
                if (cachedPrice) {
                    return parseFloat(cachedPrice);
                }
            }
            
            // Fallback price
            return 3.25;
        }
    }

    async getMonPrice() {
        try {
            // Try to get from cache first
            if (this.redis) {
                const cachedPrice = await this.redis.get('mon_price_usd');
                if (cachedPrice) {
                    return parseFloat(cachedPrice);
                }
            }
            
            // If not cached, fetch and cache
            return await this.updateMonPrice();
        } catch (error) {
            this.monitoring.logError('Get MON price failed', error);
            return 3.25; // Fallback price
        }
    }
}

// Export for cluster usage
module.exports = Area51BotScalable;

// Start bot if this file is run directly
if (require.main === module) {
    const bot = new Area51BotScalable();
    bot.start().catch(console.error);
}
