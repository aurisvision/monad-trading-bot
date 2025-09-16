// Trading Handlers
const { Markup } = require('telegraf');
const { parseCustomAmounts } = require('../utils');

class TradingHandlers {
    constructor(bot, database, tradingEngine, monorailAPI, monitoring, walletManager, portfolioService, redis, cacheService = null, transactionSpeedOptimizer = null) {
        this.bot = bot;
        this.database = database;
        this.tradingEngine = tradingEngine;
        this.monorailAPI = monorailAPI;
        this.monitoring = monitoring;
        this.walletManager = walletManager;
        this.portfolioService = portfolioService;
        this.redis = redis;
        this.cacheService = cacheService;
        this.transactionSpeedOptimizer = transactionSpeedOptimizer;
    }

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

    async handleBuyAmount(ctx) {
        await ctx.answerCbQuery();
        const amount = ctx.match[1];
        
        try {
            // Get user state to find the selected token - prioritize cache
            let userState;
            if (this.cacheService) {
                userState = await this.cacheService.get('user_state', ctx.from.id, async () => {
                    return await this.database.getUserState(ctx.from.id);
                });
            } else {
                userState = await this.database.getUserState(ctx.from.id);
            }
            
            if ((userState?.state !== 'token_selected' && userState?.state !== 'buy_token') || !userState?.data?.tokenAddress) {
                return ctx.reply('❌ Token selection expired. Please try again.');
            }
            
            const tokenAddress = userState.data.tokenAddress;
            
            // Get token info for confirmation
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            if (!tokenInfo.success) {
                return ctx.reply('❌ Token not found. Please try again.');
            }
            
            // Get user's current MON balance from cache
            let balanceText = '_Loading..._';
            try {
                // Get user - prioritize cache for instant access
                let user;
                if (this.cacheService) {
                    user = await this.cacheService.get('user', ctx.from.id, async () => {
                        return await this.database.getUser(ctx.from.id);
                    });
                } else {
                    user = await this.database.getUser(ctx.from.id);
                }
                if (user && user.wallet_address) {
                    const monBalance = await this.monorailAPI.getMONBalance(user.wallet_address);
                    if (monBalance && monBalance.success && monBalance.balanceFormatted) {
                        balanceText = `**${parseFloat(monBalance.balanceFormatted).toFixed(4)} MON**`;
                    } else if (monBalance && monBalance.balance) {
                        balanceText = `**${parseFloat(monBalance.balance).toFixed(4)} MON**`;
                    }
                }
            } catch (error) {
                this.monitoring.logError('Failed to get MON balance for purchase confirmation', error);
                balanceText = '_Unable to load_';
            }
            
            const confirmText = `🛒 ***Purchase Confirmation***

📋 ***Token Details:***
• ***Name:*** _${tokenInfo.token.name}_
• ***Symbol:*** **${tokenInfo.token.symbol}**
• ***Amount:*** **${amount} MON**

💼 ***Your Balance:*** ${balanceText}

_Proceed with the purchase?_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirm', `confirm_buy_${tokenAddress}_${amount}`)],
                [Markup.button.callback('🔙 Back', 'buy')]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

            // Update user state with purchase details
            await this.database.setUserState(ctx.from.id, 'confirming_buy', {
                tokenAddress,
                amount: parseFloat(amount),
                tokenInfo: tokenInfo.token
            });
        } catch (error) {
            console.error('Error in handleBuyAmount:', error);
            await ctx.reply('❌ An error occurred. Please try again.');
        }
    }

    async handleCustomBuy(ctx) {
        await ctx.answerCbQuery();
        
        const userId = ctx.from.id;
        const currentState = await this.database.getUserState(userId);
        
        if (currentState && currentState.state === 'token_selected' && currentState.data) {
            await ctx.reply('🟣 *Enter the amount of MON you want to spend:*', { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('🟣 *Enter the amount of MON you want to spend:*', { parse_mode: 'Markdown' });
            await this.database.setUserState(userId, 'custom_buy');
        }
    }

    setupHandlers() {
        // Trading handlers
        this.bot.action('buy', async (ctx) => {
            await this.handleBuyInterface(ctx);
        });

        // Buy amount handlers
        this.bot.action(/^buy_amount_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleBuyAmount(ctx);
        });

        this.bot.action('buy_amount_custom', async (ctx) => {
            await this.handleCustomBuy(ctx);
        });

        // Buy confirmation handlers
        this.bot.action(/^confirm_buy_(.+)_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleConfirmBuy(ctx);
        });

        // Token selection handlers
        this.bot.action(/^buy_token_(.+)$/, async (ctx) => {
            await this.handleBuyTokenFromCategory(ctx);
        });

        // Sell handlers
        this.bot.action(/^sell:([A-Za-z0-9]+)$/, async (ctx) => {
            await this.handleSellFromNewPortfolio(ctx);
        });

        this.bot.action(/^sell_([A-Za-z0-9]+)$/, async (ctx) => {
            await this.handleSellFromPortfolio(ctx);
        });

        this.bot.action(/^sell_percentage_([A-Za-z0-9]+)_(\d+)$/, async (ctx) => {
            await this.handleSellPercentageSelection(ctx);
        });

        this.bot.action(/^sell_custom_([A-Za-z0-9]+)$/, async (ctx) => {
            await this.handleCustomSellPercentage(ctx);
        });

        // Confirmation handlers
        this.bot.action(/^confirm_buy_(.+)_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleConfirmBuy(ctx);
        });

        this.bot.action(/^confirm_portfolio_sell_([A-Za-z0-9]+)_(\d+)$/, async (ctx) => {
            await this.handleConfirmPortfolioSell(ctx);
        });

        this.bot.action('cancel_trade', async (ctx) => {
            await this.handleCancelTrade(ctx);
        });

        // Transfer handlers
        this.bot.action('transfer', async (ctx) => {
            await this.showTransferInterface(ctx);
        });

        this.bot.action(/^confirm_transfer_(.+)_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleConfirmTransfer(ctx);
        });
    }

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

    // Duplicate method removed - keeping only the first implementation

    async handleCustomBuy(ctx) {
        await ctx.answerCbQuery();
        
        // Get current user state to preserve token data
        const userId = ctx.from.id;
        const currentState = await this.database.getUserState(userId);
        
        // If we have token data from token_selected state, preserve it
        if (currentState && currentState.state === 'token_selected' && currentState.data) {
            await ctx.reply('🟣 *Enter the amount of MON you want to spend:*', { parse_mode: 'Markdown' });
            // Keep the same state but user can now input custom amount
            // Don't change the state, just let processCustomBuyAmount handle it
        } else {
            await ctx.reply('🟣 *Enter the amount of MON you want to spend:*', { parse_mode: 'Markdown' });
            await this.database.setUserState(userId, 'custom_buy');
        }
    }

    async handleBuyTokenFromCategory(ctx) {
        await ctx.answerCbQuery();
        const tokenAddress = ctx.match[1];
        
        // Token address validation
        
        // Validate token address
        if (!tokenAddress || tokenAddress === 'undefined') {
            return ctx.reply('❌ Invalid token address. Please try again.');
        }
        
        try {
            // Get token info to display in buy screen
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            if (!tokenInfo.success) {
                return ctx.reply('❌ Token not found. Please try again.');
            }
            
            // Clear any existing state and store token info for buy actions
            await this.database.clearUserState(ctx.from.id);
            await this.database.setUserState(ctx.from.id, 'token_selected', {
                tokenAddress: tokenAddress,
                tokenSymbol: tokenInfo.token.symbol || 'Unknown',
                tokenName: tokenInfo.token.name || 'Unknown Token'
            });
            
            // Get user settings for custom amounts - prioritize cache
            let settings;
            if (this.cacheService) {
                settings = await this.cacheService.get('user_settings', ctx.from.id, async () => {
                    return await this.database.getUserSettings(ctx.from.id);
                });
            } else {
                settings = await this.database.getUserSettings(ctx.from.id);
            }
            const amounts = parseCustomAmounts(settings.custom_buy_amounts);
            
            const buyText = `💰 *Buy ${tokenInfo.token.symbol}*

*Token:* ${tokenInfo.token.name} (${tokenInfo.token.symbol})
*Address:* \`${tokenAddress}\`

Select amount of MON to spend:`;
            
            const keyboard = Markup.inlineKeyboard([
                amounts.map(amount => Markup.button.callback(`${amount} MON`, `buy_amount_${amount}`)),
                [Markup.button.callback('📝 Custom Amount', 'buy_amount_custom')],
                [Markup.button.callback('🔙 Back', 'token_categories')]
            ]);
            
            await ctx.editMessageText(buyText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Buy token from category failed', error, { userId: ctx.from.id, tokenAddress });
            await ctx.reply('❌ Error loading token. Please try again.');
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
            let result;
            
            if (userSettings.turbo_mode) {
                // Use Turbo Mode for faster execution
                result = await this.tradingEngine.executeBuyTurbo(
                    user.wallet_address,
                    tokenAddress,
                    amount
                );
            } else {
                // Use regular buy method
                result = await this.tradingEngine.buyToken(
                    user.wallet_address,
                    tokenAddress,
                    amount
                );
            }

            if (result.success) {
                // Clear user state and cache after successful buy
                await this.database.clearUserState(userId);
                
                // Clear cache after successful transaction using CacheService
                if (this.cacheService) {
                    try {
                        await this.cacheService.invalidateAfterBuy(userId, user.wallet_address);
                        this.monitoring.logInfo('Cache cleared after successful buy transaction', { userId, txHash: result.txHash });
                    } catch (cacheError) {
                        this.monitoring.logError('Cache clear failed after buy', cacheError, { userId });
                    }
                } else if (this.redis) {
                    // Fallback to legacy cache clearing
                    try {
                        await Promise.all([
                            this.redis.del(`user:${userId}`),
                            this.redis.del(`balance:${userId}`),
                            this.redis.del(`portfolio:${userId}`),
                            this.redis.del(`main_menu:${userId}`),
                            this.redis.del(`mon_balance:${user.wallet_address}`)
                        ]);
                        this.monitoring.logInfo('Cache cleared after successful buy transaction (legacy)', { userId, txHash: result.txHash });
                    } catch (redisError) {
                        this.monitoring.logError('Cache clear failed after buy', redisError, { userId });
                    }
                }
                
                const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.txHash}`;
                
                // Show success message first
                await ctx.editMessageText(`[✅ Purchase Successful!](${explorerUrl})`, {
                    parse_mode: 'Markdown'
                });
                
                // Force refresh main menu data immediately after successful buy
                setTimeout(async () => {
                    try {
                        const navigationHandlers = this.bot.context.navigationHandlers;
                        if (navigationHandlers) {
                            await navigationHandlers.showWelcome(ctx, false, true); // Force refresh = true
                        }
                    } catch (refreshError) {
                        this.monitoring.logError('Auto refresh after buy failed', refreshError, { userId });
                    }
                }, 2000); // 2 second delay to allow transaction to propagate
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

    async handleCancelTrade(ctx) {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Trade cancelled.', { parse_mode: 'Markdown' });
        await this.database.clearUserState(ctx.from.id);
    }

    async showTransferInterface(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Get user's MON balance
            const userId = ctx.from.id;
            const user = await this.database.getUserByTelegramId(userId);
            
            if (!user) {
                await ctx.reply('❌ Please create a wallet first.');
                return;
            }

            // Get MON balance from cached data (Monorail API)
            let balance = 0;
            try {
                const balanceResult = await this.monorailAPI.getMONBalance(user.wallet_address, true); // Force refresh
                if (balanceResult && balanceResult.success) {
                    balance = parseFloat(balanceResult.balanceFormatted || balanceResult.balance || 0);
                } else {
                    // Fallback to direct RPC call
                    const rpcBalance = await this.walletManager.getBalance(user.wallet_address);
                    balance = parseFloat(rpcBalance || 0);
                }
            } catch (error) {

                // Final fallback
                try {
                    const rpcBalance = await this.walletManager.getBalance(user.wallet_address);
                    balance = parseFloat(rpcBalance || 0);
                } catch (fallbackError) {

                }
            }

            const transferText = `📤 **Transfer MON**

💰 **Your Balance:** *${balance.toFixed(4)} MON*

Enter the recipient address:

**Example:** \`0x1234...5678\`

⚠️ **Note:** Make sure you have enough MON for gas fees (~0.001 MON)`;

            await ctx.reply(transferText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "0x1234...5678"
                }
            });

            // Set user state for transfer address input
            await this.database.setUserState(ctx.from.id, 'awaiting_transfer_address', {});
            
        } catch (error) {
            this.monitoring.logError('Transfer interface failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading transfer interface.');
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
                await ctx.editMessageText('❌ No wallet found.');
                return;
            }

