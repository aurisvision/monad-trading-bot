const { Markup } = require('telegraf');

/**
 * Enhanced Inline Handlers for Area51 Trading Bot
 * Supports search and buy functionality via inline mode
 */
class InlineHandlers {
    constructor(bot, dependencies) {
        this.bot = bot;
        this.database = dependencies.database;
        this.monorailAPI = dependencies.monorailAPI;
        this.monitoring = dependencies.monitoring;
        this.redis = dependencies.redis;
        this.cacheService = dependencies.cacheService;
        this.tradingEngine = dependencies.tradingEngine;
        this.walletManager = dependencies.walletManager;
    }

    /**
     * Setup inline handlers
     */
    setupHandlers() {
        // Main inline query handler
        this.bot.on('inline_query', async (ctx) => {
            await this.handleInlineQuery(ctx);
        });

        // Handle chosen inline results for buy operations
        this.bot.on('chosen_inline_result', async (ctx) => {
            await this.handleChosenInlineResult(ctx);
        });

        console.log('✅ Enhanced inline handlers setup complete');
    }

    /**
     * Handle inline queries - supports search and buy commands
     */
    async handleInlineQuery(ctx) {
        try {
            const query = ctx.inlineQuery.query.trim();

            // If no query, show help
            if (!query || query.length < 2) {
                return await ctx.answerInlineQuery([{
                    type: 'article',
                    id: 'help',
                    title: '🔍 Area51 Inline Commands',
                    description: 'srch <token> - Search tokens | buy <token> <amount> - Buy tokens',
                    input_message_content: {
                        message_text: '🤖 *Area51 Inline Commands*\n\n🔍 `srch usdc` - Search for tokens\n💰 `buy usdc 5` - Buy tokens with MON\n\nExample: @MonAreaBot srch usdc',
                        parse_mode: 'Markdown'
                    }
                }]);
            }

            // Parse command and parameters
            const parts = query.split(' ');
            const command = parts[0].toLowerCase();

            switch (command) {
                case 'srch':
                case 'search':
                    const searchTerm = parts.slice(1).join(' ');
                    if (searchTerm.length < 1) {
                        return await ctx.answerInlineQuery([]);
                    }
                    await this.handleSearchCommand(ctx, searchTerm);
                    break;

                case 'buy':
                    if (parts.length < 3) {
                        return await ctx.answerInlineQuery([{
                            type: 'article',
                            id: 'buy_help',
                            title: '💰 Buy Command Format',
                            description: 'Usage: buy <token> <amount>',
                            input_message_content: {
                                message_text: '💰 *Buy Command Format*\n\nUsage: `buy <token> <amount>`\nExample: `buy usdc 5`\n\nThis will buy tokens using MON from your wallet.',
                                parse_mode: 'Markdown'
                            }
                        }]);
                    }
                    const tokenSymbol = parts[1];
                    const amount = parts[2];
                    await this.handleBuyCommand(ctx, tokenSymbol, amount);
                    break;

                default:
                    // Default to search if no command recognized
                    await this.handleSearchCommand(ctx, query);
                    break;
            }

        } catch (error) {
            this.monitoring?.logError('Inline query error', error, { userId: ctx.from?.id });
            await ctx.answerInlineQuery([]);
        }
    }

