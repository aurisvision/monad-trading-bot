const { Markup } = require('telegraf');

/**
 * Group Handlers for Area51 Trading Bot
 * Handles token recognition and buying in group chats
 */
class GroupHandlers {
    constructor(dependencies) {
        this.database = dependencies.database;
        this.monorailAPI = dependencies.monorailAPI;
        this.monitoring = dependencies.monitoring;
        this.tradingEngine = dependencies.tradingEngine;
        this.walletManager = dependencies.walletManager;
        this.cacheService = dependencies.cacheService;
        this.botUsername = null;
    }

    /**
     * Setup handlers for group functionality
     */
    setupHandlers(bot) {
        this.bot = bot;
        
        // Get bot username
        if (bot.botInfo && bot.botInfo.username) {
            this.botUsername = bot.botInfo.username;
        }

        // Handle all text messages in groups
        bot.on('text', async (ctx, next) => {
            try {
                // Only handle group messages
                if (this.isGroupChat(ctx)) {
                    const handled = await this.handleGroupMessage(ctx, this.botUsername);
                    if (handled) {
                        return; // Message was handled, don't continue
                    }
                }
                // Continue to next handler if not handled
                return next();
            } catch (error) {
                this.monitoring?.logError('Group text handler error', error);
                return next();
            }
        });

        console.log('✅ Group handlers setup complete');
    }

    /**
     * Check if message is in a group chat
     */
    isGroupChat(ctx) {
        return ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    }

    /**
     * Check if message mentions the bot
     */
    isBotMentioned(ctx, botUsername) {
        if (!botUsername) return false;
        const message = ctx.message.text;
        return message.includes(`@${botUsername}`);
    }

    /**
     * Handle group text messages
     */
    async handleGroupMessage(ctx, botUsername) {
        try {
            if (!this.isGroupChat(ctx)) {
                return false; // Not a group message
            }

            const message = ctx.message.text.trim();
            const isMentioned = this.isBotMentioned(ctx, botUsername);

            // Handle mention commands (buy, etc.)
            if (isMentioned) {
                return await this.handleMentionCommand(ctx, message, botUsername);
            }

            // Handle token contract recognition without mention
            return await this.handleTokenRecognition(ctx, message);

        } catch (error) {
            this.monitoring?.logError('Group message handling failed', error, { 
                userId: ctx.from.id,
                chatId: ctx.chat.id 
            });
            return false;
        }
    }

    /**
     * Handle mention commands like @bot buy token amount
     */
    async handleMentionCommand(ctx, message, botUsername) {
        try {
            // Remove bot mention from message
            const cleanMessage = message.replace(`@${botUsername}`, '').trim();
            const parts = cleanMessage.split(' ').filter(part => part.length > 0);

            if (parts.length === 0) {
                return false;
            }

            const command = parts[0].toLowerCase();

            switch (command) {
                case 'buy':
                    return await this.handleGroupBuyCommand(ctx, parts.slice(1));
                case 'help':
                    return await this.handleGroupHelpCommand(ctx);
                default:
                    return false;
            }

        } catch (error) {
            this.monitoring?.logError('Mention command handling failed', error, { 
                userId: ctx.from.id,
                message: message.substring(0, 50) + '...'
            });
            return false;
        }
    }

