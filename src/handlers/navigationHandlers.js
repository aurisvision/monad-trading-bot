// Navigation and UI Handlers
const { Markup } = require('telegraf');
const InterfaceUtils = require('../utils/interfaceUtils');
                    // Use direct API for immediate accurate balance
                    const directFetcher = new DirectTokenFetcher(this.monitoring);
                    const directTokenData = await directFetcher.getTokenBalanceWithRetry(
                        user.wallet_address,
                        tokenAddress,
                        tokenSymbol,
                        3
                    );
                    
                    // Generate message with direct API data
                    const directSellMessage = directFetcher.generateSellMessage(
                        directTokenData,
                        tokenAddress,
                        tradeResult
                    );
                    
                    // Update user state with direct data
                    await this.database.setUserState(userId, "selling_token", {
                        tokenAddress,
                        tokenSymbol,
                        tokenBalance: directTokenData.balance,
                        tokenValueUSD: directTokenData.valueUSD,
                        tokenValueMON: directTokenData.valueMON
                    });

                    await ctx.reply(directSellMessage, {
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
            await ctx.answerCbQuery("🔄 Refreshing with direct API...");
            
            const userId = ctx.from.id;
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) return;

            // Get token info
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            const tokenSymbol = tokenInfo?.token?.symbol || "Token";
            const tokenName = tokenInfo?.token?.name || "Unknown Token";
            
            // Use direct API for fresh data
            const directFetcher = new DirectTokenFetcher(this.monitoring);
            const directTokenData = await directFetcher.getDirectTokenBalance(
                user.wallet_address,
                tokenAddress,
                tokenSymbol
            );

            // Generate updated message
            const refreshedMessage = `**Token Sell Interface**

**Token Information:**
**Name:** ${tokenName}
**Symbol:** ${tokenSymbol}
**Contract:** `${tokenAddress}`

**Your Holdings:**
**Balance:** ${directTokenData.balance.toFixed(6)} ${tokenSymbol}
**Value (USD):** $${directTokenData.valueUSD.toFixed(4)}
**Value (MON):** ${directTokenData.valueMON.toFixed(4)} MON

*Last Updated: ${new Date().toLocaleTimeString()}*

Select percentage to sell:`;

            // Get user settings for buttons
            const userSettings = await this.database.getUserSettings(userId);
            const customPercentages = userSettings?.custom_sell_percentages || "25,50,75,100";
            const percentagesArray = customPercentages.split(",").map(p => parseInt(p.trim()));

            // Build buttons
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
            buttons.push([
                Markup.button.callback("🔄 Refresh", `refresh_sell_${tokenAddress}`),
                Markup.button.callback("📊 Portfolio", "portfolio")
            ]);
            buttons.push([Markup.button.callback("🏠 Main Menu", "back_to_main")]);

            const keyboard = Markup.inlineKeyboard(buttons);

            // Update user state
            await this.database.setUserState(userId, "selling_token", {
                tokenAddress,
                tokenSymbol,
                tokenBalance: directTokenData.balance,
                tokenValueUSD: directTokenData.valueUSD,
                tokenValueMON: directTokenData.valueMON
            });

            await ctx.editMessageText(refreshedMessage, {
                parse_mode: "Markdown",
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError("Refresh sell interface failed", error, {
                userId: ctx.from.id,
                tokenAddress
            });
            await ctx.answerCbQuery("❌ Failed to refresh data");
            
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