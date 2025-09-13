// Navigation and UI Handlers
const { Markup } = require('telegraf');
const InterfaceUtils = require('../utils/interfaceUtils');

class NavigationHandlers {
    constructor(bot, database, monorailAPI, monitoring, redis = null, walletManager = null, mainBot = null) {
        this.bot = bot;
        this.database = database;
        this.monorailAPI = monorailAPI;
        this.monitoring = monitoring;
        this.redis = redis;
        this.walletManager = walletManager;
        this.mainBot = mainBot; // Reference to main bot instance
    }

    setupHandlers() {
        // Start command
        this.bot.start(async (ctx) => {
            await this.handleStart(ctx);
        });

        // Main navigation handlers
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
                    this.monitoring.logError('Redis cache read failed during start', redisError, { userId });
                }
            }
            
            // Fallback to database if no cache
            if (!user) {
                user = await this.database.getUserByTelegramId(userId);
                
                // Cache user data in Redis if available
                if (user && this.redis) {
                    try {
                        await this.redis.setEx(`user:${userId}`, 86400, JSON.stringify(user)); // 24 hour TTL
                        this.monitoring.logInfo('User data cached in Redis', { userId, ttl: '24h' });
                    } catch (redisError) {
                        this.monitoring.logError('Redis cache write failed', redisError, { userId });
                    }
                }
            }
            
            // Create session
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
        const { text, keyboard } = InterfaceUtils.generateNewUserInterface();
        await ctx.replyWithMarkdown(text, keyboard);
    }

    async handleBackToMainWithDebug(ctx) {
        const userId = ctx.from.id;
        
        try {
            // Check for cached main menu data first (15 seconds TTL)
            const cacheKey = `main_menu:${userId}`;
            let cachedData = null;
            
            if (this.redis) {
                try {
                    const cached = await this.redis.get(cacheKey);
                    if (cached) {
                        cachedData = JSON.parse(cached);
                    }
                } catch (redisError) {
                    // Redis error, continue without cache
                }
            }

            let monBalance, monPriceUSD, portfolioValueUSD, portfolioValueMON, monValueUSD, user;

            if (cachedData) {
                // Use cached data
                ({ monBalance, monPriceUSD, portfolioValueUSD, portfolioValueMON, monValueUSD, user } = cachedData);
            } else {
                // Fetch fresh data
                user = await this.database.getUserByTelegramId(userId);
                if (!user) {
                    await ctx.reply('❌ Please start the bot first with /start');
                    return;
                }

                const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                    this.monorailAPI.getMONBalance(user.wallet_address, false),
                    this.monorailAPI.getPortfolioValue(user.wallet_address, false),
                    this.monorailAPI.getMONPriceUSD(false)
                ]);

                monBalance = parseFloat(monBalanceData.balance || '0');
                monPriceUSD = parseFloat(monPriceData.price || '0');
                portfolioValueUSD = parseFloat(portfolioValueData.value || '0');
                portfolioValueMON = monPriceUSD > 0 ? portfolioValueUSD / monPriceUSD : 0;
                monValueUSD = monBalance * monPriceUSD;

                // Cache the data for 15 seconds
                if (this.redis) {
                    try {
                        const dataToCache = { monBalance, monPriceUSD, portfolioValueUSD, portfolioValueMON, monValueUSD, user };
                        await this.redis.setEx(cacheKey, 15, JSON.stringify(dataToCache));
                    } catch (redisError) {
                        // Cache error, continue without caching
                    }
                }
            }

            const { text, keyboard } = InterfaceUtils.generateMainInterface(
                user, monBalance, monPriceUSD, portfolioValueUSD
            );

            await ctx.replyWithMarkdown(text, keyboard);

        } catch (error) {
            this.monitoring.logError('Back to main failed', error, { userId });
            await ctx.reply('❌ Error loading main menu. Please try again.');
        }
    }

    async showWelcome(ctx, fromCache = false) {
        const userId = ctx.from.id;
        
        try {
            let user;
            
            if (fromCache) {
                const cachedUser = await this.redis.get(`user:${userId}`);
                user = cachedUser ? JSON.parse(cachedUser) : null;
            }
            
            if (!user) {
                user = await this.database.getUserByTelegramId(userId);
                if (!user) {
                    await this.showWelcomeNewUser(ctx);
                    return;
                }
            }

            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address, false),
                this.monorailAPI.getPortfolioValue(user.wallet_address, false),
                this.monorailAPI.getMONPriceUSD(false)
            ]);

            const monBalance = parseFloat(monBalanceData.balance || '0');
            const monPriceUSD = parseFloat(monPriceData.price || '0');
            const portfolioValueUSD = parseFloat(portfolioValueData.value || '0');
            const portfolioValueMON = monPriceUSD > 0 ? portfolioValueUSD / monPriceUSD : 0;
            const monValueUSD = monBalance * monPriceUSD;

            const { text, keyboard } = InterfaceUtils.generateMainInterface(
                user, monBalance, monPriceUSD, portfolioValueUSD
            );

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
            this.monitoring.logError('Welcome display failed', error, { userId });
            await ctx.reply('❌ Error loading data. Please try again.');
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

    async handleTextMessage(ctx) {
        const userId = ctx.from.id;
        const userState = await this.database.getUserState(userId);
        
        // First check if user has a specific state that needs processing
        if (userState && userState.state) {
            // Process based on current user state first
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
            }
        }
        
        // Only check for token addresses if user is not in a specific state
        // Skip token address processing if user is in token_selected state to avoid conflicts
        if (!userState || userState.state !== 'token_selected') {
            const messageText = ctx.message.text.trim();
            const tokenAddressMatch = messageText.match(/0x[a-fA-F0-9]{40}/);
            if (tokenAddressMatch) {
                const tokenAddress = tokenAddressMatch[0];
                
                // Check if auto buy is enabled
                const user = await this.database.getUser(userId);
                const userSettings = await this.database.getUserSettings(userId);
                
                if (userSettings && userSettings.auto_buy_enabled) {
                    // Execute instant auto buy
                    await this.executeInstantAutoBuy(ctx, tokenAddress, user, userSettings);
                    return;
                } else {
                    // Normal token address processing (show buy menu)
                    await this.processTokenAddress(ctx, tokenAddress);
                    return;
                }
            }
        }

        // Default response for no state or unrecognized input
        await ctx.reply('Please use the menu buttons to interact with the bot.');
    }

    async processTransferDetails(ctx, transferText) {
        const userId = ctx.from.id;
        
        try {
            // Parse transfer details: "address amount"
            const parts = transferText.trim().split(/\s+/);
            if (parts.length !== 2) {
                await ctx.reply('❌ Invalid format. Please use: address amount\nExample: 0x1234...5678 1.5');
                return;
            }

            const [address, amountStr] = parts;
            const amount = parseFloat(amountStr);

            // Validate address format
            if (!address.startsWith('0x') || address.length !== 42) {
                await ctx.reply('❌ Invalid address format. Address must be 42 characters starting with 0x');
                return;
            }

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

            // Clear user state
            await this.database.clearUserState(userId);

            // Execute transfer using wallet manager
            const result = await this.walletManager.sendMON(
                user.encrypted_private_key,
                address,
                amount.toString()
            );

            if (result.success) {
                // Clear cache after successful transfer
                if (this.redis) {
                    await Promise.all([
                        this.redis.del(`balance:${userId}`),
                        this.redis.del(`user:${userId}`),
                        this.redis.del(`main_menu:${userId}`)
                    ]);
                }

                const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.transactionHash}`;
                
                await ctx.reply(`✅ *Transfer Successful!*

📤 **Sent:** ${amount} MON
📍 **To:** \`${address}\`
🔗 **Transaction Hash:** \`${result.transactionHash}\`

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
            const prioritySystem = new GasSlippagePriority(this.database);
            await prioritySystem.updateGasSettings(userId, gasPriceWei, type);
            
            // Clear user state
            await this.database.clearUserState(userId);
            
            // Invalidate cache
            if (this.redis) {
                await this.redis.del(`user:${userId}`);
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
            const prioritySystem = new GasSlippagePriority(this.database);
            await prioritySystem.updateSlippageSettings(userId, slippage, type);
            
            // Clear user state
            await this.database.clearUserState(userId);
            
            // Invalidate cache
            if (this.redis) {
                await this.redis.del(`user:${userId}`);
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
            const prioritySystem = new GasSlippagePriority(this.database);
            await prioritySystem.updateAutoBuyAmount(userId, amount);
            
            // Clear user state
            await this.database.clearUserState(userId);
            
            // Invalidate cache
            if (this.redis) {
                await this.redis.del(`user:${userId}`);
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
        
        try {
            // Send immediate feedback to user
            await ctx.reply('🔄 *Auto Buy Triggered!*\nProcessing your transaction...');
            
            // Initialize AutoBuyEngine with correct parameters
            const AutoBuyEngine = require('../utils/autoBuyEngine');
            const autoBuyEngine = new AutoBuyEngine(this.database, this.monorailAPI, this.walletManager, this.monitoring);
            
            // Validate token address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
                await ctx.reply('❌ Invalid token address format. Please check and try again.');
                return;
            }
            
            // Get token info from Monorail API
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            if (!tokenInfo.success) {
                await ctx.reply(`❌ Token not found or not supported.\n📍 Address: \`${tokenAddress}\`\nPlease check the address and try again.`);
                return;
            }
            
            // Check user wallet and balance
            if (!user.wallet_address) {
                await ctx.reply('❌ No wallet found. Please import your wallet first using /start');
                return;
            }
            
            const monBalanceData = await this.monorailAPI.getMONBalance(user.wallet_address);
            const monBalance = parseFloat(monBalanceData.balance || '0');
            
            // Get auto buy amount from settings - fix NaN issue
            const buyAmount = parseFloat(userSettings.auto_buy_amount) || 0.1; // Default 0.1 MON
            
            // Check if user has sufficient balance
            if (monBalance < buyAmount) {
                await ctx.reply(`❌ *Insufficient Balance*
                
💰 Required: ${buyAmount} MON
💼 Available: ${monBalance.toFixed(6)} MON
📈 Needed: ${(buyAmount - monBalance).toFixed(6)} MON more`);
                return;
            }
            
            // Execute auto buy transaction using AutoBuyEngine
            const result = await autoBuyEngine.executeBuy(userId, tokenAddress, buyAmount);
            
            if (result.success) {
                // Clear cache after successful transaction
                if (this.redis) {
                    await Promise.all([
                        this.redis.del(`user:${userId}`),
                        this.redis.del(`balance:${userId}`),
                        this.redis.del(`portfolio:${userId}`),
                        this.redis.del(`main_menu:${userId}`)
                    ]);
                }
                
                // Get token details for success message
                const tokenSymbol = tokenInfo.token?.symbol || 'Unknown';
                const tokenName = tokenInfo.token?.name || 'Unknown Token';
                
                const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.transactionHash}`;
                
                await ctx.reply(`✅ *Auto Buy Successful!*

