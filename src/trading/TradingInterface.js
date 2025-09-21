/**
 * Trading Interface - Unified Trading Interface
 * Replaces all legacy trading handlers
 * Provides unified interface for all trading types with Telegram Bot
 */

const { Markup } = require('telegraf');
const UnifiedTradingEngine = require('./UnifiedTradingEngine');
const TradingConfig = require('./TradingConfig');

class TradingInterface {
    constructor(bot, dependencies) {
        this.bot = bot;
        this.engine = new UnifiedTradingEngine(dependencies);
        this.config = new TradingConfig();
        this.database = dependencies.database;
        this.monitoring = dependencies.monitoring;
        
        // Only setup handlers if bot is provided
        if (this.bot) {
            this.setupHandlers();
        }
    }

    /**
     * Setup all trading handlers
     */
    setupHandlers() {
        console.log('🎮 Setting up unified trading handlers...');
        
        // Buy interface handler
        this.bot.action('buy', async (ctx) => {
            await this.handleBuyInterface(ctx);
        });

        // Buy amount handlers - EXACT COPY from old system
        this.bot.action(/^buy_amount_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleBuyAmount(ctx);
        });

        this.bot.action('buy_amount_custom', async (ctx) => {
            await this.handleCustomBuy(ctx);
        });

        // Buy confirmation handlers
        this.bot.action(/^confirm_buy_(.+)_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleBuyConfirmation(ctx);
        });

        // Token selection handlers - EXACT COPY from old system
        this.bot.action(/^buy_token_(.+)$/, async (ctx) => {
            await this.handleBuyTokenFromCategory(ctx);
        });

        // Sell handlers - EXACT COPY from old system
        this.bot.action(/^sell:([A-Za-z0-9]+)$/, async (ctx) => {
            await this.handleSellFromNewPortfolio(ctx);
        });

        this.bot.action(/^sell_percentage_([A-Za-z0-9]+)_(\d+)$/, async (ctx) => {
            await this.handleSellPercentageSelection(ctx);
        });

        this.bot.action(/^confirm_portfolio_sell_([A-Za-z0-9]+)_(\d+)$/, async (ctx) => {
            await this.handleConfirmPortfolioSell(ctx);
        });

        console.log('✅ Unified trading handlers setup complete');
    }

    /**
     * Handle custom buy amount - EXACT COPY from old system
     */
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

    /**
     * Handle buy token from category - EXACT COPY from old system
     */
    async handleBuyTokenFromCategory(ctx) {
        await ctx.answerCbQuery();
        const tokenAddress = ctx.match[1];
        
        // Validate token address
        if (!tokenAddress || tokenAddress === 'undefined') {
            return ctx.reply('❌ Invalid token address. Please try again.');
        }
        
        try {
            // Get token info to display in buy screen
            const tokenInfo = await this.engine.dataManager.getCachedTokenInfo(tokenAddress);
            if (!tokenInfo || !tokenInfo.success) {
                return ctx.reply('❌ Token not found. Please try again.');
            }
            
            // Set user state with token selection
            await this.database.setUserState(ctx.from.id, 'token_selected', {
                tokenAddress: tokenAddress,
                tokenInfo: tokenInfo.token
            });
            
            const buyText = `💰 *Buy ${tokenInfo.token.symbol}*

📋 *Token Details:*
• *Name:* ${tokenInfo.token.name}
• *Symbol:* ${tokenInfo.token.symbol}
• *Address:* \`${tokenAddress}\`

💰 *Choose amount to buy:*`;

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('0.01 MON', `buy_amount_0.01`),
                    Markup.button.callback('0.1 MON', `buy_amount_0.1`)
                ],
                [
                    Markup.button.callback('0.5 MON', `buy_amount_0.5`),
                    Markup.button.callback('1 MON', `buy_amount_1`)
                ],
                [Markup.button.callback('📝 Custom Amount', 'buy_amount_custom')],
                [Markup.button.callback('🔙 Back', 'token_categories')]
            ]);
            
            await ctx.editMessageText(buyText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring?.logError('Buy token from category failed', error, { userId: ctx.from.id, tokenAddress });
            await ctx.reply('❌ Error loading token. Please try again.');
        }
    }

    /**
     * Handle sell from new portfolio - EXACT COPY from old system
     */
    async handleSellFromNewPortfolio(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const tokenSymbol = ctx.match[1];
            
            const user = await this.database.getUser(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            // Get token info from portfolio
            const walletBalance = await this.engine.monorailAPI.getWalletBalance(user.wallet_address);
            const token = walletBalance.find(t => t.symbol === tokenSymbol);
            
            if (!token || parseFloat(token.balance) === 0) {
                await ctx.reply('❌ No balance found for this token.');
                return;
            }

            // Set user state for selling
            await this.database.setUserState(userId, 'selling_token', {
                tokenSymbol: tokenSymbol,
                tokenAddress: token.address,
                balance: token.balance,
                tokenInfo: token
            });

            const sellText = `💸 *Sell ${tokenSymbol}*

📋 *Token Details:*
• *Symbol:* ${tokenSymbol}
• *Balance:* ${parseFloat(token.balance).toFixed(6)}

📊 *Choose percentage to sell:*`;

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('25%', `sell_percentage_${tokenSymbol}_25`),
                    Markup.button.callback('50%', `sell_percentage_${tokenSymbol}_50`)
                ],
                [
                    Markup.button.callback('75%', `sell_percentage_${tokenSymbol}_75`),
                    Markup.button.callback('100%', `sell_percentage_${tokenSymbol}_100`)
                ],
                [Markup.button.callback('🔙 Back to Portfolio', 'portfolio')]
            ]);

            await ctx.editMessageText(sellText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring?.logError('Sell from new portfolio failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing sell request. Please try again.');
        }
    }

    /**
     * Handle sell percentage selection - EXACT COPY from old system
     */
    async handleSellPercentageSelection(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const tokenSymbol = ctx.match[1];
            const percentage = parseInt(ctx.match[2]);
            
            // Get user state to find the selected token
            const userState = await this.database.getUserState(userId);
            if (!userState || userState.state !== 'selling_token' || !userState.data) {
                await this.database.clearUserState(userId);
                return ctx.reply('❌ Token selection expired. Please select a token again.');
            }

            const confirmText = `💸 *Confirm Sale*

📋 *Token:* ${tokenSymbol}
📊 *Percentage:* ${percentage}%
💰 *Amount:* ${(parseFloat(userState.data.balance) * percentage / 100).toFixed(6)}

_Proceed with the sale?_`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirm Sale', `confirm_portfolio_sell_${tokenSymbol}_${percentage}`)],
                [Markup.button.callback('🔙 Back', `sell:${tokenSymbol}`)]
            ]);

            await ctx.editMessageText(confirmText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring?.logError('Sell percentage selection failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error processing sell percentage. Please try again.');
        }
    }


    /**
     * Handle confirm portfolio sell - EXACT COPY from old system
     */
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
                await this.database.clearUserState(userId);
                return ctx.editMessageText('❌ Token selection expired. Please try again.');
            }
            
            const tokenAmount = (parseFloat(userState.data.balance) * percentage / 100).toString();
            
            // Get user settings to determine trade type
            const userSettings = await this.database.getUserSettings(userId);
            const tradeType = userSettings?.turbo_mode ? 'turbo' : 'normal';
            
            // Execute sell using unified engine
            const result = await this.engine.executeTrade({
                type: tradeType,
                action: 'sell',
                userId: userId,
                tokenAddress: userState.data.tokenAddress,
                amount: parseFloat(tokenAmount),
                ctx: ctx
            });
            
            if (result.success) {
                await this.sendSuccessMessage(ctx, result, 'sell');
            } else {
                await ctx.editMessageText(`❌ *Sale Failed*

${result.error}

Please try again.`, {
                    parse_mode: 'Markdown'
                });
            }
            
            // Clear user state
            await this.database.clearUserState(userId);
            
        } catch (error) {
            this.monitoring?.logError('Confirm portfolio sell failed', error, { userId: ctx.from.id });
            await ctx.editMessageText('❌ Transaction failed. Please try again.');
        }
    }

    /**
     * Handle buy amount selection - EXACT COPY from old system
     */
    async handleBuyAmount(ctx) {
        await ctx.answerCbQuery();
        const amount = ctx.match[1];
        
        try {
            // Get user state to find the selected token
            const userState = await this.database.getUserState(ctx.from.id);
            if (!userState || userState.state !== 'token_selected' || !userState.data) {
                await this.database.clearUserState(ctx.from.id);
                return ctx.reply('❌ Token selection expired. Please select a token again.');
            }
            
            const { tokenAddress } = userState.data;
            
            // Get token info
            const tokenInfo = await this.engine.dataManager.getCachedTokenInfo(tokenAddress);
            if (!tokenInfo || !tokenInfo.success) {
                return ctx.reply('❌ Token not found. Please try again.');
            }
            
            // Get user balance
            const user = await this.database.getUser(ctx.from.id);
            let balanceText = '_Loading..._';
            
            if (user?.wallet_address) {
                try {
                    const balance = await this.engine.dataManager.getCachedBalance(user.wallet_address);
                    if (balance !== null) {
                        balanceText = `**${parseFloat(balance).toFixed(4)} MON**`;
                    }
                } catch (error) {
                    this.monitoring?.logError('Failed to get balance for buy confirmation', error);
                    balanceText = '_Not available_';
                }
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

    /**
     * Handle buy confirmation - EXACT COPY from old system
     */
    async handleBuyConfirmation(ctx) {
        await ctx.answerCbQuery();
        const [, tokenAddress, amount] = ctx.match;
        
        await ctx.editMessageText('🔄 Processing purchase...', { parse_mode: 'Markdown' });
        
        try {
            const userId = ctx.from.id;
            
            // Get user settings to determine trade type
            const userSettings = await this.database.getUserSettings(userId);
            const tradeType = userSettings?.turbo_mode ? 'turbo' : 'normal';
            
            console.log(`🎯 Executing ${tradeType} buy for user ${userId}`);
            
            // Execute trade using unified engine
            const result = await this.engine.executeTrade({
                type: tradeType,
                action: 'buy',
                userId: userId,
                tokenAddress: tokenAddress,
                amount: parseFloat(amount),
                ctx: ctx
            });
            
            if (result.success) {
                await this.sendSuccessMessage(ctx, result, 'buy');
            } else {
                await this.sendErrorMessage(ctx, result.error);
            }

        } catch (error) {
            console.error('❌ Buy confirmation failed:', error);
            await ctx.editMessageText('❌ Transaction failed. Please try again.');
        }
    }


    /**
     * Handle buy interface - EXACT COPY from old system
     */
    async handleBuyInterface(ctx) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery();
        }
        
        const buyText = `💰 *Buy Tokens*

Please enter the token contract address you want to buy:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
        ]);

        const buyOptions = {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        };

        if (ctx.callbackQuery) {
            // For buttons - edit existing message
            try {
                await ctx.editMessageText(buyText, buyOptions);
            } catch (error) {
                // Fallback if edit fails
                await ctx.reply(buyText, buyOptions);
            }
        } else {
            // For commands - send new message
            await ctx.reply(buyText, buyOptions);
        }

        // Set user state to expect token address input
        await this.database.setUserState(ctx.from.id, 'awaiting_token_address', {});
    }


    /**
     * Send success message - Simplified version
     */
    async sendSuccessMessage(ctx, result, operationType) {
        let message = '';
        let explorerUrl = '';
        
        if (result.txHash) {
            explorerUrl = `https://testnet.monadexplorer.com/tx/${result.txHash}`;
        }
        
        switch(operationType) {
            case 'buy':
                message = `**✅ Buy Success!**`;
                break;
                
            case 'sell':
                message = `**✅ Sell Success!**`;
                break;
                
            case 'auto_buy':
                message = `**✅ Auto Buy Success!**`;
                break;
        }
        
        if (explorerUrl) {
            message += `\n\n[🔍 View Transaction](${explorerUrl})`;
        }
        
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    }

    /**
     * Send error message - EXACT COPY from old system
     */
    async sendErrorMessage(ctx, error) {
        let errorMessage = '❌ ***Transaction Failed***\n\n';
        
        // Improve error messages
        if (error.includes('insufficient balance') || error.includes('الرصيد غير كافي')) {
            errorMessage += '💰 ***Reason:*** Insufficient balance\n';
            errorMessage += '💡 ***Solution:*** Add more MON to your wallet';
        } else if (error.includes('Invalid token') || error.includes('عنوان العملة غير صحيح')) {
            errorMessage += '🪙 ***Reason:*** Invalid token address\n';
            errorMessage += '💡 ***Solution:*** Check the token address and try again';
        } else if (error.includes('Auto buy disabled') || error.includes('الشراء التلقائي غير مفعل')) {
            errorMessage += '🤖 ***Reason:*** Auto buy is disabled\n';
            errorMessage += '💡 ***Solution:*** Enable auto buy in settings';
        } else if (error.includes('slippage') || error.includes('انزلاق')) {
            errorMessage += '📈 ***Reason:*** Price changed during transaction\n';
            errorMessage += '💡 ***Solution:*** Try again or increase slippage tolerance';
        } else {
            errorMessage += `📝 ***Details:*** ${error}\n`;
            errorMessage += '💡 ***Solution:*** Try again or contact support';
        }
        
        await ctx.editMessageText(errorMessage, { parse_mode: 'Markdown' });
    }

    /**
     * Get interface statistics
     */
    getInterfaceStats() {
        return this.engine.getDetailedStats();
    }

    /**
     * Health check for the system
     */
    async healthCheck() {
        return await this.engine.healthCheck();
    }
}

module.exports = TradingInterface;
