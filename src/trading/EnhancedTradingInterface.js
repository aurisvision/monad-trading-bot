/**
 * Enhanced Trading Interface
 * Uses BaseHandler and UserService to eliminate code duplication
 * 
 * SAFETY: This is a NEW interface that doesn't replace the existing one
 * The old TradingInterface.js remains untouched
 */

const { Markup } = require('telegraf');
const BaseHandler = require('../core/BaseHandler');
const UserService = require('../services/UserService');

class EnhancedTradingInterface extends BaseHandler {
    constructor(dependencies) {
        super(dependencies);
        
        // Initialize UserService
        this.userService = new UserService(
            this.database,
            this.cacheService,
            this.monitoring
        );
        
        // Additional dependencies specific to trading
        this.UnifiedTradingEngine = dependencies.UnifiedTradingEngine;
        this.TradingConfig = dependencies.TradingConfig;
        
        // Trading-specific metrics
        this.tradingMetrics = {
            buyRequests: 0,
            sellRequests: 0,
            confirmations: 0,
            cancellations: 0,
            successfulTrades: 0,
            failedTrades: 0
        };
        
        // Trading states
        this.TRADING_STATES = {
            WAITING_BUY_AMOUNT: 'waiting_buy_amount',
            WAITING_CUSTOM_AMOUNT: 'waiting_custom_amount',
            WAITING_TOKEN_ADDRESS: 'waiting_token_address',
            CONFIRMING_TRADE: 'confirming_trade'
        };
    }

    /**
     * Setup all trading handlers
     */
    setupHandlers() {
        if (!this.bot) return;

        // Main trading handlers
        this.bot.action('buy', async (ctx) => {
            await this.handleBuy(ctx);
        });

        this.bot.action('portfolio', async (ctx) => {
            await this.handlePortfolio(ctx);
        });

        // Buy amount handlers
        this.bot.action(/^buy_amount_(.+)$/, async (ctx) => {
            await this.handleBuyAmount(ctx);
        });

        this.bot.action('buy_amount_custom', async (ctx) => {
            await this.handleBuyAmountCustom(ctx);
        });

        // Confirmation handlers
        this.bot.action(/^confirm_buy_(.+)_(\d+\.?\d*)$/, async (ctx) => {
            await this.handleConfirmBuy(ctx);
        });

        // Token-specific buy handler
        this.bot.action(/^buy_token_(.+)$/, async (ctx) => {
            await this.handleBuyToken(ctx);
        });

        // Sell handlers
        this.bot.action(/^sell:([A-Za-z0-9]+)$/, async (ctx) => {
            await this.handleSell(ctx);
        });

        this.bot.action(/^sell_percentage_([A-Za-z0-9]+)_(\d+)$/, async (ctx) => {
            await this.handleSellPercentage(ctx);
        });

        // Cancel handler
        this.bot.action('cancel_trade', async (ctx) => {
            await this.handleCancelTrade(ctx);
        });

        this.logInfo('Enhanced trading handlers setup completed');
    }