    /**
     * Handle search command with enhanced formatting
     */
    async handleSearchCommand(ctx, searchTerm) {
        try {
            // Get tokens from API
            const response = await this.monorailAPI.get('/tokens');
            if (!response?.data?.tokens) {
                return await ctx.answerInlineQuery([]);
            }

            // Filter tokens by search term
            const tokens = response.data.tokens.filter(token => 
                token.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                token.name?.toLowerCase().includes(searchTerm.toLowerCase())
            ).slice(0, 10);

            if (tokens.length === 0) {
                return await ctx.answerInlineQuery([{
                    type: 'article',
                    id: 'no_results',
                    title: '❌ No tokens found',
                    description: `No tokens found for "${searchTerm}"`,
                    input_message_content: {
                        message_text: `❌ No tokens found for "${searchTerm}"`
                    }
                }]);
            }

            // Create enhanced results with token info
            const results = await Promise.all(tokens.map(async (token, index) => {
                try {
                    // Get additional token info
                    const tokenInfo = await this.monorailAPI.getTokenInfo(token.address);
                    const formattedInfo = this.formatTokenInfo(token, tokenInfo);
                    
                    return {
                        type: 'article',
                        id: `search_${token.address}_${index}`,
                        title: `${token.symbol || 'Unknown'} - ${token.name || 'Unknown Token'}`,
                        description: `Price: ${tokenInfo?.token?.usd_per_token || 'N/A'} USD | ${token.address?.slice(0, 10)}...`,
                        input_message_content: {
                            message_text: formattedInfo,
                            parse_mode: 'Markdown'
                        },
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💰 Buy', url: `https://t.me/${process.env.BOT_USERNAME}?start=buy_${token.address}` },
                                { text: '📊 Chart', url: `https://testnet.monorail.xyz/token/${token.address}` }
                            ]]
                        }
                    };
                } catch (error) {
                    // Fallback to basic info if detailed fetch fails
                    return {
                        type: 'article',
                        id: `search_basic_${token.address}_${index}`,
                        title: `${token.symbol || 'Unknown'} - ${token.name || 'Unknown Token'}`,
                        description: `Address: ${token.address?.slice(0, 10)}...`,
                        input_message_content: {
                            message_text: `🪙 *${token.symbol || 'Unknown'}*\n📝 ${token.name || 'Unknown Token'}\n📍 \`${token.address}\``,
                            parse_mode: 'Markdown'
                        }
                    };
                }
            }));

            await ctx.answerInlineQuery(results);

        } catch (error) {
            this.monitoring?.logError('Search command error', error, { searchTerm });
            await ctx.answerInlineQuery([]);
        }
    }

    /**
     * Handle buy command
     */
    async handleBuyCommand(ctx, tokenSymbol, amount) {
        try {
            const userId = ctx.from.id;

            // Validate user first
            const user = await this.database.getUserByTelegramId(userId);
            if (!user || !user.wallet_address || user.wallet_address === 'pending_wallet_creation') {
                return await ctx.answerInlineQuery([{
                    type: 'article',
                    id: 'no_wallet',
                    title: '❌ Wallet Required',
                    description: 'Please set up your wallet first',
                    input_message_content: {
                        message_text: '❌ Please set up your wallet first using /start with @MonAreaBot'
                    }
                }]);
            }

            // Validate amount
            const buyAmount = parseFloat(amount);
            if (isNaN(buyAmount) || buyAmount <= 0) {
                return await ctx.answerInlineQuery([{
                    type: 'article',
                    id: 'invalid_amount',
                    title: '❌ Invalid Amount',
                    description: 'Please enter a valid amount',
                    input_message_content: {
                        message_text: '❌ Invalid amount. Please enter a valid number greater than 0.'
                    }
                }]);
            }

            // Find token by symbol
            const response = await this.monorailAPI.get('/tokens');
            if (!response?.data?.tokens) {
                return await ctx.answerInlineQuery([]);
            }

            const token = response.data.tokens.find(t => 
                t.symbol?.toLowerCase() === tokenSymbol.toLowerCase()
            );

            if (!token) {
                return await ctx.answerInlineQuery([{
                    type: 'article',
                    id: 'token_not_found',
                    title: '❌ Token Not Found',
                    description: `Token "${tokenSymbol}" not found`,
                    input_message_content: {
                        message_text: `❌ Token "${tokenSymbol}" not found. Use search to find available tokens.`
                    }
                }]);
            }

            // Create buy confirmation result
            const result = {
                type: 'article',
                id: `buy_${token.address}_${buyAmount}`,
                title: `💰 Buy ${buyAmount} MON worth of ${token.symbol}`,
                description: `Click to execute purchase in group chat`,
                input_message_content: {
                    message_text: `🔄 *Processing Buy Order*\n\n💰 Buying ${buyAmount} MON worth of ${token.symbol}\n⏳ Please wait...`,
                    parse_mode: 'Markdown'
                }
            };

            await ctx.answerInlineQuery([result]);

        } catch (error) {
            this.monitoring?.logError('Buy command error', error, { tokenSymbol, amount });
            await ctx.answerInlineQuery([]);
        }
    }

    /**
     * Handle chosen inline result (when user selects a buy option)
     */
    async handleChosenInlineResult(ctx) {
        try {
            const resultId = ctx.chosenInlineResult.result_id;
            
            // Only process buy operations
            if (!resultId.startsWith('buy_')) {
                return;
            }

            const userId = ctx.from.id;
            const parts = resultId.split('_');
            if (parts.length < 3) return;

            const tokenAddress = parts[1];
            const amount = parseFloat(parts[2]);

            // Execute the buy operation
            await this.executeBuyInGroup(ctx, userId, tokenAddress, amount);

        } catch (error) {
            this.monitoring?.logError('Chosen inline result error', error, { userId: ctx.from?.id });
        }
    }

    /**
     * Execute buy operation and post result in group
     */
    async executeBuyInGroup(ctx, userId, tokenAddress, amount) {
        try {
            // Get user data
            const user = await this.database.getUserByTelegramId(userId);
            if (!user || !user.wallet_address) {
                return;
            }

            // Get user settings
            const settings = await this.database.getUserSettings(userId);

            // Execute trade using UnifiedTradingEngine
            const tradeRequest = {
                type: settings?.turbo_mode ? 'turbo' : 'normal',
                action: 'buy',
                userId,
                tokenAddress,
                amount,
                ctx,
                preloadedUser: user,
                preloadedSettings: settings
            };

            const result = await this.tradingEngine.executeTrade(tradeRequest);

            // Format result message
            let message;
            if (result.success) {
                const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
                const tokenSymbol = tokenInfo?.token?.symbol || 'Unknown';
                
                message = `✅ *Buy Order Executed*\n\n` +
                         `👤 User: ${ctx.from.first_name || 'User'}\n` +
                         `🪙 Token: ${tokenSymbol}\n` +
                         `💰 Amount: ${amount} MON\n` +
                         `⚡ Mode: ${result.type}\n` +
                         `⏱ Time: ${result.executionTime}ms\n\n` +
                         `🔗 [View on Explorer](https://testnet.monorail.xyz/tx/${result.txHash || ''})`;
            } else {
                message = `❌ *Buy Order Failed*\n\n` +
                         `👤 User: ${ctx.from.first_name || 'User'}\n` +
                         `💰 Amount: ${amount} MON\n` +
                         `❌ Error: ${result.error}\n` +
                         `⏱ Time: ${result.executionTime}ms`;
            }

            // Try to edit the original message if possible
            if (ctx.chosenInlineResult?.inline_message_id) {
                try {
                    await ctx.telegram.editMessageText(
                        undefined,
                        undefined,
                        ctx.chosenInlineResult.inline_message_id,
                        message,
                        { parse_mode: 'Markdown' }
                    );
                } catch (editError) {
                    // If edit fails, the message might be too old or deleted
                    this.monitoring?.logWarning('Failed to edit inline message', editError);
                }
            }

            this.monitoring?.logInfo('Inline buy executed', { 
                userId, 
                tokenAddress: tokenAddress.substring(0, 10) + '...', 
                amount, 
                success: result.success 
            });

        } catch (error) {
            this.monitoring?.logError('Execute buy in group error', error, { userId, tokenAddress, amount });
        }
    }

    /**
     * Format token information for display
     */
    formatTokenInfo(token, tokenInfo) {
        try {
            const symbol = token.symbol || 'Unknown';
            const name = token.name || 'Unknown Token';
            const address = token.address || 'N/A';
            const price = tokenInfo?.token?.usd_per_token || 'N/A';
            const marketCap = tokenInfo?.token?.market_cap || 'N/A';
            const volume24h = tokenInfo?.token?.volume_24h || 'N/A';

            return `🪙 *${symbol}* - ${name}\n\n` +
                   `💵 Price: $${price}\n` +
                   `📊 Market Cap: $${marketCap}\n` +
                   `📈 24h Volume: $${volume24h}\n\n` +
                   `📍 Address:\n\`${address}\`\n\n` +
                   `🔗 [View Chart](https://testnet.monorail.xyz/token/${address})`;
        } catch (error) {
            return `🪙 *${token.symbol || 'Unknown'}*\n📝 ${token.name || 'Unknown Token'}\n📍 \`${token.address}\``;
        }
    }
}

module.exports = InlineHandlers;