    /**
     * Handle buy command in groups: @bot buy token amount
     */
    async handleGroupBuyCommand(ctx, args) {
        try {
            if (args.length < 2) {
                await ctx.reply('❌ Invalid usage. Correct format: @bot buy <token> <amount>\n\nExample: @bot buy USDC 5');
                return true;
            }

            const tokenSymbolOrAddress = args[0];
            const amount = parseFloat(args[1]);

            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Amount must be a valid number greater than zero');
                return true;
            }

            // Check if user has wallet
            const user = await this.database.getUserByTelegramId(ctx.from.id);
            if (!user || !user.wallet_address || user.wallet_address === 'pending_wallet_creation') {
                await ctx.reply('❌ You need to create a wallet first. Start a private chat with the bot and use /start');
                return true;
            }

            // Get token info
            let tokenInfo;
            if (tokenSymbolOrAddress.startsWith('0x')) {
                // It's a contract address
                tokenInfo = await this.monorailAPI.getTokenInfo(tokenSymbolOrAddress);
            } else {
                // It's a symbol, search for it
                const searchResults = await this.monorailAPI.searchTokens(tokenSymbolOrAddress);
                if (!searchResults || !searchResults.success || !searchResults.tokens || searchResults.tokens.length === 0) {
                    await ctx.reply(`❌ Token not found: ${tokenSymbolOrAddress}`);
                    return true;
                }
                // Convert to expected format
                const firstToken = searchResults.tokens[0];
                tokenInfo = {
                    token: firstToken,
                    price: {
                        usd: firstToken.usd_per_token,
                        market_cap: firstToken.market_cap,
                        change_24h: firstToken.change_24h
                    }
                };
            }

            if (!tokenInfo || !tokenInfo.token) {
                await ctx.reply(`❌ Token not found: ${tokenSymbolOrAddress}`);
                return true;
            }

            // Execute buy
            const result = await this.executeBuyInGroup(ctx, tokenInfo.token.address, amount, user);
            return true;

        } catch (error) {
            this.monitoring?.logError('Group buy command failed', error, { 
                userId: ctx.from.id,
                args: args.join(' ')
            });
            await ctx.reply('❌ An error occurred while executing the purchase. Please try again.');
            return true;
        }
    }

    /**
     * Execute buy transaction in group
     */
    async executeBuyInGroup(ctx, tokenAddress, amount, user) {
        try {
            // Show processing message
            const processingMsg = await ctx.reply('⏳ Processing purchase...');

            // Get user settings
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            
            // Execute buy using unified trading engine
            const tradeType = userSettings?.turbo_mode ? 'turbo' : 'normal';
            const result = await this.tradingEngine.executeTrade({
                type: tradeType,
                action: 'buy',
                userId: ctx.from.id,
                tokenAddress: tokenAddress,
                amount: parseFloat(amount),
                ctx: ctx
            });

            // Delete processing message
            try {
                await ctx.deleteMessage(processingMsg.message_id);
            } catch (e) {
                // Ignore if can't delete
            }

            if (result.success) {
                // Get token info for response
                const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
                const tokenSymbol = tokenInfo?.token?.symbol || 'Unknown';
                
                const successText = `✅ **Purchase Successful!**

👤 Buyer: ${ctx.from.first_name}
🪙 Token: ${tokenSymbol}
💰 Amount: ${amount} MON
🔗 Transaction: \`${result.txHash}\`

_Executed by Area51 Bot_`;

                await ctx.reply(successText, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply(`❌ Purchase failed: ${result.error || 'Unknown error'}`);
            }

        } catch (error) {
            this.monitoring?.logError('Group buy execution failed', error, { 
                userId: ctx.from.id,
                tokenAddress,
                amount
            });
            await ctx.reply('❌ An error occurred while executing the purchase');
        }
    }

    /**
     * Handle token recognition without mention
     */
    async handleTokenRecognition(ctx, message) {
        try {
            let tokenInfo = null;
            
            // First, check if message contains a token contract address
            const contractRegex = /0x[a-fA-F0-9]{40}/g;
            const contractMatches = message.match(contractRegex);

            if (contractMatches && contractMatches.length > 0) {
                // Process the first contract address found
                const contractAddress = contractMatches[0];
                tokenInfo = await this.monorailAPI.getTokenInfo(contractAddress);
            } else {
                // Only check for well-known token symbols to avoid false positives
                const commonTokens = ['USDC', 'USDT', 'ETH', 'BTC', 'WETH', 'DAI', 'MATIC', 'LINK', 'UNI', 'AAVE', 'MON', 'WMON'];
                
                // Create a regex that only matches these specific tokens as whole words
                const tokenRegex = new RegExp(`\\b(${commonTokens.join('|')})\\b`, 'gi');
                const tokenMatches = message.match(tokenRegex);
                
                if (tokenMatches && tokenMatches.length > 0) {
                    for (const match of tokenMatches) {
                        const upperMatch = match.toUpperCase();
                        
                        try {
                            const searchResults = await this.monorailAPI.searchTokens(upperMatch);
                            if (searchResults && searchResults.success && searchResults.tokens && searchResults.tokens.length > 0) {
                                // Convert to expected format
                                const firstToken = searchResults.tokens[0];
                                tokenInfo = {
                                    token: firstToken,
                                    price: {
                                        usd: firstToken.usd_per_token,
                                        market_cap: firstToken.market_cap,
                                        change_24h: firstToken.change_24h
                                    }
                                };
                                break; // Found a token, stop searching
                            }
                        } catch (searchError) {
                            // Continue to next match if search fails
                            continue;
                        }
                    }
                }
            }
            
            if (!tokenInfo || !tokenInfo.token) {
                return false; // No valid token found
            }

            // Send token info
            await this.sendTokenInfoToGroup(ctx, tokenInfo);
            return true;

        } catch (error) {
            this.monitoring?.logError('Token recognition failed', error, { 
                userId: ctx.from.id,
                message: message.substring(0, 50) + '...'
            });
            return false;
        }
    }

    /**
     * Send token information to group
     */
    async sendTokenInfoToGroup(ctx, tokenInfo) {
        try {
            const token = tokenInfo.token;
            const price = tokenInfo.price || {};

            const tokenText = `🪙 **Token Information**

**${token.symbol}** (${token.name})
📍 Contract: \`${token.address}\`
💰 Price: $${price.usd || 'N/A'}
📊 Market Cap: $${this.formatNumber(price.market_cap) || 'N/A'}
📈 24h Change: ${price.change_24h ? (price.change_24h > 0 ? '+' : '') + price.change_24h.toFixed(2) + '%' : 'N/A'}

_To buy use: @${this.botUsername || 'bot'} buy ${token.symbol} <amount>_`;

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.url('📊 Chart', `https://dexscreener.com/monad/${token.address}`),
                    Markup.button.url('🔍 Explorer', `https://explorer.monad.xyz/token/${token.address}`)
                ]
            ]);

            await ctx.reply(tokenText, { 
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring?.logError('Send token info to group failed', error, { 
                tokenAddress: tokenInfo?.token?.address
            });
        }
    }

    /**
     * Handle help command in groups
     */
    async handleGroupHelpCommand(ctx) {
        try {
            const botMention = this.botUsername ? `@${this.botUsername}` : '@bot';
            const helpText = `🤖 **Area51 Bot - Group Help**

**Available Commands:**
• \`${botMention} buy <token> <amount>\` - Buy a token
• \`${botMention} help\` - Show this help

**Automatic Recognition:**
• Posting a token contract (0x...) will automatically display its information

**Examples:**
• \`${botMention} buy USDC 5\`
• \`${botMention} buy 0x1234...abcd 10\`

_For access to all features, start a private chat with the bot_`;

            await ctx.reply(helpText, { parse_mode: 'Markdown' });
            return true;

        } catch (error) {
            this.monitoring?.logError('Group help command failed', error, { userId: ctx.from.id });
            return false;
        }
    }

    /**
     * Format large numbers
     */
    formatNumber(num) {
        if (!num) return null;
        
        if (num >= 1e9) {
            return (num / 1e9).toFixed(2) + 'B';
        } else if (num >= 1e6) {
            return (num / 1e6).toFixed(2) + 'M';
        } else if (num >= 1e3) {
            return (num / 1e3).toFixed(2) + 'K';
        }
        
        return num.toFixed(2);
    }
}

module.exports = GroupHandlers;