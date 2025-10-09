/**
 * Trading Interface - Unified Trading Interface
 * Replaces all legacy trading handlers
 * Provides unified interface for all trading types with Telegram Bot
 * Enhanced with professional messaging and real-time updates
 */
const { Markup } = require('telegraf');
const UnifiedTradingEngine = require('./UnifiedTradingEngine');
const FreshDataFetcher = require("../utils/freshDataFetcher");
const DirectTokenFetcher = require('../utils/directTokenFetcher');
const TradingConfig = require('./TradingConfig');
const RealTimeMessageUpdater = require('../utils/RealTimeMessageUpdater');
const ProfessionalMessageFormatter = require('../utils/ProfessionalMessageFormatter');
class TradingInterface {
    constructor(bot, dependencies) {
        this.bot = bot;
        this.engine = new UnifiedTradingEngine(dependencies);
        this.config = new TradingConfig();
        this.database = dependencies.database;
        this.monitoring = dependencies.monitoring;
        
        // Initialize professional messaging system
        this.messageUpdater = new RealTimeMessageUpdater(bot, {
            wsUrl: process.env.MONAD_WS_URL || 'wss://testnet-rpc.monad.xyz',
            enableRealTime: process.env.ENABLE_REALTIME_UPDATES !== 'false'
        });
        this.formatter = new ProfessionalMessageFormatter();
        
        // Only setup handlers if bot is provided
        if (this.bot) {
            this.setupHandlers();
        }
    }
    /**
     * Setup all trading handlers
     */
    setupHandlers() {
        // Buy interface handler
        this.bot.action('buy', async (ctx) => {
            await this.handleBuyInterface(ctx);
        });
        // Buy amount handlers - INSTANT EXECUTION (No confirmation)
        this.bot.action(/^buy_amount_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleBuyAmount(ctx);
        });
        this.bot.action('buy_amount_custom', async (ctx) => {
            await this.handleCustomBuy(ctx);
        });
        // Token selection handlers
        this.bot.action(/^buy_token_(.+)$/, async (ctx) => {
            await this.handleBuyTokenFromCategory(ctx);
        });
        // Sell handlers - INSTANT EXECUTION (No confirmation)
        this.bot.action(/^sell:([A-Za-z0-9]+)$/, async (ctx) => {
            await this.handleSellFromNewPortfolio(ctx);
        });
        this.bot.action(/^sell_percentage_([A-Za-z0-9]+)_(\d+)$/, async (ctx) => {
            await this.handleSellPercentageSelection(ctx);
        });
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
            
            // Get user's custom buy amounts
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            let customAmounts = userSettings?.custom_buy_amounts || '0.1,0.5,1,5';
            // Handle case where custom_buy_amounts might be null or not a string
            if (!customAmounts || typeof customAmounts !== 'string') {
                customAmounts = '0.1,0.5,1,5';
            }
            const amountsArray = customAmounts.split(',');
            
            // Set user state with token selection
            await this.database.setUserState(ctx.from.id, 'token_selected', {
                tokenAddress: tokenAddress,
                tokenInfo: tokenInfo.token
            });
            const buyText = `💎 *Buy ${tokenInfo.token.symbol}*

📊 *Token Information:*
• *Name:* ${tokenInfo.token.name}
• *Symbol:* ${tokenInfo.token.symbol}
• *Contract:* \`${tokenAddress}\`

_💡 Select your investment amount:_`;
            
