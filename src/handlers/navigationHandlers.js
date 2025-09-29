// Navigation and UI Handlers
const { Markup } = require('telegraf');
const InterfaceUtils = require('../utils/interfaceUtils');
const FreshDataFetcher = require("../utils/freshDataFetcher");
class NavigationHandlers {
    constructor(bot, database, monorailAPI, monitoring, redis = null, walletManager = null, mainBot = null, cacheService = null, accessCodeSystem = null, welcomeHandler = null) {
        this.bot = bot;
        this.database = database;
        this.monorailAPI = monorailAPI;
        this.monitoring = monitoring;
        this.redis = redis;
        this.walletManager = walletManager;
        this.mainBot = mainBot; // Reference to main bot instance
        this.cacheService = cacheService;
        this.accessCodeSystem = accessCodeSystem;
        this.welcomeHandler = welcomeHandler;
    }
    setupHandlers() {
        // Start command
        this.bot.start(async (ctx) => {
            await this.handleStart(ctx);
        });
        // Main navigation handlers
        this.bot.action('start', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStart(ctx);
        });
        this.bot.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleBackToMainWithDebug(ctx);
        });
        this.bot.action('main', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleBackToMainWithDebug(ctx);
        });
        // Categories handlers
        this.bot.action('token_categories', async (ctx) => {
            await this.showTokenCategories(ctx);
        });
        this.bot.action(/^category_(.+?)(?:_page_(\d+))?$/, async (ctx) => {
            await this.handleTokenCategory(ctx);
        });
        // Settings handlers removed - using updated versions from index-modular-simple.js
        // Old settings handlers removed - using updated versions from index-modular-simple.js
        // Manual refresh handler
        this.bot.action('refresh', async (ctx) => {
            await this.handleManualRefresh(ctx);
        });
        // Transfer handler
        this.bot.action('transfer', async (ctx) => {
            await this.handleTransfer(ctx);
        });
        // Text message handler
        this.bot.on('text', async (ctx) => {
            await this.handleTextMessage(ctx);
        });

        // Refresh sell interface handler
        this.bot.action(/^refresh_sell_(.+)$/, async (ctx) => {
            const tokenAddress = ctx.match[1];
            await this.handleRefreshSell(ctx, tokenAddress);
        });
    }
    async handleStart(ctx) {
        const userId = ctx.from.id;
        try {
            // Check if user needs access code
            if (ctx.needsAccessCode) {
                // Show access prompt from the access handler
                if (this.mainBot && this.mainBot.accessHandler) {
                    await this.mainBot.accessHandler.showAccessPrompt(ctx);
                    return;
                }
            }
            
            // User has access - proceed with normal flow
            // Check cache first for existing user using unified cache system
            let user = null;
            let fromCache = false;
            if (this.cacheService) {
                try {
                    // Try cache first
                    user = await this.cacheService.get('user', userId);
                    if (user) {
                        fromCache = true;
                        this.monitoring.logInfo('User data loaded from unified cache', { userId, fromCache: true });
                    } else {
                        // Not in cache, get from database and cache it
                        user = await this.database.getUserByTelegramId(userId);
                        if (user) {
                            await this.cacheService.set('user', userId, user);
                        }
                    }
                } catch (cacheError) {
                    this.monitoring.logError('Unified cache operation failed during start', cacheError, { userId });
                    // Fallback to database
                    user = await this.database.getUserByTelegramId(userId);
                }
            } else {
                // Fallback to database if no cache service
                user = await this.database.getUserByTelegramId(userId);
            }
            // Create session
            if (this.sessionManager) {
                await this.sessionManager.createSession(userId, {
                    username: ctx.from.username,
                    firstName: ctx.from.first_name
                });
            }
            // Clear user state only from cache (faster than DB)
            if (this.cacheService) {
                try {
                    await this.cacheService.clearUserState(userId);
                } catch (cacheError) {
                    this.monitoring.logError('Failed to clear user state from cache', cacheError, { userId });
                }
            } else if (this.redis) {
                try {
                    await this.redis.del(`area51:user_state:${userId}`);
                } catch (redisError) {
                    this.monitoring.logError('Failed to clear user state from Redis', redisError, { userId });
                }
            }
            if (!user || !user.wallet_address || user.wallet_address === 'pending_wallet_creation') {
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
        const { text, keyboard } = InterfaceUtils.generateNewUserInterface();
        await ctx.replyWithMarkdown(text, keyboard);
    }
    /**
     * Get main menu data with optimized caching (shared logic)
     */
    async getMainMenuData(ctx, fromCache = false, forceRefresh = false) {
        const userId = ctx.from.id;
        // Check for cached main menu data first (5 minutes TTL) - skip if forceRefresh
        let cachedData = null;
        if (this.cacheService && !forceRefresh) {
            try {
                cachedData = await this.cacheService.get('main_menu', userId);
                if (cachedData) {
                    this.monitoring.logInfo('🚀 Main menu cache HIT', { userId });
                    const { text, keyboard } = InterfaceUtils.generateMainInterface(
                        cachedData.user, cachedData.monBalance, cachedData.monPriceUSD, cachedData.portfolioValueUSD
                    );
                    return { text, keyboard };
                }
            } catch (cacheError) {
                this.monitoring.logError('Main menu cache read failed', cacheError, { userId });
            }
        }
        // Get user from cache first
        let user;
        if (this.cacheService) {
            user = await this.cacheService.get('user', userId,
                async () => await this.database.getUserByTelegramId(userId)
            );
        } else {
            user = await this.database.getUserByTelegramId(userId);
        }
        if (!user) {
            throw new Error('User not found');
        }
        // Try to get data from cache first, with fallback values
        let monBalanceData = { balance: '0', balanceFormatted: '0', priceUSD: '0' };
        let portfolioValueData = { value: '0' };
        let monPriceData = { price: '0' };
        // Declare cache variables outside try block
        let cachedBalance = null;
        let cachedPortfolio = null;
        let cachedPrice = null;
        // Check individual caches first
        if (this.cacheService) {
            try {
                [cachedBalance, cachedPortfolio, cachedPrice] = await Promise.all([
                    this.cacheService.get('wallet_balance', user.wallet_address),
                    this.cacheService.get('portfolio', user.wallet_address),
                    this.cacheService.get('mon_price_usd', 'global')
                ]);
                this.monitoring.logInfo('🔍 Cache check results', { 
                    userId,
                    hasBalance: !!cachedBalance,
                    hasPortfolio: !!cachedPortfolio,
                    hasPrice: !!cachedPrice
                });
                if (cachedBalance) {
                    let balanceData;
                    try {
                        // Handle both string and object formats
                        balanceData = typeof cachedBalance === 'string' 
                            ? JSON.parse(cachedBalance) 
                            : cachedBalance;
                        // Ensure balanceData is an array
                        if (!Array.isArray(balanceData)) {
                            balanceData = [];
                        }
                    } catch (parseError) {
                        balanceData = [];
                    }
                    const monToken = balanceData.find(token => 
                        token.address === '0x0000000000000000000000000000000000000000' || 
                        token.symbol === 'MON'
                    );
                    if (monToken) {
                        monBalanceData = {
                            balance: monToken.balance || '0',
                            balanceFormatted: monToken.balanceFormatted || monToken.balance || '0',
                            priceUSD: monToken.usd_per_token || monToken.priceUSD || '0'
                        };
                    }
                }
                if (cachedPortfolio) {
                    portfolioValueData = JSON.parse(cachedPortfolio);
                }
                if (cachedPrice) {
                    try {
                        // Handle both string and object formats
                        monPriceData = typeof cachedPrice === 'string' 
                            ? JSON.parse(cachedPrice) 
                            : cachedPrice;
                    } catch (parseError) {
                        monPriceData = { price: '0' };
                    }
                }
            } catch (error) {
                // Reset cache variables on error
                cachedBalance = null;
                cachedPortfolio = null;
                cachedPrice = null;
            }
        }
        // Only call API if no cached data found (check for null/undefined, not '0' values)
        const needsBalance = !cachedBalance;
        const needsPortfolio = !cachedPortfolio;
        const needsPrice = !cachedPrice;
        if (needsBalance || needsPortfolio || needsPrice) {
            this.monitoring.logInfo('📡 Fetching missing data from API', { 
                userId, 
                needsBalance, 
                needsPortfolio, 
                needsPrice 
            });
            const [apiBalance, apiPortfolio, apiPrice] = await Promise.all([
                needsBalance ? this.monorailAPI.getMONBalance(user.wallet_address, true) : Promise.resolve(monBalanceData),
                needsPortfolio ? this.monorailAPI.getPortfolioValue(user.wallet_address, true) : Promise.resolve(portfolioValueData),
                needsPrice ? this.monorailAPI.getMONPriceUSD(false) : Promise.resolve(monPriceData) // Use cache (price updates hourly)
            ]);
            if (needsBalance) monBalanceData = apiBalance;
            if (needsPortfolio) portfolioValueData = apiPortfolio;
            if (needsPrice) monPriceData = apiPrice;
        } else {
            this.monitoring.logInfo('🚀 All data available from cache', { userId });
        }
        const monBalance = parseFloat(monBalanceData.balance || '0');
        const monPriceUSD = parseFloat(monPriceData.price || '0');
        const portfolioValueUSD = parseFloat(portfolioValueData.value || '0');
        const portfolioValueMON = monPriceUSD > 0 ? portfolioValueUSD / monPriceUSD : 0;
        const monValueUSD = monBalance * monPriceUSD;
        // Cache the data for 5 minutes for faster access (shorter than price data for balance updates)
        if (this.cacheService && !forceRefresh) {
            try {
                const dataToCache = { monBalance, monPriceUSD, portfolioValueUSD, portfolioValueMON, monValueUSD, user };
                await this.cacheService.set('main_menu', userId, dataToCache, 300);
                this.monitoring.logInfo('💾 Main menu data cached', { userId, ttl: 300 });
            } catch (redisError) {
                this.monitoring.logError('Main menu cache write failed', redisError, { userId });
            }
        }
        const { text, keyboard } = InterfaceUtils.generateMainInterface(
            user, monBalance, monPriceUSD, portfolioValueUSD
        );
        return { text, keyboard };
    }
    async showWelcome(ctx, fromCache = false, forceRefresh = false) {
        const userId = ctx.from.id;
        try {
            const { text, keyboard } = await this.getMainMenuData(ctx, fromCache, forceRefresh);
            await ctx.replyWithMarkdown(text, keyboard);
        } catch (error) {
            this.monitoring.logError('Show welcome failed', error, { userId });
            await ctx.reply('❌ Error loading main menu. Please try again.');
        }
    }
    async handleBackToMainWithDebug(ctx) {
        const userId = ctx.from.id;
        try {
            // Use the same optimized cache logic as showWelcome for consistency and speed
            const { text, keyboard } = await this.getMainMenuData(ctx, false, false);
            try {
                if (ctx.callbackQuery) {
                    await ctx.editMessageText(text, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    });
                } else {
                    await ctx.replyWithMarkdown(text, keyboard);
                }
            } catch (error) {
                await ctx.replyWithMarkdown(text, keyboard);
            }
        } catch (error) {
            this.monitoring.logError('Back to main failed', error, { userId });
            await ctx.reply('❌ Error loading main menu. Please try again.');
        }
    }
    async showTokenCategories(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
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
    async handleTokenCategory(ctx) {
        await ctx.answerCbQuery();
        const match = ctx.match[1];
        const page = parseInt(ctx.match[2]) || 1;
        try {
            const category = match;
            const tokensPerPage = 8;
            // Get real tokens from Monorail API with caching
            const result = await this.monorailAPI.getTokensByCategory(category);
            let tokens = [];
            if (result.success && result.tokens) {
                tokens = result.tokens;
            } else {
                // Fallback to trending tokens if category fails
                const trendingResult = await this.monorailAPI.getTokensByCategory('trending');
                if (trendingResult.success && trendingResult.tokens) {
                    tokens = trendingResult.tokens;
                }
            }
            const totalPages = Math.ceil(tokens.length / tokensPerPage);
            const startIndex = (page - 1) * tokensPerPage;
            const endIndex = startIndex + tokensPerPage;
            const pageTokens = tokens.slice(startIndex, endIndex);
            if (pageTokens.length === 0) {
                await ctx.editMessageText(`🏷️ *${category.charAt(0).toUpperCase() + category.slice(1)} Tokens*\n\n_No tokens found in this category._`, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Categories', 'token_categories')]
                    ]).reply_markup
                });
                return;
            }
            const categoryNames = {
                verified: '✅ *Verified Tokens*',
                stable: '💵 *Stablecoins*',
                bridged: '🌐 *Bridged Assets*',
                meme: '🐸 *Meme Coins*',
                lst: '🥩 *Liquid Staking Tokens*'
            };
            let categoryText = `${categoryNames[category] || category.toUpperCase()}\n\n`;
            categoryText += `📊 *Found ${tokens.length} tokens*\n`;
            if (totalPages > 1) {
                categoryText += `📄 *Page ${page} of ${totalPages}*\n`;
            }
            categoryText += `\n`;
            const buttons = [];
            // Add token buttons in pairs - just symbol names
            for (let i = 0; i < pageTokens.length; i += 2) {
                const row = [];
                if (pageTokens[i] && pageTokens[i].address) {
                    row.push(Markup.button.callback(
                        `${pageTokens[i].symbol || 'Token'}`, 
                        `buy_token_${pageTokens[i].address}`
                    ));
                }
                if (i + 1 < pageTokens.length && pageTokens[i + 1] && pageTokens[i + 1].address) {
                    row.push(Markup.button.callback(
                        `${pageTokens[i + 1].symbol || 'Token'}`, 
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
                    navButtons.push(Markup.button.callback('⬅️ Previous', `category_${category}_page_${page - 1}`));
                }
                if (page < totalPages) {
                    navButtons.push(Markup.button.callback('Next ➡️', `category_${category}_page_${page + 1}`));
                }
                if (navButtons.length > 0) {
                    buttons.push(navButtons);
                }
            }
            // Navigation buttons
            buttons.push([Markup.button.callback('🔄 Refresh', `category_${category}`)]);
            buttons.push([Markup.button.callback('🔙 Categories', 'token_categories'), Markup.button.callback('🏠 Main Menu', 'main')]);
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
    // showSettings method removed - using the updated version from index-modular-simple.js
    async handleTransfer(ctx) {
        const userId = ctx.from.id;
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            // Check if user exists
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }
            // Get current MON balance
            const currentBalanceData = await this.monorailAPI.getMONBalance(user.wallet_address);
            const currentBalance = parseFloat(currentBalanceData.balance || '0');
            const transferText = `📤 *Transfer MON*

💼 **Your Balance:** *${currentBalance.toFixed(4)} MON*

Please enter the recipient address:
**Example:** \`0x1234567890123456789012345678901234567890\``;
            const transferOptions = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏠 Back to Main', callback_data: 'main' }]
                    ]
                }
            };
            if (ctx.callbackQuery) {
                // For buttons - edit existing message
                try {
                    await ctx.editMessageText(transferText, transferOptions);
                } catch (error) {
                    // Fallback if edit fails
                    await ctx.reply(transferText, transferOptions);
                }
            } else {
                // For commands - send new message
                await ctx.reply(transferText, transferOptions);
            }
            // Set user state to await address
            await this.database.setUserState(userId, 'awaiting_transfer_address');
        } catch (error) {
            this.monitoring.logError('Transfer handler failed', error, { userId });
            await ctx.reply('❌ Error starting transfer. Please try again.');
        }
    }
    // showDocs function removed - now using direct URL button
    async handleTextMessage(ctx) {
        const userId = ctx.from.id;
        const userState = await this.database.getUserState(userId);
        // Check for token addresses ONLY if user is NOT in importing_wallet state
        const messageText = ctx.message.text.trim();
        const tokenAddressMatch = messageText.match(/0x[a-fA-F0-9]{40}/);
        // Skip token detection if user is importing wallet OR in any transfer state (wallet addresses also start with 0x)
        if (tokenAddressMatch && (!userState || (userState.state !== 'importing_wallet' && userState.state !== 'awaiting_transfer_address' && userState.state !== 'awaiting_transfer_amount' && userState.state !== 'awaiting_transfer_details'))) {
            const tokenAddress = tokenAddressMatch[0];
            // Let processTokenAddress handle both auto buy and manual buy logic
            await this.processTokenAddress(ctx, tokenAddress);
            return;
        }
        // Then check if user has a specific state that needs processing
        // Handle direct commands
        if (messageText === '/transfer') {
            await this.handleTransfer(ctx);
            return;
        }
        if (userState && userState.state) {
            // Process based on current user state
            switch (userState.state) {
                case 'importing_wallet':
                    await this.processWalletImport(ctx, ctx.message.text);
                    return;
                case 'awaiting_token_address':
                    await this.processTokenAddress(ctx, ctx.message.text);
                    return;
                case 'custom_buy':
                case 'token_selected':
                    await this.processCustomBuyAmount(ctx, ctx.message.text);
                    return;
                case 'awaiting_transfer_details':
                    await this.processTransferDetails(ctx, ctx.message.text);
                    return;
                case 'awaiting_custom_gas_buy':
                    await this.processCustomGas(ctx, ctx.message.text, 'buy');
                    return;
                case 'awaiting_custom_gas_sell':
                    await this.processCustomGas(ctx, ctx.message.text, 'sell');
                    return;
                case 'awaiting_custom_gas_auto_buy':
                    await this.processCustomGas(ctx, ctx.message.text, 'auto_buy');
                    return;
                case 'awaiting_custom_slippage_buy':
                    await this.processCustomSlippage(ctx, ctx.message.text, 'buy');
                    return;
                case 'awaiting_custom_slippage_sell':
                    await this.processCustomSlippage(ctx, ctx.message.text, 'sell');
                    return;
                case 'awaiting_custom_slippage_auto_buy':
                    await this.processCustomSlippage(ctx, ctx.message.text, 'auto_buy');
                    return;
                case 'awaiting_custom_amount_auto_buy':
                    await this.processCustomAutoBuyAmount(ctx, ctx.message.text);
                    return;
                case 'awaiting_transfer_address':
                    await this.processTransferAddress(ctx, ctx.message.text);
                    return;
                case 'awaiting_transfer_amount':
                    await this.processTransferAmount(ctx, ctx.message.text, userState.data?.recipientAddress);
                    return;
            }
        }
        // Default response for no state or unrecognized input
        await ctx.reply('Please use the menu buttons to interact with the bot.');
    }
    async processTransferAddress(ctx, address) {
        const userId = ctx.from.id;
        try {
            // Validate address format
            const cleanAddress = address.trim();
            if (!cleanAddress.startsWith('0x') || cleanAddress.length !== 42) {
                await ctx.reply('❌ Invalid address format. Address must be 42 characters starting with 0x');
                return;
            }
            // Get user balance for display
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ User not found. Please start the bot with /start');
                return;
            }
            const balance = await this.walletManager.getBalance(user.wallet_address);
            const currentBalance = parseFloat(balance);
            // Ask for amount
            const amountText = `✅ **Address Confirmed**

📤 **To:** \`${cleanAddress}\`
💼 **Your Balance:** *${currentBalance.toFixed(4)} MON*

Enter the amount you want to transfer:
**Example:** \`1.5\``;
            await ctx.reply(amountText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "1.5"
                }
            });
            // Update user state with address
            await this.database.setUserState(userId, 'awaiting_transfer_amount', { 
                recipientAddress: cleanAddress 
            });
            // Clear cache to ensure fresh state is loaded
            await this.cacheService.clearUserState(userId);
        } catch (error) {
            this.monitoring.logError('Transfer address processing failed', error, { userId });
            await ctx.reply('❌ Error processing address. Please try again.');
        }
    }
    async processTransferAmount(ctx, amountStr, recipientAddress) {
        const userId = ctx.from.id;
        try {
            // Check if input looks like an address (user sent another address instead of amount)
            if (amountStr.trim().match(/0x[a-fA-F0-9]{40}/)) {
                await ctx.reply('❌ Please enter the transfer amount, not an address. Example: 0.1');
                return;
            }
            const amount = parseFloat(amountStr);
            // Validate amount
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Invalid amount. Please enter a positive number.');
                return;
            }
            // Get user data
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ User not found. Please start the bot with /start');
                return;
            }
            // Check balance
            const balance = await this.walletManager.getBalance(user.wallet_address);
            const currentBalance = parseFloat(balance);
            if (currentBalance < amount) {
                await ctx.reply(`❌ Insufficient balance. You have ${currentBalance.toFixed(6)} MON, trying to send ${amount} MON`);
                return;
            }
            // Execute transfer using wallet manager
            const result = await this.walletManager.sendMON(
                user.encrypted_private_key,
                recipientAddress,
                amount.toString()
            );
            // Clear user state after transfer attempt (success or failure)
            await this.database.clearUserState(userId);
            if (result.success) {
                // Use UnifiedCacheManager for transfer operations (same as trading)
                if (this.cacheService) {
                    try {
                        // Immediate cache clear for UI responsiveness
                        await this.cacheService.delete('main_menu', userId);
                        
                        // Delayed cache clear for balance accuracy (same as trading operations)
                        setTimeout(async () => {
                            try {
                                await Promise.all([
                                    this.cacheService.delete('wallet_balance', user.wallet_address),
                                    this.cacheService.delete('mon_balance', user.wallet_address),
                                    this.cacheService.delete('portfolio', userId)
                                ]);
                                this.monitoring.logInfo('Transfer: Delayed cache invalidated', { 
                                    userId, 
                                    walletAddress: user.wallet_address,
                                    typesInvalidated: ['wallet_balance', 'mon_balance', 'portfolio'],
                                    delay: '3000ms'
                                });
                            } catch (cacheError) {
                                this.monitoring.logError('Transfer: Delayed cache invalidation failed', cacheError, { userId });
                            }
                        }, 3000); // 3 second delay for transfer confirmation
                    } catch (cacheError) {
                        this.monitoring.logError('Transfer: Immediate cache clear failed', cacheError, { userId });
                    }
                }
                const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.transactionHash}`;
                await ctx.reply(`✅ *Transfer Successful!*

