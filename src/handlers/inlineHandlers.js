const { Markup } = require('telegraf');

/**
 * Inline Handlers for Area51 Trading Bot
 * Provides secure inline search and trading functionality
 * Reuses existing functions for maximum efficiency
 */
class InlineHandlers {
    constructor(bot, dependencies) {
        this.bot = bot;
        this.database = dependencies.database;
        this.monorailAPI = dependencies.monorailAPI;
        this.monitoring = dependencies.monitoring;
        this.redis = dependencies.redis;
        this.cacheService = dependencies.cacheService;
        this.tradingInterface = dependencies.tradingInterface;
        
        // Security settings
        this.maxQueryLength = 50;
        this.minQueryLength = 2;
        this.maxResults = 10;
        this.cacheTimeout = 30; // seconds
    }

    /**
     * Setup inline handlers
     */
    setupHandlers() {
        // Main inline query handler
        this.bot.on('inline_query', async (ctx) => {
            await this.handleInlineQuery(ctx);
        });

        // Chosen inline result handler
        this.bot.on('chosen_inline_result', async (ctx) => {
            await this.handleChosenInlineResult(ctx);
        });

        console.log('✅ Inline handlers setup complete');
    }

    /**
     * Handle inline queries with security validation
     */
    async handleInlineQuery(ctx) {
        try {
            const userId = ctx.from.id;
            const query = ctx.inlineQuery.query.trim();
            const queryId = ctx.inlineQuery.id;

            // Security validation
            if (!await this.validateInlineUser(ctx)) {
                return await this.sendUnauthorizedResult(ctx);
            }

            // Query validation
            if (query.length < this.minQueryLength) {
                return await this.sendHelpResult(ctx);
            }

            if (query.length > this.maxQueryLength) {
                return await this.sendErrorResult(ctx, 'Query too long');
            }

            // Rate limiting check
            if (!await this.checkRateLimit(userId)) {
                return await this.sendRateLimitResult(ctx);
            }

            // Log inline query for monitoring
            this.monitoring?.logInfo('Inline query received', {
                userId,
                query: query.substring(0, 20), // Log only first 20 chars for privacy
                queryId
            });

            // Check for special commands
            if (query.startsWith('/')) {
                return await this.handleInlineCommand(ctx, query);
            }

            // Search for tokens using existing function
            await this.searchTokensInline(ctx, query);

        } catch (error) {
            this.monitoring?.logError('Inline query failed', error, {
                userId: ctx.from.id,
                queryId: ctx.inlineQuery.id
            });
            await this.sendErrorResult(ctx, 'Search failed');
        }
    }

