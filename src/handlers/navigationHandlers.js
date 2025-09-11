// Navigation and UI Handlers
const { Markup } = require('telegraf');

class NavigationHandlers {
    constructor(bot, database, monorailAPI, monitoring, redis = null) {
        this.bot = bot;
        this.database = database;
        this.monorailAPI = monorailAPI;
        this.monitoring = monitoring;
        this.redis = redis;
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
        const welcomeText = `*🛸 Welcome to Area51!*
_The main area for real nads!_

To get started, you need to create or import a wallet:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Create New Wallet', 'generate_wallet')],
            [Markup.button.callback('📥 Import Existing Wallet', 'import_wallet')]
        ]);

        try {
            await ctx.replyWithMarkdown(welcomeText, keyboard);
        } catch (error) {
            this.monitoring.logError('Welcome new user failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error displaying welcome message.');
        }
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
                [Markup.button.callback('💰 Buy', 'buy')],
                [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
                [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
                [Markup.button.callback('❓ Help', 'help')]
            ]);

            // Try edit first, then fallback to delete+send
            try {
                await ctx.editMessageText(welcomeText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (editError) {
                try {
                    await ctx.deleteMessage();
                    await ctx.replyWithMarkdown(welcomeText, keyboard);
                } catch (deleteError) {
                    await ctx.replyWithMarkdown(welcomeText, keyboard);
                }
            }

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
                [Markup.button.callback('💰 Buy', 'buy')],
                [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
                [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
                [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
                [Markup.button.callback('❓ Help', 'help')]
            ]);

            try {
                if (ctx.callbackQuery) {
                    await ctx.editMessageText(welcomeText, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
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
        
        // Check if message contains a token address (anywhere in the text)
        const messageText = ctx.message.text.trim();
        const tokenAddressMatch = messageText.match(/0x[a-fA-F0-9]{40}/);
        if (tokenAddressMatch) {
            await this.processTokenAddress(ctx, tokenAddressMatch[0]);
            return;
        }

        if (!userState || userState.state === null) {
            await ctx.reply('Please use the menu buttons to interact with the bot.');
            return;
        }

        switch (userState.state) {
            case 'importing_wallet':
                await this.processWalletImport(ctx, ctx.message.text);
                break;
            case 'awaiting_token_address':
                await this.processTokenAddress(ctx, ctx.message.text);
                break;
            case 'custom_buy':
                await this.processCustomBuyAmount(ctx, ctx.message.text);
                break;
            case 'awaiting_buy_amount':
                await this.processCustomBuyAmount(ctx, ctx.message.text);
                break;
            default:
                await ctx.reply('Please use the menu buttons to interact with the bot.');
        }
    }

    // Placeholder methods that will be implemented in other handlers
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
            
            // Store token info in user state
            await this.database.setUserState(userId, 'awaiting_buy_amount', {
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

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('0.1 MON', 'buy_amount_0.1'), Markup.button.callback('0.5 MON', 'buy_amount_0.5')],
                [Markup.button.callback('1 MON', 'buy_amount_1'), Markup.button.callback('5 MON', 'buy_amount_5')],
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
                    await ctx.reply('❌ Invalid private key or mnemonic phrase. Please try again.');
                    return;
                }
            }
            
            // Update user in database
            await this.database.updateUserWallet(userId, wallet.address, wallet.encryptedPrivateKey);
            
            // Clear user state
            await this.database.clearUserState(userId);
            
            await ctx.reply(`✅ *Wallet Imported Successfully!*

🏠 *Address:* \`${wallet.address}\`

Your wallet has been imported and encrypted securely.`, {
                parse_mode: 'Markdown'
            });
            
            // Show main menu
            setTimeout(async () => {
                await this.showMainMenu(ctx);
            }, 2000);
            
        } catch (error) {
            this.monitoring.logError('Wallet import failed', error, { userId });
            await ctx.reply('❌ Error importing wallet. Please try again.');
        }
    }

    async processCustomBuyAmount(ctx, amountText) {
        const userId = ctx.from.id;
        
        try {
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