📤 **Sent:** ${amount} MON
📍 **To:** \`${recipientAddress}\`

[View on Explorer](${explorerUrl})

Your MON has been sent successfully!`, {
                    parse_mode: 'Markdown'
                });
            } else {
                await ctx.reply(`❌ *Transfer Failed*
Error: ${result.error}
Please try again or check your wallet balance.`);
            }
        } catch (error) {
            this.monitoring.logError('Transfer processing failed', error, { userId, transferText });
            await ctx.reply('❌ Error processing transfer. Please try again.');
        }
    }
    // Custom input processing methods
    async processCustomGas(ctx, gasValue, type) {
        const userId = ctx.from.id;
        try {
            const gasPrice = parseInt(gasValue);
            // Validate gas price range
            if (isNaN(gasPrice) || gasPrice < 50) {
                await ctx.reply('❌ Please enter a gas price of at least 50 Gwei.');
                return;
            }
            // Convert to wei (Gwei * 1e9)
            const gasPriceWei = gasPrice * 1000000000;
            // Determine the field to update
            let field;
            switch (type) {
                case 'buy':
                    field = 'gas_price';
                    break;
                case 'sell':
                    field = 'sell_gas_price';
                    break;
                case 'auto_buy':
                    field = 'auto_buy_gas';
                    break;
                default:
                    throw new Error('Invalid gas type');
            }
            // Update database with timestamp tracking
            const GasSlippagePriority = require('../utils/gasSlippagePriority');
            const prioritySystem = new GasSlippagePriority(this.database, this.cacheService);
            await prioritySystem.updateGasSettings(userId, gasPriceWei, type);
            // Clear user state
            await this.database.clearUserState(userId);
            // Force immediate cache refresh using CacheService
            if (this.cacheService) {
                await this.cacheService.delete('user_settings', userId);
                await this.cacheService.delete('main_menu', userId);
            }
            await ctx.reply(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} gas price set to ${gasPrice} Gwei`);
            // Return to appropriate menu automatically
            setTimeout(async () => {
                try {
                    if (type === 'buy') {
                        await this.mainBot.showBuyGasSettings(ctx);
                    } else if (type === 'sell') {
                        await this.mainBot.showSellGasSettings(ctx);
                    } else if (type === 'auto_buy') {
                        await this.mainBot.showAutoBuyGasSettings(ctx);
                    }
                } catch (error) {
                    // Navigation error handled silently
                }
            }, 800);
        } catch (error) {
            this.monitoring.logError('Custom gas processing failed', error, { userId, gasValue, type });
            await ctx.reply('❌ Error updating gas settings. Please try again.');
        }
    }
    async processCustomSlippage(ctx, slippageValue, type) {
        const userId = ctx.from.id;
        try {
            const slippage = parseFloat(slippageValue);
            // Validate slippage range
            if (isNaN(slippage) || slippage < 0.1 || slippage > 100) {
                await ctx.reply('❌ Please enter a slippage between 0.1% and 100%.');
                return;
            }
            // Determine the field to update
            let field;
            switch (type) {
                case 'buy':
                    field = 'slippage_tolerance';
                    break;
                case 'sell':
                    field = 'sell_slippage_tolerance';
                    break;
                case 'auto_buy':
                    field = 'auto_buy_slippage';
                    break;
                default:
                    throw new Error('Invalid slippage type');
            }
            // Update database with timestamp tracking
            const GasSlippagePriority = require('../utils/gasSlippagePriority');
            const prioritySystem = new GasSlippagePriority(this.database, this.cacheService);
            await prioritySystem.updateSlippageSettings(userId, slippage, type);
            // Clear user state
            await this.database.clearUserState(userId);
            // Force immediate cache refresh using CacheService
            if (this.cacheService) {
                await this.cacheService.delete('user_settings', userId);
                await this.cacheService.delete('main_menu', userId);
            }
            await ctx.reply(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} slippage set to ${slippage}%`);
            // Return to appropriate menu automatically
            setTimeout(async () => {
                try {
                    if (type === 'buy') {
                        await this.mainBot.showBuySlippageSettings(ctx);
                    } else if (type === 'sell') {
                        await this.mainBot.showSellSlippageSettings(ctx);
                    } else if (type === 'auto_buy') {
                        await this.mainBot.showAutoBuySlippageSettings(ctx);
                    }
        } catch (error) {
                    // Navigation error handled silently
                }
            }, 800);
        } catch (error) {
            this.monitoring.logError('Custom slippage processing failed', error, { userId, slippageValue, type });
            await ctx.reply('❌ Error updating slippage settings. Please try again.');
        }
    }
    async processCustomAutoBuyAmount(ctx, amountValue) {
        const userId = ctx.from.id;
        try {
            const amount = parseFloat(amountValue);
            // Validate amount range
            if (isNaN(amount) || amount < 0.01 || amount > 100) {
                await ctx.reply('❌ Please enter an amount between 0.01 and 100 MON.');
            return;
        }
            // Update database with timestamp tracking
            const GasSlippagePriority = require('../utils/gasSlippagePriority');
            const prioritySystem = new GasSlippagePriority(this.database, this.cacheService);
            await prioritySystem.updateAutoBuyAmount(userId, amount);
            // Clear user state
            await this.database.clearUserState(userId);
            // Force immediate cache refresh using CacheService
            if (this.cacheService) {
                await this.cacheService.delete('user_settings', userId);
                await this.cacheService.delete('main_menu', userId);
            }
            await ctx.reply(`✅ Auto buy amount set to ${amount} MON`);
            // Return to auto buy amount settings automatically
            setTimeout(async () => {
                try {
                    await this.mainBot.showAutoBuyAmount(ctx);
        } catch (error) {
                    // Navigation error handled silently
                }
            }, 800);
        } catch (error) {
            this.monitoring.logError('Custom auto buy amount processing failed', error, { userId, amountValue });
            await ctx.reply('❌ Error updating auto buy amount. Please try again.');
        }
    }
    async executeInstantAutoBuy(ctx, tokenAddress, user, userSettings) {
        const userId = ctx.from.id;
        let processingMessage = null;
        try {
            // Send immediate feedback to user and store message for later update
            processingMessage = await ctx.reply(`🚀 *Auto Buy Activated*
⏳ *Processing transaction...*`, { parse_mode: 'Markdown' });
            // Use NEW UNIFIED TRADING SYSTEM for Auto Buy with preloaded data
            const TradingInterface = require('../trading/TradingInterface');
            const tradingDependencies = {
                redis: this.redis,
                database: this.database,
                monorailAPI: this.monorailAPI,
                walletManager: this.walletManager,
                monitoring: this.monitoring
            };
            const tradingInterface = new TradingInterface(null, tradingDependencies);
            // Execute auto buy with turbo mode if enabled
            let result;
            if (userSettings.turbo_mode) {
                // TURBO AUTO-BUY: Use UnifiedTradingEngine turbo mode (same as manual)
                result = await tradingInterface.engine.executeTrade({
                    type: 'turbo',
                    action: 'buy',
                    userId: userId,
                    tokenAddress: tokenAddress,
                    amount: userSettings.auto_buy_amount,
                    preloadedUser: user,
                    preloadedSettings: userSettings
                });
            } else {
                // NORMAL AUTO-BUY: Use full validation system
                result = await tradingInterface.engine.executeTrade({
                    type: 'normal',
                    action: 'buy',
                    userId: userId,
                    tokenAddress: tokenAddress,
                    amount: userSettings.auto_buy_amount,
                    preloadedUser: user,
                    preloadedSettings: userSettings
                });
            }
            // Get auto buy amount from settings for display purposes
            const buyAmount = parseFloat(userSettings.auto_buy_amount) || 0.1; // Default 0.1 MON
            // Auto buy already executed above, just handle the result
            const tradeResult = result;
            if (tradeResult.success) {
                // Update the processing message with success
                const explorerUrl = `https://testnet.monadexplorer.com/tx/${tradeResult.txHash}`;
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    processingMessage.message_id,
                    undefined,
                    `✅ *Auto Buy Successful!*
[View on Explorer](${explorerUrl})`,
                    { parse_mode: 'Markdown' }
                );
                
                // Show comprehensive sell interface after successful auto-buy
                await this.showComprehensiveSellInterface(ctx, tokenAddress, tradeResult);
                
                // Auto buy completed successfully - no need for additional refresh
                // The cache invalidation above will ensure fresh data on next menu access
            } else {
                // Update the processing message with failure
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    processingMessage.message_id,
                    undefined,
                    `❌ *Auto Buy Failed*
Error: ${tradeResult.error}`,
                    { parse_mode: 'Markdown' }
                );
                // Log failed auto buy
            }
        } catch (error) {
            this.monitoring.logError('Instant auto buy failed', error, { userId, tokenAddress });
            // Try to update the processing message if it exists, otherwise send new message
            try {
                if (processingMessage) {
                    await ctx.telegram.editMessageText(
                        ctx.chat.id,
                        processingMessage.message_id,
                        undefined,
                        `❌ *Auto Buy System Error*
An unexpected error occurred during auto buy execution.
Please try again or contact support if the issue persists.
📍 Token: \`${tokenAddress}\``,
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await ctx.reply(`❌ *Auto Buy System Error*
An unexpected error occurred during auto buy execution.
Please try again or contact support if the issue persists.
📍 Token: \`${tokenAddress}\``);
                }
            } catch (editError) {
                // If edit fails, send new message
                await ctx.reply(`❌ *Auto Buy System Error*
An unexpected error occurred during auto buy execution.
Please try again or contact support if the issue persists.
📍 Token: \`${tokenAddress}\``);
            }
        }
    }
    async processTokenAddress(ctx, tokenAddress) {
        const userId = ctx.from.id;
        try {
            // Validate token address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
                await ctx.reply('❌ Invalid token address format. Please enter a valid Ethereum address.');
            return;
        }
            // Get token info using Unified Trading System
        const TradingInterface = require('../trading/TradingInterface');
        const tradingDependencies = {
            redis: this.redis,
            database: this.database,
            monorailAPI: this.monorailAPI,
            walletManager: this.walletManager,
            monitoring: this.monitoring
        };
        const tradingInterface = new TradingInterface(null, tradingDependencies);
        const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
        if (!tokenInfo || !tokenInfo.success) {
            await ctx.reply('❌ Token not found or not supported. Please check the address and try again.');
            return;
        }
            // Clear any existing user state and store token info for buy actions
            await this.database.clearUserState(userId);
            await this.database.setUserState(userId, 'token_selected', {
                tokenAddress: tokenAddress,
                tokenSymbol: tokenInfo.token.symbol || 'Unknown',
                tokenName: tokenInfo.token.name || 'Unknown Token'
            });
            // Get user wallet and settings
            const user = await this.database.getUserByTelegramId(userId);
            const userSettings = await this.database.getUserSettings(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }
            // Check if auto buy is enabled and execute immediately
            if (userSettings && userSettings.auto_buy_enabled === true) {
                await this.executeInstantAutoBuy(ctx, tokenAddress, user, userSettings);
                return;
            } else {
            }
            const monBalanceData = await this.monorailAPI.getMONBalance(user.wallet_address);
            const monBalance = parseFloat(monBalanceData.balance || '0');
            // Get token price information directly from token info API
            let tokenPriceUSD = 0;
            let tokenPriceInMON = 0;
            let confidence = 100;
            if (tokenInfo.token.usd_per_token) {
                tokenPriceUSD = parseFloat(tokenInfo.token.usd_per_token);
            }
            if (tokenInfo.token.mon_per_token) {
                tokenPriceInMON = parseFloat(tokenInfo.token.mon_per_token);
            }
            if (tokenInfo.token.pconf) {
                confidence = parseInt(tokenInfo.token.pconf);
            }
            const tokenText = `*🟣 ${tokenInfo.token.symbol || 'Unknown'} | ${tokenInfo.token.name || 'Unknown Token'}*
${tokenAddress}
*📊 Token Information:*
• Price: ${tokenPriceUSD.toFixed(4)} USD
• Price in MON: ${tokenPriceInMON.toFixed(4)} MON
• Confidence: ${confidence}%
*💼 Your Wallet:*
• MON Balance: ${monBalance.toFixed(6)} MON
*💡 Select amount of MON to spend:*`;
            // Get user's custom buy amounts (userSettings already loaded above)
            let customAmounts = userSettings?.custom_buy_amounts || '0.1,0.5,1,5';
            // Handle case where custom_buy_amounts might be null or not a string
            if (!customAmounts || typeof customAmounts !== 'string') {
                customAmounts = '0.1,0.5,1,5';
            }
            const amountsArray = customAmounts.split(',');
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`${amountsArray[0]?.trim() || '0.1'} MON`, `buy_amount_${amountsArray[0]?.trim() || '0.1'}`), 
                    Markup.button.callback(`${amountsArray[1]?.trim() || '0.5'} MON`, `buy_amount_${amountsArray[1]?.trim() || '0.5'}`)
                ],
                [
                    Markup.button.callback(`${amountsArray[2]?.trim() || '1'} MON`, `buy_amount_${amountsArray[2]?.trim() || '1'}`), 
                    Markup.button.callback(`${amountsArray[3]?.trim() || '5'} MON`, `buy_amount_${amountsArray[3]?.trim() || '5'}`)
                ],
                [Markup.button.callback('📝 Custom Amount', 'buy_amount_custom'), Markup.button.callback('🔍 View on Explorer', `view_explorer_${tokenAddress}`)],
                [Markup.button.callback('🏠 Back to Main', 'back_to_main'), Markup.button.callback('🔄 Refresh Data', `refresh_token_${tokenAddress}`)]
            ]);
            await ctx.reply(tokenText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring.logError('Process token address failed', error, { userId, tokenAddress });
            await ctx.reply('❌ Error processing token address. Please try again.');
        }
    }
    async processWalletImport(ctx, input) {
        const userId = ctx.from.id;
        try {
            // Delete the user's message for security
            await ctx.deleteMessage();
            // Use existing wallet manager instance
            const WalletManager = require('../wallet');
            const walletManager = new WalletManager(this.redis, this.database);
            let wallet;
            // Try to import as private key first, then as mnemonic
            try {
                wallet = await walletManager.importFromPrivateKey(input.trim());
            } catch (error) {
                try {
                    wallet = await walletManager.importFromMnemonic(input.trim());
                } catch (mnemonicError) {
                    // Edit the existing message to show error
                    try {
                        await ctx.editMessageText('❌ Invalid private key or mnemonic phrase. Please try again.', {
                            reply_markup: Markup.inlineKeyboard([
                                [Markup.button.callback('🔙 Back to Wallet', 'wallet')]
                            ]).reply_markup
                        });
                    } catch (editError) {
                        await ctx.reply('❌ Invalid private key or mnemonic phrase. Please try again.');
                    }
            return;
                }
            }
            // Ensure user exists in database first, then update wallet
            await this.database.createUser(userId, ctx.from.username || 'Unknown');
            const updatedUser = await this.database.updateUserWallet(userId, wallet.address, wallet.encryptedPrivateKey);
            // CRITICAL: Update cache with new user data immediately
            if (this.cacheService && updatedUser) {
                try {
                    await this.cacheService.set('user', userId, updatedUser);
                } catch (cacheError) {
                }
            }
            // Get the import message ID from user state before clearing it
            const userState = await this.database.getUserState(userId);
            const importMessageId = userState?.data?.importMessageId;
            // Clear user state
            await this.database.clearUserState(userId);
            // Delete all previous messages and send only the success message
            if (importMessageId) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, importMessageId);
                    // Import instruction message deleted
                } catch (deleteError) {
                    // Failed to delete import message
                }
            }
            // Cancel any active force reply by sending a message with remove_keyboard
            try {
                await ctx.reply('✅ Wallet imported successfully!', {
                    reply_markup: {
                        remove_keyboard: true
                    }
                });
                // Delete this temporary message immediately
                setTimeout(async () => {
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id + 1);
                    } catch (e) {
                        // Ignore deletion errors
                    }
                }, 100);
            } catch (e) {
                // Ignore if can't cancel force reply
            }
            // Send success message
            const { text, keyboard } = InterfaceUtils.generateWalletSuccessInterface(wallet.address, 'imported');
            await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring.logError('Wallet import failed', error, { userId });
            await ctx.reply('❌ Error importing wallet. Please try again.');
        }
    }

    /**
     * Show comprehensive sell interface after successful purchase (Auto-buy + Manual)
     */
    async showComprehensiveSellInterface(ctx, tokenAddress, tradeResult) {
        try {
            const userId = ctx.from.id;
            
            // Get user for wallet address
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) return;

            // Get comprehensive token info and user balance
            const [tokenInfo, userSettings] = await Promise.all([
                this.monorailAPI.getTokenInfo(tokenAddress),
                this.database.getUserSettings(userId)
            ]);

            const tokenSymbol = tokenInfo?.token?.symbol || 'Token';
            const tokenName = tokenInfo?.token?.name || 'Unknown Token';
            
            // Get user's FULL balance of this token (not just purchased amount)
            let tokenBalance = 0;
            let tokenValueUSD = 0;
            let tokenValueMON = 0;
            
            try {
                const portfolioData = await this.monorailAPI.getPortfolioValue(user.wallet_address);
                if (portfolioData.success && portfolioData.tokens) {
                    const tokenEntry = portfolioData.tokens.find(t => 
                        t.address?.toLowerCase() === tokenAddress.toLowerCase()
                    );
                    if (tokenEntry) {
                        tokenBalance = parseFloat(tokenEntry.balance || 0);
                        tokenValueUSD = parseFloat(tokenEntry.value_usd || 0);
                        tokenValueMON = parseFloat(tokenEntry.value_mon || 0);
                    }
                }
            } catch (error) {
                this.monitoring.logError('Failed to get token balance', error, { userId, tokenAddress });
            }

            // Get user's custom sell percentages
            const customPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            const percentagesArray = customPercentages.split(',').map(p => parseInt(p.trim()));

            // Professional sell interface message
            const sellMessage = `**Purchase Successful**

**Token Information:**
**Name:** ${tokenName}
**Symbol:** ${tokenSymbol}
**Contract:** \`${tokenAddress}\`

**Your Holdings:**
**Balance:** ${tokenBalance.toFixed(6)} ${tokenSymbol}
**Value (USD):** $${tokenValueUSD.toFixed(4)}
**Value (MON):** ${tokenValueMON.toFixed(4)} MON

**Transaction:**
**Hash:** \`${tradeResult.txHash}\`
**Status:** Confirmed

Select percentage to sell:`;

            // Build sell percentage buttons using user's custom settings
            const buttons = [];
            for (let i = 0; i < percentagesArray.length; i += 2) {
                const row = [];
                if (percentagesArray[i]) {
                    row.push(Markup.button.callback(`${percentagesArray[i]}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[i]}`));
                }
                if (percentagesArray[i + 1]) {
                    row.push(Markup.button.callback(`${percentagesArray[i + 1]}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[i + 1]}`));
                }
                if (row.length > 0) buttons.push(row);
            }

            // Add refresh and navigation buttons
            buttons.push([
                Markup.button.callback('🔄 Refresh', `refresh_sell_${tokenAddress}`),
                Markup.button.callback('📊 Portfolio', 'portfolio')
            ]);
            buttons.push([Markup.button.callback('🏠 Main Menu', 'back_to_main')]);

            const keyboard = Markup.inlineKeyboard(buttons);

            // Set user state for selling this token
            await this.database.setUserState(userId, 'selling_token', {
                tokenAddress,
                tokenSymbol,
                tokenBalance,
                tokenValueUSD,
                tokenValueMON
            });

            // Send the comprehensive sell interface
            setTimeout(async () => {
                try {
                    // Use fresh data fetcher for accurate balance
                    const FreshDataFetcher = require("../utils/freshDataFetcher");
                    const freshDataFetcher = new FreshDataFetcher(this.monorailAPI, this.cacheService, this.monitoring);
                    const freshTokenData = await freshDataFetcher.getFreshTokenData(
                        user.wallet_address, 
                        tokenAddress, 
                        tokenSymbol, 
                        tokenName
                    );
                    
                    // Generate updated message with fresh data
                    const updatedSellMessage = freshDataFetcher.generateUpdatedSellMessage(
                        freshTokenData, 
                        tokenAddress, 
                        tradeResult
                    );
                    
                    // Update user state with fresh data
                    await this.database.setUserState(userId, "selling_token", {
                        tokenAddress,
                        tokenSymbol,
                        tokenBalance: freshTokenData.tokenBalance,
                        tokenValueUSD: freshTokenData.tokenValueUSD,
                        tokenValueMON: freshTokenData.tokenValueMON
                    });

                    await ctx.reply(updatedSellMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    });
                } catch (error) {
                    this.monitoring.logError('Failed to send sell interface', error, { 
                        userId, 
                        tokenAddress 
                    });
                }
            }, 8000); // 8 second delay for blockchain confirmation
            
        } catch (error) {
            this.monitoring.logError('Comprehensive sell interface failed', error, { 
                userId: ctx.from.id, 
                tokenAddress 
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Handle refresh sell interface
     */
    async handleRefreshSell(ctx, tokenAddress) {
        try {
            await ctx.answerCbQuery('🔄 Refreshing token data...');
            
            const userId = ctx.from.id;
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) return;

            // Get fresh token data
            const [tokenInfo, userSettings] = await Promise.all([
                this.monorailAPI.getTokenInfo(tokenAddress),
                this.database.getUserSettings(userId)
            ]);

            const tokenSymbol = tokenInfo?.token?.symbol || 'Token';
            const tokenName = tokenInfo?.token?.name || 'Unknown Token';
            
            // Get updated balance
            let tokenBalance = 0;
            let tokenValueUSD = 0;
            let tokenValueMON = 0;
            
            try {
                const portfolioData = await this.monorailAPI.getPortfolioValue(user.wallet_address);
                if (portfolioData.success && portfolioData.tokens) {
                    const tokenEntry = portfolioData.tokens.find(t => 
                        t.address?.toLowerCase() === tokenAddress.toLowerCase()
                    );
                    if (tokenEntry) {
                        tokenBalance = parseFloat(tokenEntry.balance || 0);
                        tokenValueUSD = parseFloat(tokenEntry.value_usd || 0);
                        tokenValueMON = parseFloat(tokenEntry.value_mon || 0);
                    }
                }
            } catch (error) {
                this.monitoring.logError('Failed to refresh token balance', error, { userId, tokenAddress });
            }

            // Get user's custom sell percentages
            const customPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            const percentagesArray = customPercentages.split(',').map(p => parseInt(p.trim()));

            // Updated sell interface message
            const sellMessage = `**Token Sell Interface**

**Token Information:**
**Name:** ${tokenName}
**Symbol:** ${tokenSymbol}
**Contract:** \`${tokenAddress}\`

**Your Holdings:**
**Balance:** ${tokenBalance.toFixed(6)} ${tokenSymbol}
**Value (USD):** $${tokenValueUSD.toFixed(4)}
**Value (MON):** ${tokenValueMON.toFixed(4)} MON

*Last Updated: ${new Date().toLocaleTimeString()}*

Select percentage to sell:`;

            // Build sell percentage buttons using user's custom settings
            const buttons = [];
            for (let i = 0; i < percentagesArray.length; i += 2) {
                const row = [];
                if (percentagesArray[i]) {
                    row.push(Markup.button.callback(`${percentagesArray[i]}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[i]}`));
                }
                if (percentagesArray[i + 1]) {
                    row.push(Markup.button.callback(`${percentagesArray[i + 1]}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[i + 1]}`));
                }
                if (row.length > 0) buttons.push(row);
            }

            // Add refresh and navigation buttons
            buttons.push([
                Markup.button.callback('🔄 Refresh', `refresh_sell_${tokenAddress}`),
                Markup.button.callback('📊 Portfolio', 'portfolio')
            ]);
            buttons.push([Markup.button.callback('🏠 Main Menu', 'back_to_main')]);

            const keyboard = Markup.inlineKeyboard(buttons);

            // Update user state with fresh data
            await this.database.setUserState(userId, 'selling_token', {
                tokenAddress,
                tokenSymbol,
                tokenBalance,
                tokenValueUSD,
                tokenValueMON
            });

            // Update the message
            await ctx.editMessageText(sellMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Refresh sell interface failed', error, { 
                userId: ctx.from.id, 
                tokenAddress 
            });
            await ctx.answerCbQuery('❌ Failed to refresh data');
        }
    }

    async processCustomBuyAmount(ctx, amountText) {
        const userId = ctx.from.id;
        try {
            // First check if the input is a token address (user sent another token)
            const tokenAddressMatch = amountText.trim().match(/0x[a-fA-F0-9]{40}/);
            if (tokenAddressMatch) {
                // User sent a new token address, process it instead of treating as amount
                await this.processTokenAddress(ctx, tokenAddressMatch[0]);
                return;
            }
            const amount = parseFloat(amountText);
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Please enter a valid amount greater than 0.');
                return;
            }
            // Get user state to find the token
            const userState = await this.database.getUserState(userId);
            if (!userState || !userState.data || !userState.data.tokenAddress) {
                await ctx.reply('❌ Session expired. Please start over.');
                return;
            }
            const tokenAddress = userState.data.tokenAddress;
            const tokenSymbol = userState.data.tokenSymbol || 'Token';
            // Show confirmation
            await ctx.reply(`🔄 *Confirm Purchase*
💰 *Amount:* ${amount} MON
🪙 *Token:* ${tokenSymbol}
📍 *Address:* \`${tokenAddress}\`
Proceed with this purchase?`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Confirm', callback_data: `confirm_buy_${tokenAddress}_${amount}` },
                            { text: '❌ Cancel', callback_data: 'cancel_trade' }
                        ]
                    ]
                }
            });
        } catch (error) {
            this.monitoring.logError('Process custom buy amount failed', error, { userId });
            await ctx.reply('❌ Error processing amount. Please try again.');
        }
    }
    async handleManualRefresh(ctx) {
        const userId = ctx.from.id;
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('🔄 Refreshing data...');
            }
            // Get user first
            let user;
            if (this.cacheService) {
                user = await this.cacheService.get('user', userId,
                    async () => await this.database.getUserByTelegramId(userId)
                );
            } else {
                user = await this.database.getUserByTelegramId(userId);
            }
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }
            // Clear all relevant cache including MON balance
            if (this.cacheService) {
                try {
                    await Promise.all([
                        this.cacheService.delete('portfolio', userId),
                        this.cacheService.delete('wallet_balance', user.wallet_address),
                        this.cacheService.delete('main_menu', userId),
                        this.cacheService.delete('mon_balance', user.wallet_address), // أضافة مسح رصيد MON
                        this.cacheService.delete('portfolio_value', user.wallet_address) // أضافة مسح قيمة البورتفوليو
                    ]);
                    this.monitoring.logInfo('Manual refresh cache cleared', { userId, walletAddress: user.wallet_address });
                } catch (cacheError) {
                    this.monitoring.logError('Manual refresh cache clear failed', cacheError, { userId });
                }
            }
            // Fetch fresh data with forceRefresh = true
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address, true),
                this.monorailAPI.getPortfolioValue(user.wallet_address, true),
                this.monorailAPI.getMONPriceUSD(false) // Use cache (price updates hourly)
            ]);
            const monBalance = parseFloat(monBalanceData.balance || '0');
            const monPriceUSD = parseFloat(monPriceData.price || '0');
            const portfolioValueUSD = parseFloat(portfolioValueData.value || '0');
            const monValueUSD = monBalance * monPriceUSD;
            // Generate fresh interface
            const { text, keyboard } = InterfaceUtils.generateMainInterface(
                user, monBalance, monPriceUSD, portfolioValueUSD
            );
            // Update the message - NEVER send new message, only edit existing
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
                this.monitoring.logInfo('Manual refresh completed successfully', { userId });
            } catch (editError) {
                // Handle edit errors gracefully without sending new messages
                if (editError.description && editError.description.includes('message is not modified')) {
                    // Message content is identical, no need to update
                    this.monitoring.logInfo('Manual refresh - no changes detected', { userId });
                } else {
                    // Log error but DO NOT send new message - this is the critical fix
                    this.monitoring.logError('Message edit failed - refresh aborted to prevent new message', editError, { userId });
                    // Just acknowledge the callback without sending new message
                }
            }
            this.monitoring.logInfo('Manual refresh completed', { 
                userId, 
                monBalance, 
                portfolioValueUSD,
                monPriceUSD 
            });
        } catch (error) {
            this.monitoring.logError('Manual refresh failed', error, { userId });
            await ctx.reply('❌ Error refreshing data. Please try again.');
        }
    }
    // handleToggleTurboMode and handleConfirmTurboEnable removed - using updated versions from index-modular-simple.js
}
module.exports = NavigationHandlers;