    /**
     * Validate user access for inline queries
     */
    async validateInlineUser(ctx) {
        try {
            const userId = ctx.from.id;
            const username = ctx.from.username;
            
            // Check if user exists in database
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                this.monitoring?.logWarning('Unauthorized inline access attempt', {
                    userId,
                    username,
                    reason: 'User not found in database'
                });
                return false;
            }

            // Check if user has wallet (required for trading)
            if (!user.wallet_address) {
                this.monitoring?.logWarning('Inline access denied - no wallet', {
                    userId,
                    username,
                    reason: 'No wallet address'
                });
                return false;
            }

            // Check if user account is active
            if (user.status && user.status === 'banned') {
                this.monitoring?.logWarning('Inline access denied - banned user', {
                    userId,
                    username,
                    reason: 'User account banned'
                });
                return false;
            }

            // Verify user session integrity
            const userState = await this.database.getUserState(userId);
            if (userState && userState.blocked_until && new Date() < new Date(userState.blocked_until)) {
                this.monitoring?.logWarning('Inline access denied - user temporarily blocked', {
                    userId,
                    username,
                    reason: 'User temporarily blocked',
                    blockedUntil: userState.blocked_until
                });
                return false;
            }

            // Log successful validation
            this.monitoring?.logInfo('Inline access validated', {
                userId,
                username: username || 'no_username'
            });

            return true;

        } catch (error) {
            this.monitoring?.logError('Inline user validation failed', error, {
                userId: ctx.from.id,
                username: ctx.from.username
            });
            return false;
        }
    }

    /**
     * Search tokens using existing MonorailAPI function
     */
    async searchTokensInline(ctx, query) {
        try {
            const userId = ctx.from.id;
            
            // Use existing searchTokens function
            const searchResults = await this.monorailAPI.searchTokens(query);
            
            if (!searchResults || !searchResults.success || !searchResults.tokens) {
                return await this.sendNoResultsFound(ctx, query);
            }

            const tokens = searchResults.tokens.slice(0, this.maxResults);
            
            if (tokens.length === 0) {
                return await this.sendNoResultsFound(ctx, query);
            }

            // Convert tokens to inline results
            const inlineResults = await this.createTokenInlineResults(tokens, userId);
            
            await ctx.answerInlineQuery(inlineResults, {
                cache_time: this.cacheTimeout,
                is_personal: true, // Important for security
                switch_pm_text: "🔒 Trade Privately",
                switch_pm_parameter: "inline_trade"
            });

        } catch (error) {
            this.monitoring?.logError('Token search inline failed', error, {
                userId: ctx.from.id,
                query
            });
            await this.sendErrorResult(ctx, 'Search failed');
        }
    }

    /**
     * Create inline results from token data
     */
    async createTokenInlineResults(tokens, userId) {
        const results = [];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            try {
                // Format price safely
                const price = token.usd_per_token ? `$${parseFloat(token.usd_per_token).toFixed(6)}` : 'N/A';
                const monPrice = token.mon_per_token ? `${parseFloat(token.mon_per_token).toFixed(4)} MON` : 'N/A';
                
                // Create secure inline result
                const result = {
                    type: 'article',
                    id: `token_${token.address}_${userId}_${Date.now()}`, // Unique ID with user context
                    title: `${token.symbol || 'Unknown'} - ${token.name || 'Unknown Token'}`,
                    description: `💰 ${price} | ⚡ ${monPrice} | 🚀 Trade Now`,
                    input_message_content: {
                        message_text: this.createTokenTradeMessage(token),
                        parse_mode: 'Markdown'
                    },
                    reply_markup: this.createTokenInlineKeyboard(token.address, token.symbol)
                };

                results.push(result);

            } catch (error) {
                this.monitoring?.logError('Failed to create inline result for token', error, {
                    tokenAddress: token.address,
                    userId
                });
                continue;
            }
        }

        return results;
    }

    /**
     * Create token trade message
     */
    createTokenTradeMessage(token) {
        const symbol = token.symbol || 'Unknown';
        const name = token.name || 'Unknown Token';
        const price = token.usd_per_token ? `$${parseFloat(token.usd_per_token).toFixed(6)}` : 'N/A';
        const monPrice = token.mon_per_token ? `${parseFloat(token.mon_per_token).toFixed(4)} MON` : 'N/A';
        const address = token.address || 'N/A';

        return `🚀 **${symbol} - ${name}**

💰 **Price:** ${price}
⚡ **MON Price:** ${monPrice}
📍 **Address:** \`${address}\`

🔒 **Secure Trading via @area51bot**
_Click buttons below to trade privately_`;
    }

    /**
     * Create inline keyboard for token trading
     */
    createTokenInlineKeyboard(tokenAddress, tokenSymbol) {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback(`🟢 Buy ${tokenSymbol}`, `inline_buy_${tokenAddress}`),
                Markup.button.callback(`🔴 Sell ${tokenSymbol}`, `inline_sell_${tokenAddress}`)
            ],
            [
                Markup.button.callback(`📊 Token Info`, `inline_info_${tokenAddress}`),
                Markup.button.callback(`🔄 Auto Buy`, `inline_auto_${tokenAddress}`)
            ],
            [
                Markup.button.url('🔒 Private Chat', `https://t.me/area51bot?start=token_${tokenAddress}`)
            ]
        ]).reply_markup;
    }

    /**
     * Handle special inline commands
     */
    async handleInlineCommand(ctx, command) {
        const commands = {
            '/help': () => this.sendHelpResult(ctx),
            '/portfolio': () => this.sendPortfolioResult(ctx),
            '/wallet': () => this.sendWalletResult(ctx),
            '/settings': () => this.sendSettingsResult(ctx)
        };

        const handler = commands[command.toLowerCase()];
        if (handler) {
            await handler();
        } else {
            await this.sendUnknownCommandResult(ctx, command);
        }
    }

    /**
     * Handle chosen inline result (when user selects a result)
     */
    async handleChosenInlineResult(ctx) {
        try {
            const userId = ctx.from.id;
            const resultId = ctx.chosenInlineResult.result_id;
            const query = ctx.chosenInlineResult.query;

            // Log the selection for analytics
            this.monitoring?.logInfo('Inline result chosen', {
                userId,
                resultId,
                query: query?.substring(0, 20)
            });

            // Extract token address from result ID if it's a token result
            if (resultId.startsWith('token_')) {
                const parts = resultId.split('_');
                if (parts.length >= 2) {
                    const tokenAddress = parts[1];
                    await this.handleTokenSelection(userId, tokenAddress);
                }
            }

        } catch (error) {
            this.monitoring?.logError('Chosen inline result failed', error, {
                userId: ctx.from.id
            });
        }
    }

    /**
     * Handle token selection from inline result
     */
    async handleTokenSelection(userId, tokenAddress) {
        try {
            // Store token selection in user state for private chat
            await this.database.setUserState(userId, 'inline_token_selected', {
                tokenAddress,
                timestamp: Date.now(),
                source: 'inline_query'
            });

            this.monitoring?.logInfo('Token selected via inline', {
                userId,
                tokenAddress
            });

        } catch (error) {
            this.monitoring?.logError('Token selection handling failed', error, {
                userId,
                tokenAddress
            });
        }
    }

    /**
     * Rate limiting for inline queries
     */
    async checkRateLimit(userId) {
        try {
            const key = `inline_rate_limit:${userId}`;
            const current = await this.redis.get(key);
            
            if (current && parseInt(current) > 10) { // Max 10 queries per minute
                return false;
            }

            await this.redis.setex(key, 60, (parseInt(current) || 0) + 1);
            return true;

        } catch (error) {
            // If Redis fails, allow the query (fail open)
            return true;
        }
    }

    /**
     * Send help result
     */
    async sendHelpResult(ctx) {
        const helpResult = [{
            type: 'article',
            id: 'help_result',
            title: '🤖 Area51 Bot - Help',
            description: 'Search for tokens by name, symbol, or address',
            input_message_content: {
                message_text: `🤖 **Area51 Trading Bot - Inline Help**

**How to use:**
• Type token name: \`USDC\`, \`Bitcoin\`
• Type token symbol: \`BTC\`, \`ETH\`
• Paste contract address
• Use commands: \`/portfolio\`, \`/wallet\`

**Features:**
🔍 **Search** - Find any token instantly
🚀 **Trade** - Buy/sell with one click
🔄 **Auto Buy** - Set automatic purchases
📊 **Portfolio** - Track your holdings

🔒 **100% Secure** - All trading in private chat`,
                parse_mode: 'Markdown'
            }
        }];

        await ctx.answerInlineQuery(helpResult, {
            cache_time: 300,
            is_personal: true
        });
    }

    /**
     * Send unauthorized result
     */
    async sendUnauthorizedResult(ctx) {
        const unauthorizedResult = [{
            type: 'article',
            id: 'unauthorized_result',
            title: '🔒 Access Required',
            description: 'Please start the bot first to use inline features',
            input_message_content: {
                message_text: `🔒 **Access Required**

To use Area51 inline features, you need to:

1️⃣ Start the bot: @area51bot
2️⃣ Create your wallet
3️⃣ Complete setup

Then you can search and trade directly from any chat!

🚀 **Start now:** @area51bot`,
                parse_mode: 'Markdown'
            },
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.url('🚀 Start Bot', 'https://t.me/area51bot?start=inline_setup')]
            ]).reply_markup
        }];

        await ctx.answerInlineQuery(unauthorizedResult, {
            cache_time: 60,
            is_personal: true
        });
    }

    /**
     * Send no results found
     */
    async sendNoResultsFound(ctx, query) {
        const noResultsResult = [{
            type: 'article',
            id: 'no_results',
            title: '❌ No tokens found',
            description: `No results for "${query}". Try a different search term.`,
            input_message_content: {
                message_text: `❌ **No tokens found for "${query}"**

**Try searching for:**
• Popular tokens: \`USDC\`, \`WETH\`, \`USDT\`
• Token symbols: \`BTC\`, \`ETH\`
• Full contract addresses
• Different spelling variations

🔍 **Search again with @area51bot**`,
                parse_mode: 'Markdown'
            }
        }];

        await ctx.answerInlineQuery(noResultsResult, {
            cache_time: 30,
            is_personal: true
        });
    }

    /**
     * Send error result
     */
    async sendErrorResult(ctx, errorMessage) {
        const errorResult = [{
            type: 'article',
            id: 'error_result',
            title: '⚠️ Error',
            description: errorMessage,
            input_message_content: {
                message_text: `⚠️ **Error: ${errorMessage}**

Please try again or contact support if the problem persists.

🔄 **Try again with @area51bot**`,
                parse_mode: 'Markdown'
            }
        }];

        await ctx.answerInlineQuery(errorResult, {
            cache_time: 10,
            is_personal: true
        });
    }

    /**
     * Send rate limit result
     */
    async sendRateLimitResult(ctx) {
        const rateLimitResult = [{
            type: 'article',
            id: 'rate_limit_result',
            title: '⏰ Rate Limit',
            description: 'Too many queries. Please wait a moment.',
            input_message_content: {
                message_text: `⏰ **Rate Limit Reached**

You're searching too quickly. Please wait a moment before trying again.

**Limits:**
• Max 10 searches per minute
• This helps keep the bot fast for everyone

🔄 **Try again in a few seconds**`,
                parse_mode: 'Markdown'
            }
        }];

        await ctx.answerInlineQuery(rateLimitResult, {
            cache_time: 30,
            is_personal: true
        });
    }

    /**
     * Send portfolio result
     */
    async sendPortfolioResult(ctx) {
        const portfolioResult = [{
            type: 'article',
            id: 'portfolio_result',
            title: '📊 Portfolio',
            description: 'View your portfolio in private chat',
            input_message_content: {
                message_text: `📊 **Portfolio Access**

Your portfolio contains sensitive financial information and can only be viewed in private chat for security.

🔒 **Click below to view your portfolio privately**`,
                parse_mode: 'Markdown'
            },
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.url('📊 View Portfolio', 'https://t.me/area51bot?start=portfolio')]
            ]).reply_markup
        }];

        await ctx.answerInlineQuery(portfolioResult, {
            cache_time: 60,
            is_personal: true
        });
    }

    /**
     * Send wallet result
     */
    async sendWalletResult(ctx) {
        const walletResult = [{
            type: 'article',
            id: 'wallet_result',
            title: '💼 Wallet',
            description: 'Access your wallet in private chat',
            input_message_content: {
                message_text: `💼 **Wallet Access**

Your wallet contains private keys and sensitive information that can only be accessed in private chat.

🔒 **Click below to access your wallet securely**`,
                parse_mode: 'Markdown'
            },
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.url('💼 Access Wallet', 'https://t.me/area51bot?start=wallet')]
            ]).reply_markup
        }];

        await ctx.answerInlineQuery(walletResult, {
            cache_time: 60,
            is_personal: true
        });
    }

    /**
     * Send settings result
     */
    async sendSettingsResult(ctx) {
        const settingsResult = [{
            type: 'article',
            id: 'settings_result',
            title: '⚙️ Settings',
            description: 'Configure your trading settings',
            input_message_content: {
                message_text: `⚙️ **Settings Access**

Trading settings contain personal preferences and can only be modified in private chat.

🔒 **Click below to access settings securely**`,
                parse_mode: 'Markdown'
            },
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.url('⚙️ Open Settings', 'https://t.me/area51bot?start=settings')]
            ]).reply_markup
        }];

        await ctx.answerInlineQuery(settingsResult, {
            cache_time: 60,
            is_personal: true
        });
    }

    /**
     * Send unknown command result
     */
    async sendUnknownCommandResult(ctx, command) {
        const unknownResult = [{
            type: 'article',
            id: 'unknown_command_result',
            title: '❓ Unknown Command',
            description: `Command "${command}" not recognized`,
            input_message_content: {
                message_text: `❓ **Unknown Command: "${command}"**

**Available commands:**
• \`/help\` - Show help
• \`/portfolio\` - View portfolio
• \`/wallet\` - Access wallet
• \`/settings\` - Open settings

Or search for tokens by name/symbol/address.`,
                parse_mode: 'Markdown'
            }
        }];

        await ctx.answerInlineQuery(unknownResult, {
            cache_time: 30,
            is_personal: true
        });
    }

    // ==================== SECURE TRADING FUNCTIONS ====================

    /**
     * Handle secure inline buy action
     */
    async handleInlineBuy(ctx, tokenAddress) {
        try {
            const userId = ctx.from.id;

            // Security validation
            if (!await this.validateInlineUser(ctx)) {
                return await ctx.reply('❌ غير مصرح لك بالوصول لهذه الخدمة');
            }

            // Validate token address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
                return await ctx.reply('❌ عنوان التوكن غير صحيح');
            }

            // Log trading action
            this.monitoring?.logInfo('Inline buy initiated', {
                userId,
                tokenAddress: tokenAddress.substring(0, 10) + '...'
            });

            // Redirect to private chat for secure trading
            await ctx.reply(
                `🔒 **عملية شراء آمنة**\n\n` +
                `لضمان أمان معاملاتك، سيتم توجيهك للمحادثة الخاصة لإتمام عملية الشراء.\n\n` +
                `🎯 **التوكن المحدد:** \`${tokenAddress}\`\n\n` +
                `👆 اضغط على الزر أدناه للمتابعة بأمان`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.url('🛒 شراء آمن', `https://t.me/${this.bot.botInfo.username}?start=buy_${tokenAddress}`)]
                    ]).reply_markup
                }
            );

        } catch (error) {
            this.monitoring?.logError('Inline buy failed', error, {
                userId: ctx.from.id,
                tokenAddress
            });
            await ctx.reply('❌ خطأ في عملية الشراء. حاول مرة أخرى.');
        }
    }

    /**
     * Handle secure inline sell action
     */
    async handleInlineSell(ctx, tokenAddress) {
        try {
            const userId = ctx.from.id;

            // Security validation
            if (!await this.validateInlineUser(ctx)) {
                return await ctx.reply('❌ غير مصرح لك بالوصول لهذه الخدمة');
            }

            // Validate token address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
                return await ctx.reply('❌ عنوان التوكن غير صحيح');
            }

            // Log trading action
            this.monitoring?.logInfo('Inline sell initiated', {
                userId,
                tokenAddress: tokenAddress.substring(0, 10) + '...'
            });

            // Redirect to private chat for secure trading
            await ctx.reply(
                `🔒 **عملية بيع آمنة**\n\n` +
                `لضمان أمان معاملاتك، سيتم توجيهك للمحادثة الخاصة لإتمام عملية البيع.\n\n` +
                `🎯 **التوكن المحدد:** \`${tokenAddress}\`\n\n` +
                `👆 اضغط على الزر أدناه للمتابعة بأمان`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.url('💰 بيع آمن', `https://t.me/${this.bot.botInfo.username}?start=sell_${tokenAddress}`)]
                    ]).reply_markup
                }
            );

        } catch (error) {
            this.monitoring?.logError('Inline sell failed', error, {
                userId: ctx.from.id,
                tokenAddress
            });
            await ctx.reply('❌ خطأ في عملية البيع. حاول مرة أخرى.');
        }
    }

    /**
     * Handle secure inline auto buy action
     */
    async handleInlineAutoBuy(ctx, tokenAddress) {
        try {
            const userId = ctx.from.id;

            // Security validation
            if (!await this.validateInlineUser(ctx)) {
                return await ctx.reply('❌ غير مصرح لك بالوصول لهذه الخدمة');
            }

            // Validate token address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
                return await ctx.reply('❌ عنوان التوكن غير صحيح');
            }

            // Log trading action
            this.monitoring?.logInfo('Inline auto buy initiated', {
                userId,
                tokenAddress: tokenAddress.substring(0, 10) + '...'
            });

            // Redirect to private chat for secure auto buy setup
            await ctx.reply(
                `🔒 **تفعيل الشراء التلقائي الآمن**\n\n` +
                `لضمان أمان إعداداتك، سيتم توجيهك للمحادثة الخاصة لتفعيل الشراء التلقائي.\n\n` +
                `🎯 **التوكن المحدد:** \`${tokenAddress}\`\n\n` +
                `👆 اضغط على الزر أدناه للمتابعة بأمان`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.url('🤖 شراء تلقائي آمن', `https://t.me/${this.bot.botInfo.username}?start=autobuy_${tokenAddress}`)]
                    ]).reply_markup
                }
            );

        } catch (error) {
            this.monitoring?.logError('Inline auto buy failed', error, {
                userId: ctx.from.id,
                tokenAddress
            });
            await ctx.reply('❌ خطأ في تفعيل الشراء التلقائي. حاول مرة أخرى.');
        }
    }

    /**
     * Send help message for inline mode
     */
    async sendHelpMessage(ctx) {
        try {
            await ctx.reply(
                `📖 **مساعدة Inline Mode**\n\n` +
                `🔍 **البحث عن التوكنات:**\n` +
                `• اكتب \`@area51bot [اسم التوكن]\` في أي محادثة\n` +
                `• مثال: \`@area51bot USDC\`\n\n` +
                `🛡️ **الأمان:**\n` +
                `• جميع عمليات التداول تتم في المحادثة الخاصة\n` +
                `• لا يمكن لأي مستخدم آخر الوصول لبياناتك\n` +
                `• التحقق من الهوية مطلوب لكل عملية\n\n` +
                `⚡ **الأوامر المتاحة:**\n` +
                `• \`/portfolio\` - عرض المحفظة\n` +
                `• \`/wallet\` - معلومات المحفظة\n` +
                `• \`/settings\` - الإعدادات\n` +
                `• \`/help\` - هذه المساعدة\n\n` +
                `🔒 **ملاحظة:** جميع العمليات محمية ومشفرة`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.url('🏠 الصفحة الرئيسية', `https://t.me/${this.bot.botInfo.username}?start=home`)]
                    ]).reply_markup
                }
            );

        } catch (error) {
            this.monitoring?.logError('Inline help message failed', error, {
                userId: ctx.from.id
            });
            await ctx.reply('❌ خطأ في عرض المساعدة');
        }
    }
}

module.exports = InlineHandlers;