🎯 *Token:* ${tokenSymbol} | ${tokenName}
📍 *Address:* \`${tokenAddress}\`
💰 *Amount:* ${buyAmount} MON
⛽ *Gas Used:* ${userSettings.auto_buy_gas ? (userSettings.auto_buy_gas / 1000000000).toFixed(0) : '50'} Gwei
📊 *Slippage:* ${userSettings.auto_buy_slippage || 5}%

🔗 *Transaction Hash:*
\`${result.transactionHash}\`

[View on Explorer](${explorerUrl})

💡 *Auto Buy Settings Applied Automatically*`, {
                    parse_mode: 'Markdown'
                });
                
                // Auto buy transaction completed successfully
                
            } else {
                await ctx.reply(`❌ *Auto Buy Failed*

🚫 Error: ${result.error}
📍 Token: \`${tokenAddress}\`
💰 Amount: ${buyAmount} MON

Please try again or check your settings.`);
                
                // Log failed auto buy
                console.error(`❌ Auto Buy Failed - User: ${userId}, Token: ${tokenAddress}, Error: ${result.error}`);
            }
            
        } catch (error) {
            this.monitoring.logError('Instant auto buy failed', error, { userId, tokenAddress });
            await ctx.reply(`❌ *Auto Buy System Error*

An unexpected error occurred during auto buy execution.
Please try again or contact support if the issue persists.

📍 Token: \`${tokenAddress}\``);
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
            
            // Get token info from Monorail API
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            if (!tokenInfo.success) {
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
            
            // Get user wallet and MON balance
            const user = await this.database.getUserByTelegramId(userId);
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

            // Get user's custom buy amounts
            const userSettings = await this.database.getUserSettings(userId);
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
            
            const WalletManager = require('../wallet');
            const walletManager = new WalletManager();
            
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
            
            // Update user in database
            await this.database.updateUserWallet(userId, wallet.address, wallet.encryptedPrivateKey);
            
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

    async handleToggleTurboMode(ctx) {
        // Will be implemented in settings handlers
    }

    async handleConfirmTurboEnable(ctx) {
        // Will be implemented in settings handlers
    }


}

module.exports = NavigationHandlers;