            // Use custom buy amounts from user settings
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`${amountsArray[0]?.trim() || '0.1'} MON`, `buy_amount_${amountsArray[0]?.trim() || '0.1'}`), 
                    Markup.button.callback(`${amountsArray[1]?.trim() || '0.5'} MON`, `buy_amount_${amountsArray[1]?.trim() || '0.5'}`)
                ],
                [
                    Markup.button.callback(`${amountsArray[2]?.trim() || '1'} MON`, `buy_amount_${amountsArray[2]?.trim() || '1'}`), 
                    Markup.button.callback(`${amountsArray[3]?.trim() || '5'} MON`, `buy_amount_${amountsArray[3]?.trim() || '5'}`)
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
            
            // Get user's custom sell percentages
            const userSettings = await this.database.getUserSettings(userId);
            let customPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            // Handle case where custom_sell_percentages might be null or not a string
            if (!customPercentages || typeof customPercentages !== 'string') {
                customPercentages = '25,50,75,100';
            }
            const percentagesArray = customPercentages.split(',');
            
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
            const sellText = `📈 *Sell ${tokenSymbol}*

💼 *Your Holdings:*
• *Token:* ${tokenSymbol}
• *Balance:* ${parseFloat(token.balance).toFixed(6)}

_🎯 Select percentage to sell:_`;
            
            // Use custom sell percentages from user settings
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(`${percentagesArray[0]?.trim() || '25'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[0]?.trim() || '25'}`),
                    Markup.button.callback(`${percentagesArray[1]?.trim() || '50'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[1]?.trim() || '50'}`)
                ],
                [
                    Markup.button.callback(`${percentagesArray[2]?.trim() || '75'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[2]?.trim() || '75'}`),
                    Markup.button.callback(`${percentagesArray[3]?.trim() || '100'}%`, `sell_percentage_${tokenSymbol}_${percentagesArray[3]?.trim() || '100'}`)
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
     * Handle sell percentage selection - INSTANT EXECUTION (No confirmation)
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
            
            // Safety checks before execution
            const user = await this.database.getUser(userId);
            if (!user?.wallet_address) {
                return ctx.reply('❌ Wallet not found. Please create a wallet first.');
            }
            
            // Validate percentage
            if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
                return ctx.reply('❌ Invalid percentage. Please try again.');
            }
            
            const balance = parseFloat(userState.data.tokenBalance || userState.data.balance || 0);
            if (balance <= 0) {
                return ctx.reply('❌ No tokens to sell.');
            }
            
            // Use 99.99% for 100% to avoid precision issues with fees
            const effectivePercentage = percentage === 100 ? 99.99 : percentage;
            const tokenAmount = (balance * effectivePercentage / 100).toString();
            
            // Show processing message
            await ctx.editMessageText('🔄 Processing sale...', { parse_mode: 'Markdown' });
            
            // Get user settings to determine trade type
            const userSettings = await this.database.getUserSettings(userId);
            const tradeType = userSettings?.turbo_mode ? 'turbo' : 'normal';
            
            // Execute sell using unified engine
            const result = await this.engine.executeTrade({
                type: tradeType,
                action: 'sell',
                userId: userId,
                tokenAddress: userState.data.tokenAddress,
                amount: tokenAmount,
                percentage: effectivePercentage,
                ctx: ctx
            });
            
            // Clear user state
            await this.database.clearUserState(userId);
            
            if (result.success) {
                await this.sendSuccessMessage(ctx, result, 'sell');
            } else {
                await this.sendErrorMessage(ctx, result.error);
            }
            
        } catch (error) {
            this.monitoring?.logError('Sell percentage execution failed', error, { userId: ctx.from.id });
            await ctx.editMessageText('❌ Transaction failed. Please try again.');
        }
    }

    /**
     * Handle buy amount selection - INSTANT EXECUTION (No confirmation)
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
            const userId = ctx.from.id;
            
            // Safety checks before execution
            const user = await this.database.getUser(userId);
            if (!user?.wallet_address) {
                return ctx.reply('❌ Wallet not found. Please create a wallet first.');
            }
            
            // Get token info for validation
            const tokenInfo = await this.engine.dataManager.getCachedTokenInfo(tokenAddress);
            if (!tokenInfo || !tokenInfo.success) {
                return ctx.reply('❌ Token not found. Please try again.');
            }
            
            // Validate amount
            const buyAmount = parseFloat(amount);
            if (isNaN(buyAmount) || buyAmount <= 0) {
                return ctx.reply('❌ Invalid amount. Please try again.');
            }
            
            // Check user balance
            try {
                const balanceData = await this.engine.monorailAPI.getMONBalance(user.wallet_address, false);
                if (balanceData && balanceData.balance !== undefined) {
                    const balance = parseFloat(balanceData.balance);
                    if (!isNaN(balance) && balance < buyAmount) {
                        return ctx.reply(`❌ Insufficient balance. You have ${balance.toFixed(4)} MON but trying to spend ${buyAmount} MON.`);
                    }
                }
            } catch (error) {
                this.monitoring?.logError('Failed to check balance before buy', error);
                // Continue with transaction - balance will be checked by the blockchain
            }
            
            // Show processing message
            await ctx.editMessageText('🔄 Processing purchase...', { parse_mode: 'Markdown' });
            
            // Get user settings to determine trade type
            const userSettings = await this.database.getUserSettings(userId);
            const tradeType = userSettings?.turbo_mode ? 'turbo' : 'normal';
            
            // Execute trade using unified engine
            const result = await this.engine.executeTrade({
                type: tradeType,
                action: 'buy',
                userId: userId,
                tokenAddress: tokenAddress,
                amount: buyAmount,
                ctx: ctx
            });
            
            // Clear user state
            await this.database.clearUserState(userId);
            
            if (result.success) {
                await this.sendSuccessMessage(ctx, result, 'buy');
            } else {
                await this.sendErrorMessage(ctx, result.error);
            }
            
        } catch (error) {
            this.monitoring?.logError('Buy amount execution failed', error, { userId: ctx.from.id, amount });
            await ctx.editMessageText('❌ Transaction failed. Please try again.');
        }
    }

    /**
{{ ... }}
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
        try {
            let message;

            const successData = {
                txHash: result.txHash,
                tokenSymbol: result.tokenSymbol || 'Unknown',
                tokenName: result.tokenName || 'Unknown Token',
                tokenAddress: result.tokenAddress,
                amount: result.amount,
                monAmount: result.monAmount,
                tokenAmount: result.tokenAmount,
                actualTokenAmount: result.actualTokenAmount,
                expectedOutput: result.expectedOutput,
                monReceived: result.monReceived || result.expectedOutput || result.outputAmount || '0',
                gasUsed: result.gasUsed,
                effectiveGasPrice: result.effectiveGasPrice,
                timestamp: result.timestamp || Date.now(),
                priceImpact: result.priceImpact,
                slippage: result.slippage,
                mode: result.mode,
                tokenPrice: result.tokenPrice,
                route: result.route,
                executionTime: result.executionTime,
                isAutoBuy: operationType === 'auto_buy'
            };

            switch(operationType) {
                case 'buy':
                case 'auto_buy':
                    message = this.formatter.formatBuySuccess(successData);
                    break;
                case 'sell':
                    message = this.formatter.formatSellSuccess(successData);
                    break;
                default:
                    message = this.formatter.formatBuySuccess(successData);
            }

            await ctx.editMessageText(message, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

        } catch (error) {
            console.error('Error sending success message:', error);
            // Fallback to simple message
            await ctx.editMessageText(`✅ ${operationType} completed successfully!`, { 
                parse_mode: 'Markdown' 
            });
        }
    }
    /**
     * Send error message with professional formatting
     */
    async sendErrorMessage(ctx, error, operation = 'transaction', details = {}) {
        try {
            const message = this.formatter.formatError(error, operation, details);
            
            await ctx.editMessageText(message, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (sendError) {
            console.error('Error sending error message:', sendError);
            // Fallback to simple error message
            await ctx.editMessageText(`❌ Transaction failed: ${error}`, { 
                parse_mode: 'Markdown' 
            });
        }
    }
    /**
     * DEPRECATED: Show sell interface after successful buy (Manual + Turbo)
     * Now using unified showComprehensiveSellInterface from NavigationHandlers
     */
    async showSellInterfaceAfterBuy(ctx, tokenAddress, tradeResult) {
        try {
            const userId = ctx.from.id;
            
            // Get user for wallet address
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) return;

            // Get comprehensive token info and user balance
            const [tokenInfo, userSettings] = await Promise.all([
                this.engine.monorailAPI.getTokenInfo(tokenAddress),
                this.database.getUserSettings(userId)
            ]);

            const tokenSymbol = tokenInfo?.token?.symbol || 'Token';
            const tokenName = tokenInfo?.token?.name || 'Unknown Token';
            
            // Use direct API for accurate balance
            const directFetcher = new DirectTokenFetcher(this.monitoring);
            const directTokenData = await directFetcher.getTokenBalanceWithRetry(
                user.wallet_address,
                tokenAddress,
                tokenSymbol,
                3
            );
            
            const tokenBalance = directTokenData.balance;
            const tokenValueUSD = directTokenData.valueUSD;
            const tokenValueMON = directTokenData.valueMON;

            // Get user's custom sell percentages
            const customPercentages = userSettings?.custom_sell_percentages || '25,50,75,100';
            const percentagesArray = customPercentages.split(',').map(p => parseInt(p.trim()));

            // Professional sell interface message
            const sellMessage = `*${tokenName} | ${tokenSymbol}*
• Contract: \`${tokenAddress}\`

*💼 Your Holdings*
• Balance: ${tokenBalance.toFixed(6)} ${tokenSymbol}
• Value (USD): $${tokenValueUSD.toFixed(4)}
• Value (MON): ${tokenValueMON.toFixed(4)} MON

_💡 Use Refresh button to update your balance._

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
                    await ctx.reply(sellMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    });
                } catch (error) {
                    this.monitoring?.logError('Failed to send sell interface after buy', error, { 
                        userId, 
                        tokenAddress 
                    });
                }
            }, 8000); // 8 second delay for blockchain confirmation
            
        } catch (error) {
            this.monitoring?.logError('Sell interface after buy failed', error, { 
                userId: ctx.from.id, 
                tokenAddress 
            });
            // Don't throw - this is not critical
        }
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