    /**
     * Handle buy main menu
     */
    async handleBuy(ctx) {
        try {
            this.tradingMetrics.buyRequests++;
            
            await ctx.answerCbQuery();
            
            // Validate user and check access
            const { userId, user } = await this.validateUserAccess(ctx);
            
            // Check if user has wallet
            if (!user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ No wallet found. Please create a wallet first.', 
                    false
                );
            }

            // Track user activity
            await this.userService.trackUserActivity(userId);
            
            // Get wallet balance
            const walletData = await this.getWalletData(user.wallet_address);
            
            // Build buy menu
            const message = this.buildBuyMessage(walletData);
            const keyboard = this.buildBuyKeyboard();

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            this.logError('Failed to handle buy', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to load buy menu. Please try again.', 
                true
            );
        }
    }

    /**
     * Get wallet data for trading
     */
    async getWalletData(walletAddress) {
        try {
            // Try cache first
            const cached = await this.getCacheData('wallet_data', walletAddress);
            if (cached) {
                return cached;
            }

            let walletData = { address: walletAddress };

            // Get balance
            try {
                if (this.monorailAPI?.getWalletBalance) {
                    walletData.balance = await this.monorailAPI.getWalletBalance(walletAddress);
                }
            } catch (balanceError) {
                this.logWarn('Failed to get wallet balance', { 
                    walletAddress, 
                    error: balanceError.message 
                });
            }

            // Get portfolio
            try {
                if (this.monorailAPI?.getPortfolio) {
                    walletData.portfolio = await this.monorailAPI.getPortfolio(walletAddress);
                }
            } catch (portfolioError) {
                this.logWarn('Failed to get portfolio', { 
                    walletAddress, 
                    error: portfolioError.message 
                });
            }

            // Cache for 30 seconds
            await this.setCacheData('wallet_data', walletAddress, walletData, 30);
            
            return walletData;
            
        } catch (error) {
            this.logError('Failed to get wallet data', { 
                walletAddress, 
                error: error.message 
            });
            return { address: walletAddress, error: error.message };
        }
    }

    /**
     * Build buy message
     */
    buildBuyMessage(walletData) {
        let message = '💰 <b>Buy Tokens</b>\n\n';
        
        if (walletData.balance) {
            message += `💳 <b>Available Balance:</b> ${walletData.balance.formatted || 'Loading...'} MON\n\n`;
        }
        
        message += '🎯 <b>Quick Buy Options:</b>\n';
        message += '• Choose a preset amount\n';
        message += '• Enter custom amount\n';
        message += '• Buy specific token\n\n';
        
        message += '📊 Select buy amount or browse tokens:';
        
        return message;
    }

    /**
     * Build buy keyboard
     */
    buildBuyKeyboard() {
        const amounts = ['0.1', '0.5', '1', '5', '10'];
        
        const amountButtons = amounts.map(amount => 
            Markup.button.callback(`${amount} MON`, `buy_amount_${amount}`)
        );
        
        // Split into rows of 2
        const amountRows = [];
        for (let i = 0; i < amountButtons.length; i += 2) {
            amountRows.push(amountButtons.slice(i, i + 2));
        }
        
        return Markup.inlineKeyboard([
            ...amountRows,
            [
                Markup.button.callback('💎 Custom Amount', 'buy_amount_custom')
            ],
            [
                Markup.button.callback('📊 Browse Tokens', 'token_categories'),
                Markup.button.callback('📈 Portfolio', 'portfolio')
            ],
            [
                Markup.button.callback('🏠 Main Menu', 'main')
            ]
        ]);
    }

    /**
     * Handle buy amount selection
     */
    async handleBuyAmount(ctx) {
        try {
            const match = ctx.callbackQuery.data.match(/^buy_amount_(.+)$/);
            if (!match) return;

            const amount = match[1];
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId } = await this.validateUserAccess(ctx);
            
            // Set state for token address input
            await this.userService.setUserState(userId, this.TRADING_STATES.WAITING_TOKEN_ADDRESS, {
                amount: amount,
                action: 'buy'
            });
            
            const message = `💰 <b>Buy ${amount} MON Worth of Tokens</b>\n\n` +
                           '📝 Please send the token address you want to buy:\n\n' +
                           '💡 <b>Tips:</b>\n' +
                           '• Paste the full token contract address\n' +
                           '• Make sure it\'s a valid Monad token\n' +
                           '• Double-check the address for accuracy\n\n' +
                           '🔍 <b>Example:</b>\n' +
                           '<code>0x1234567890abcdef1234567890abcdef12345678</code>';

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('📊 Browse Tokens', 'token_categories')
                    ],
                    [
                        Markup.button.callback('❌ Cancel', 'buy')
                    ]
                ])
            });
            
        } catch (error) {
            this.logError('Failed to handle buy amount', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to process buy amount. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle custom buy amount
     */
    async handleBuyAmountCustom(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId } = await this.validateUserAccess(ctx);
            
            // Set state for custom amount input
            await this.userService.setUserState(userId, this.TRADING_STATES.WAITING_CUSTOM_AMOUNT);
            
            const message = '💎 <b>Custom Buy Amount</b>\n\n' +
                           '📝 Please send the amount of MON you want to spend:\n\n' +
                           '💡 <b>Examples:</b>\n' +
                           '• <code>0.1</code> (for 0.1 MON)\n' +
                           '• <code>2.5</code> (for 2.5 MON)\n' +
                           '• <code>100</code> (for 100 MON)\n\n' +
                           '⚠️ <b>Note:</b>\n' +
                           '• Minimum: 0.01 MON\n' +
                           '• Maximum: Your available balance\n' +
                           '• Use decimal point (.) for fractions';

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('❌ Cancel', 'buy')
                    ]
                ])
            });
            
        } catch (error) {
            this.logError('Failed to handle custom buy amount', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to process custom amount. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle buy token (from categories)
     */
    async handleBuyToken(ctx) {
        try {
            const match = ctx.callbackQuery.data.match(/^buy_token_(.+)$/);
            if (!match) return;

            const tokenAddress = match[1];
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId } = await this.validateUserAccess(ctx);
            
            // Get token information
            const tokenInfo = await this.getTokenInfo(tokenAddress);
            
            if (!tokenInfo) {
                return await this.sendError(ctx, 
                    '❌ Unable to load token information. Please try again.', 
                    false
                );
            }

            // Show buy amounts for this specific token
            const message = this.buildTokenBuyMessage(tokenInfo);
            const keyboard = this.buildTokenBuyKeyboard(tokenAddress);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            this.logError('Failed to handle buy token', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to process token buy. Please try again.', 
                true
            );
        }
    }

    /**
     * Get token information
     */
    async getTokenInfo(tokenAddress) {
        try {
            // Try cache first
            const cached = await this.getCacheData('token_info', tokenAddress);
            if (cached) {
                return cached;
            }

            // Mock token info for now - replace with actual API call
            const tokenInfo = {
                address: tokenAddress,
                symbol: 'TOKEN',
                name: 'Test Token',
                price: '$0.001',
                marketCap: '$1M',
                volume24h: '$100K'
            };

            // Cache for 2 minutes
            await this.setCacheData('token_info', tokenAddress, tokenInfo, 120);
            
            return tokenInfo;
            
        } catch (error) {
            this.logError('Failed to get token info', { 
                tokenAddress, 
                error: error.message 
            });
            return null;
        }
    }

    /**
     * Build token buy message
     */
    buildTokenBuyMessage(tokenInfo) {
        return `💰 <b>Buy ${tokenInfo.symbol}</b>\n\n` +
               `📊 <b>Token Info:</b>\n` +
               `• <b>Name:</b> ${tokenInfo.name}\n` +
               `• <b>Symbol:</b> ${tokenInfo.symbol}\n` +
               `• <b>Price:</b> ${tokenInfo.price}\n` +
               `• <b>Market Cap:</b> ${tokenInfo.marketCap}\n` +
               `• <b>24h Volume:</b> ${tokenInfo.volume24h}\n\n` +
               `🎯 <b>Select buy amount:</b>`;
    }

    /**
     * Build token buy keyboard
     */
    buildTokenBuyKeyboard(tokenAddress) {
        const amounts = ['0.1', '0.5', '1', '5', '10'];
        
        const amountButtons = amounts.map(amount => 
            Markup.button.callback(
                `${amount} MON`, 
                `confirm_buy_${tokenAddress}_${amount}`
            )
        );
        
        // Split into rows of 2
        const amountRows = [];
        for (let i = 0; i < amountButtons.length; i += 2) {
            amountRows.push(amountButtons.slice(i, i + 2));
        }
        
        return Markup.inlineKeyboard([
            ...amountRows,
            [
                Markup.button.callback('💎 Custom Amount', 'buy_amount_custom')
            ],
            [
                Markup.button.callback('📊 Categories', 'token_categories'),
                Markup.button.callback('❌ Cancel', 'buy')
            ]
        ]);
    }

    /**
     * Handle confirm buy
     */
    async handleConfirmBuy(ctx) {
        try {
            this.tradingMetrics.confirmations++;
            
            const match = ctx.callbackQuery.data.match(/^confirm_buy_(.+)_(\d+\.?\d*)$/);
            if (!match) return;

            const tokenAddress = match[1];
            const amount = parseFloat(match[2]);
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId, user } = await this.validateUserAccess(ctx);
            
            if (!user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ No wallet found. Please create a wallet first.', 
                    false
                );
            }

            // Get token and wallet info
            const [tokenInfo, walletData] = await Promise.all([
                this.getTokenInfo(tokenAddress),
                this.getWalletData(user.wallet_address)
            ]);

            if (!tokenInfo) {
                return await this.sendError(ctx, 
                    '❌ Unable to load token information.', 
                    false
                );
            }

            // Check balance
            if (walletData.balance && parseFloat(walletData.balance.value) < amount) {
                return await this.sendError(ctx, 
                    `❌ Insufficient balance. You have ${walletData.balance.formatted} MON but need ${amount} MON.`, 
                    false
                );
            }

            // Show confirmation
            const message = this.buildConfirmationMessage(tokenInfo, amount, walletData);
            const keyboard = this.buildConfirmationKeyboard(tokenAddress, amount);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            this.logError('Failed to handle confirm buy', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to process confirmation. Please try again.', 
                true
            );
        }
    }

    /**
     * Build confirmation message
     */
    buildConfirmationMessage(tokenInfo, amount, walletData) {
        return `🔍 <b>Confirm Purchase</b>\n\n` +
               `💰 <b>You're buying:</b>\n` +
               `• <b>Token:</b> ${tokenInfo.symbol} (${tokenInfo.name})\n` +
               `• <b>Amount:</b> ${amount} MON\n` +
               `• <b>Price:</b> ${tokenInfo.price}\n\n` +
               `👛 <b>Your wallet:</b>\n` +
               `• <b>Balance:</b> ${walletData.balance?.formatted || 'Loading...'} MON\n` +
               `• <b>After purchase:</b> ${walletData.balance ? (parseFloat(walletData.balance.value) - amount).toFixed(4) : 'Calculating...'} MON\n\n` +
               `⚠️ <b>Important:</b>\n` +
               `• Transaction fees will apply\n` +
               `• This action cannot be undone\n` +
               `• Make sure you trust this token\n\n` +
               `✅ <b>Ready to proceed?</b>`;
    }

    /**
     * Build confirmation keyboard
     */
    buildConfirmationKeyboard(tokenAddress, amount) {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Confirm Purchase', `execute_buy_${tokenAddress}_${amount}`)
            ],
            [
                Markup.button.callback('❌ Cancel', 'buy')
            ]
        ]);
    }

    /**
     * Handle portfolio view
     */
    async handlePortfolio(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId, user } = await this.validateUserAccess(ctx);
            
            if (!user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ No wallet found. Please create a wallet first.', 
                    false
                );
            }

            // Get portfolio data
            const portfolioData = await this.getPortfolioData(user.wallet_address);
            
            // Build portfolio message
            const message = this.buildPortfolioMessage(portfolioData);
            const keyboard = this.buildPortfolioKeyboard(portfolioData);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            this.logError('Failed to handle portfolio', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to load portfolio. Please try again.', 
                true
            );
        }
    }

    /**
     * Get portfolio data
     */
    async getPortfolioData(walletAddress) {
        try {
            // Try cache first
            const cached = await this.getCacheData('portfolio_data', walletAddress);
            if (cached) {
                return cached;
            }

            let portfolioData = { 
                walletAddress,
                tokens: [],
                totalValue: 0
            };

            // Get portfolio from API
            try {
                if (this.monorailAPI?.getPortfolio) {
                    const portfolio = await this.monorailAPI.getPortfolio(walletAddress);
                    if (portfolio) {
                        portfolioData = { ...portfolioData, ...portfolio };
                    }
                }
            } catch (portfolioError) {
                this.logWarn('Failed to get portfolio from API', { 
                    walletAddress, 
                    error: portfolioError.message 
                });
                
                // Use mock data
                portfolioData.tokens = [
                    { symbol: 'TOKEN1', balance: '1000', value: '$10', change24h: '+5%' },
                    { symbol: 'TOKEN2', balance: '500', value: '$25', change24h: '-2%' }
                ];
                portfolioData.totalValue = 35;
            }

            // Cache for 1 minute
            await this.setCacheData('portfolio_data', walletAddress, portfolioData, 60);
            
            return portfolioData;
            
        } catch (error) {
            this.logError('Failed to get portfolio data', { 
                walletAddress, 
                error: error.message 
            });
            return { walletAddress, tokens: [], totalValue: 0, error: error.message };
        }
    }

    /**
     * Build portfolio message
     */
    buildPortfolioMessage(portfolioData) {
        let message = '📈 <b>Your Portfolio</b>\n\n';
        
        if (portfolioData.error) {
            message += '❌ Unable to load portfolio data.\n\n';
            return message + 'Please try refreshing or contact support.';
        }
        
        if (portfolioData.tokens.length === 0) {
            message += '📭 <b>No tokens found</b>\n\n';
            message += 'Your portfolio is empty. Start trading to see your tokens here!';
            return message;
        }
        
        message += `💰 <b>Total Value:</b> $${portfolioData.totalValue}\n\n`;
        message += `📊 <b>Your Tokens:</b>\n\n`;
        
        portfolioData.tokens.forEach((token, index) => {
            message += `${index + 1}. <b>${token.symbol}</b>\n`;
            message += `   Balance: ${token.balance}\n`;
            message += `   Value: ${token.value}\n`;
            message += `   24h: ${token.change24h}\n\n`;
        });
        
        return message;
    }

    /**
     * Build portfolio keyboard
     */
    buildPortfolioKeyboard(portfolioData) {
        const buttons = [];
        
        // Add sell buttons for each token
        if (portfolioData.tokens && portfolioData.tokens.length > 0) {
            portfolioData.tokens.forEach(token => {
                buttons.push([
                    Markup.button.callback(`💸 Sell ${token.symbol}`, `sell:${token.symbol}`)
                ]);
            });
        }
        
        // Add navigation buttons
        buttons.push([
            Markup.button.callback('💰 Buy More', 'buy'),
            Markup.button.callback('🔄 Refresh', 'portfolio')
        ]);
        
        buttons.push([
            Markup.button.callback('🏠 Main Menu', 'main')
        ]);
        
        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Handle sell token
     */
    async handleSell(ctx) {
        try {
            this.tradingMetrics.sellRequests++;
            
            const match = ctx.callbackQuery.data.match(/^sell:([A-Za-z0-9]+)$/);
            if (!match) return;

            const tokenSymbol = match[1];
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId, user } = await this.validateUserAccess(ctx);
            
            // Get token balance
            const portfolioData = await this.getPortfolioData(user.wallet_address);
            const token = portfolioData.tokens.find(t => t.symbol === tokenSymbol);
            
            if (!token) {
                return await this.sendError(ctx, 
                    `❌ Token ${tokenSymbol} not found in your portfolio.`, 
                    false
                );
            }

            // Show sell options
            const message = this.buildSellMessage(token);
            const keyboard = this.buildSellKeyboard(tokenSymbol);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            this.logError('Failed to handle sell', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to process sell request. Please try again.', 
                true
            );
        }
    }

    /**
     * Build sell message
     */
    buildSellMessage(token) {
        return `💸 <b>Sell ${token.symbol}</b>\n\n` +
               `📊 <b>Your Holdings:</b>\n` +
               `• <b>Balance:</b> ${token.balance}\n` +
               `• <b>Current Value:</b> ${token.value}\n` +
               `• <b>24h Change:</b> ${token.change24h}\n\n` +
               `🎯 <b>Select sell percentage:</b>`;
    }

    /**
     * Build sell keyboard
     */
    buildSellKeyboard(tokenSymbol) {
        const percentages = [25, 50, 75, 100];
        
        const percentageButtons = percentages.map(percentage => 
            Markup.button.callback(
                `${percentage}%`, 
                `sell_percentage_${tokenSymbol}_${percentage}`
            )
        );
        
        // Split into rows of 2
        const percentageRows = [];
        for (let i = 0; i < percentageButtons.length; i += 2) {
            percentageRows.push(percentageButtons.slice(i, i + 2));
        }
        
        return Markup.inlineKeyboard([
            ...percentageRows,
            [
                Markup.button.callback('📈 Portfolio', 'portfolio'),
                Markup.button.callback('❌ Cancel', 'portfolio')
            ]
        ]);
    }

    /**
     * Handle sell percentage
     */
    async handleSellPercentage(ctx) {
        try {
            const match = ctx.callbackQuery.data.match(/^sell_percentage_([A-Za-z0-9]+)_(\d+)$/);
            if (!match) return;

            const tokenSymbol = match[1];
            const percentage = parseInt(match[2]);
            
            await ctx.answerCbQuery();
            
            // Show confirmation for sell
            const message = `🔍 <b>Confirm Sell</b>\n\n` +
                           `💸 <b>You're selling:</b>\n` +
                           `• <b>Token:</b> ${tokenSymbol}\n` +
                           `• <b>Percentage:</b> ${percentage}%\n\n` +
                           `⚠️ <b>Important:</b>\n` +
                           `• Transaction fees will apply\n` +
                           `• This action cannot be undone\n` +
                           `• Market price may change\n\n` +
                           `✅ <b>Ready to proceed?</b>`;

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Confirm Sell', `execute_sell_${tokenSymbol}_${percentage}`)
                    ],
                    [
                        Markup.button.callback('❌ Cancel', 'portfolio')
                    ]
                ])
            });
            
        } catch (error) {
            this.logError('Failed to handle sell percentage', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to process sell percentage. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle cancel trade
     */
    async handleCancelTrade(ctx) {
        try {
            this.tradingMetrics.cancellations++;
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId } = await this.validateUserAccess(ctx);
            
            // Clear any trading states
            await this.userService.clearUserState(userId);
            
            // Return to main menu
            await this.handleBuy(ctx);
            
        } catch (error) {
            this.logError('Failed to handle cancel trade', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to cancel trade. Please try again.', 
                true
            );
        }
    }

    /**
     * Get enhanced metrics
     */
    getEnhancedMetrics() {
        return {
            ...this.getMetrics(),
            trading: this.tradingMetrics,
            userService: this.userService.getMetrics(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Enhanced health check
     */
    async healthCheck() {
        try {
            const baseHealth = await super.healthCheck();
            const userServiceHealth = await this.userService.healthCheck();
            
            // Check trading engine availability
            const tradingEngineHealth = this.UnifiedTradingEngine ? 'available' : 'unavailable';
            
            return {
                status: baseHealth.status === 'healthy' && 
                       userServiceHealth.status === 'healthy' && 
                       tradingEngineHealth === 'available' 
                    ? 'healthy' : 'unhealthy',
                components: {
                    base: baseHealth,
                    userService: userServiceHealth,
                    tradingEngine: tradingEngineHealth,
                    tradingConfig: this.TradingConfig ? 'available' : 'unavailable'
                },
                metrics: this.getEnhancedMetrics(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = EnhancedTradingInterface;