            // Execute transfer
            const result = await this.tradingEngine.transferMON(user.wallet_address, address, amount);
            
            if (result.success) {
                // Clear cache after successful transfer using CacheService
                if (this.cacheService) {
                    try {
                        await this.cacheService.invalidateAfterTransfer(userId, null, user.wallet_address, null);
                        this.monitoring.logInfo('Cache cleared after successful transfer', { userId });
                    } catch (cacheError) {
                        this.monitoring.logError('Cache clear failed after transfer', cacheError, { userId });
                    }
                } else if (this.redis) {
                    // Fallback to legacy cache clearing
                    try {
                        await Promise.all([
                            this.redis.del(`user:${userId}`),
                            this.redis.del(`balance:${userId}`),
                            this.redis.del(`main_menu:${userId}`),
                            this.redis.del(`mon_balance:${user.wallet_address}`)
                        ]);
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

Please check the address and try again.`, {
                    parse_mode: 'Markdown'
                });
            }

        } catch (error) {
            this.monitoring.logError('Confirm transfer failed', error, { userId: ctx.from.id });
            await ctx.editMessageText('❌ Transfer failed. Please try again.');
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
            
            if (!token) {
                // Token not found in portfolio
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

            const sellText = `💸 *Sell ${tokenSymbol}*

🪙 *Token:* ${token.name} (${tokenSymbol})
💰 *Balance:* \`${balance.toFixed(6)}\`
🏦 *Value:* \`${monValue.toFixed(4)} MON\`

*Choose sell percentage:*`;

            // Get user's custom sell percentages
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            let customPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            
            // Handle case where custom_sell_percentages might be null or not a string
            if (!customPercentages || typeof customPercentages !== 'string') {
                customPercentages = '25,50,75,100';
            }
            
            const percentagesArray = customPercentages.split(',');

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`${percentagesArray[0]?.trim() || '25'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[0]?.trim() || '25'}`),
                    Markup.button.callback(`${percentagesArray[1]?.trim() || '50'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[1]?.trim() || '50'}`)
                ],
                [
                    Markup.button.callback(`${percentagesArray[2]?.trim() || '75'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[2]?.trim() || '75'}`),
                    Markup.button.callback(`${percentagesArray[3]?.trim() || '100'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[3]?.trim() || '100'}`)
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

    async handleSellFromPortfolio(ctx) {
        // Legacy handler - redirect to new format
        const tokenSymbol = ctx.match[1];
        ctx.match = [null, tokenSymbol]; // Reformat match for new handler
        await this.handleSellFromNewPortfolio(ctx);
    }

    async handleSellPercentageSelection(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const tokenSymbol = ctx.match[1];
            const percentage = parseInt(ctx.match[2]);
            
            // Get user state to find the selected token
            const userState = await this.database.getUserState(userId);
            if (!userState || userState.state !== 'selling_token' || !userState.data) {
                return ctx.reply('❌ Token selection expired. Please try again.');
            }
            
            const tokenInfo = userState.data;
            const balance = parseFloat(tokenInfo.balance || '0');
            const sellAmount = (balance * percentage) / 100;
            const monValue = parseFloat(tokenInfo.mon_value || '0');
            const expectedMON = (monValue * percentage) / 100;
            
            const confirmText = `💸 *Confirm Sale*

🪙 *Token:* ${tokenInfo.name} (${tokenInfo.symbol})
💰 *Selling:* ${sellAmount.toFixed(6)} ${tokenInfo.symbol} (${percentage}%)
💵 *Expected MON output:* ~${expectedMON.toFixed(4)} MON

*Proceed with the sale?*`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirm Sale', `confirm_portfolio_sell_${tokenSymbol}_${percentage}`)],
                [Markup.button.callback('🔙 Back', `sell:${tokenSymbol}`)]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Sell percentage selection failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing sell percentage. Please try again.');
        }
    }

    async handleCustomSellPercentage(ctx) {
        try {
            await ctx.answerCbQuery();
            const tokenSymbol = ctx.match[1];
            
            await ctx.reply('🟣 *Enter the percentage you want to sell (1-100):*', { parse_mode: 'Markdown' });
            await this.database.setUserState(ctx.from.id, 'custom_sell_percentage', { tokenSymbol });
            
        } catch (error) {
            this.monitoring.logError('Custom sell percentage failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing custom sell. Please try again.');
        }
    }

    async handleConfirmPortfolioSell(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const tokenSymbol = ctx.match[1];
            const percentage = parseInt(ctx.match[2]);
            
            await ctx.editMessageText('🔄 Processing sale...', { parse_mode: 'Markdown' });
            
            // Get user state to find the selected token
            const userState = await this.database.getUserState(userId);
            if (!userState || userState.state !== 'selling_token' || !userState.data) {
                return ctx.editMessageText('❌ Token selection expired. Please try again.');
            }
            
            const tokenInfo = userState.data;
            const tokenAddress = tokenInfo.address;
            
            if (!tokenAddress) {
                return ctx.editMessageText('❌ Token address not found. Please try again.');
            }
            
            // Calculate actual token amount to sell based on percentage
            const balance = parseFloat(tokenInfo.balance || '0');
            // Use 99.99% for 100% to avoid balance precision issues
            const adjustedPercentage = percentage === 100 ? 99.99 : percentage;
            const sellAmount = (balance * adjustedPercentage) / 100;
            
            // Execute sell transaction with calculated amount
            const result = await this.tradingEngine.executeSell(userId, tokenAddress, sellAmount);
            
            if (result.success) {
                // Get user data for wallet address
                const user = await this.database.getUser(userId);
                
                // Clear cache after successful sell using CacheService
                if (this.cacheService && user) {
                    try {
                        await this.cacheService.invalidateAfterSell(userId, user.wallet_address);
                        this.monitoring.logInfo('Cache cleared after successful sell transaction', { userId });
                    } catch (cacheError) {
                        this.monitoring.logError('Cache clear failed after sell', cacheError, { userId });
                    }
                } else if (this.redis) {
                    // Fallback to legacy cache clearing
                    try {
                        await Promise.all([
                            this.redis.del(`balance:${userId}`),
                            this.redis.del(`portfolio:${userId}`),
                            this.redis.del(`user:${userId}`),
                            this.redis.del(`main_menu:${userId}`)
                        ]);
                    } catch (redisError) {
                        this.monitoring.logError('Cache clear failed after sell', redisError, { userId });
                    }
                }
                
                const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.txHash}`;
                await ctx.editMessageText(`[✅ Sale Completed!](${explorerUrl})`, {
                    parse_mode: 'Markdown'
                });
                
                // Force refresh main menu data immediately after successful sell
                setTimeout(async () => {
                    try {
                        const navigationHandlers = this.bot.context.navigationHandlers;
                        if (navigationHandlers) {
                            await navigationHandlers.showWelcome(ctx, false, true); // Force refresh = true
                        }
                    } catch (refreshError) {
                        this.monitoring.logError('Auto refresh after sell failed', refreshError, { userId });
                    }
                }, 2000); // 2 second delay to allow transaction to propagate
            } else {
                await ctx.editMessageText(`❌ *Sale Failed*\n\n${result.error}\n\nPlease try again.`, {
                    parse_mode: 'Markdown'
                });
            }
            
            // Clear user state
            await this.database.clearUserState(userId);
            
        } catch (error) {
            this.monitoring.logError('Confirm portfolio sell failed', error, { userId: ctx.from.id });
            await ctx.editMessageText('❌ Transaction failed. Please try again.');
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
                    // Clear cache after successful turbo buy using CacheService
                    if (this.cacheService) {
                        try {
                            await this.cacheService.invalidateAfterBuy(userId, user.wallet_address);
                            this.monitoring.logInfo('Cache cleared after successful turbo buy', { userId });
                        } catch (cacheError) {
                            this.monitoring.logError('Cache clear failed after turbo buy', cacheError, { userId });
                        }
                    } else if (this.redis) {
                        // Fallback to legacy cache clearing
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
            let wallet;
            try {
                wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);
            } catch (walletError) {
                if (walletError.message.includes('Wallet decryption failed')) {
                    await ctx.editMessageText(
                        '❌ *Wallet Decryption Failed*\n\n' +
                        '🔐 Your wallet encryption key has changed or is corrupted.\n' +
                        '🔄 Please regenerate your wallet using /start\n\n' +
                        '⚠️ This will create a new wallet address.',
                        { parse_mode: 'Markdown' }
                    );
                    return;
                }
                throw walletError;
            }
            
            const balance = await this.walletManager.getBalance(wallet.address);
            const requiredAmount = parseFloat(amount);
            const gasBuffer = 0.05;
            
            if (parseFloat(balance) < (requiredAmount + gasBuffer)) {
                await ctx.editMessageText(
                    `❌ *Insufficient Balance*\n\n` +
                    `💰 Current: ${balance} MON\n` +
                    `💸 Required: ${requiredAmount} MON\n` +
                    `⛽ Gas buffer: ${gasBuffer} MON\n` +
                    `📊 Total needed: ${(requiredAmount + gasBuffer).toFixed(4)} MON\n\n` +
                    `Please add more MON to your wallet or try a smaller amount.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // Execute the buy transaction
            const result = await this.tradingEngine.executeBuy(userId, tokenAddress, parseFloat(amount));
            
            if (result.success) {
                // Clear cache after successful transaction using CacheService
                if (this.cacheService) {
                    try {
                        await this.cacheService.invalidateAfterBuy(userId, user.wallet_address);
                        this.monitoring.logInfo('Cache cleared after successful buy transaction', { userId, txHash: result.txHash });
                    } catch (cacheError) {
                        this.monitoring.logError('Cache clear failed after buy', cacheError, { userId });
                    }
                } else if (this.redis) {
                    // Fallback to legacy cache clearing
                    try {
                        await Promise.all([
                            this.redis.del(`balance:${userId}`),
                            this.redis.del(`portfolio:${userId}`),
                            this.redis.del(`user:${userId}`),
                            this.redis.del(`main_menu:${userId}`),
                            this.redis.del(`mon_balance:${user.wallet_address}`)
                        ]);
                        this.monitoring.logInfo('Cache cleared after successful buy transaction (legacy)', { userId, txHash: result.txHash });
                    } catch (redisError) {
                        this.monitoring.logError('Cache clear failed after buy', redisError, { userId });
                    }
                }
                
                const explorerUrl = `https://testnet.monadexplorer.com/tx/${result.txHash}`;
                await ctx.editMessageText(`[✅ Purchase Successful!](${explorerUrl})`, {
                    parse_mode: 'Markdown'
                });
            } else {
                await ctx.editMessageText(`❌ *Purchase Failed*\n\n${result.error}\n\nPlease try again or contact support.`, {
                    parse_mode: 'Markdown'
                });
            }

        } catch (error) {
            this.monitoring.logError('Confirm buy failed', error, { userId: ctx.from.id });
            await ctx.editMessageText('❌ Transaction failed. Please try again.');
        }
    }
}

module.exports = TradingHandlers;
