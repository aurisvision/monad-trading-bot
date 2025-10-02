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
        this.botUsername = dependencies.botUsername || 'MonAreaBot';
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
     * Check if bot is mentioned in the message
     */
    isBotMentioned(ctx, botUsername) {
        const message = ctx.message.text;
        return message.includes(`@${botUsername}`);
    }

    /**
     * Handle group messages - check for token recognition and bot mentions
     */
    async handleGroupMessage(ctx, botUsername) {
        try {
            const message = ctx.message.text;
            
            // Handle bot mentions (commands)
            if (this.isBotMentioned(ctx, botUsername)) {
                return await this.handleMentionCommand(ctx, message, botUsername);
            }
            
            // Handle token recognition (contract addresses only, no symbols)
            const handled = await this.handleTokenRecognition(ctx, message);
            return handled;
            
        } catch (error) {
            this.monitoring?.logError('Group message handling error', error);
            return false;
        }
    }

    /**
     * Handle commands when bot is mentioned
     */
    async handleMentionCommand(ctx, message, botUsername) {
        try {
            // Remove bot mention and get clean command
            const cleanMessage = message.replace(`@${botUsername}`, '').trim();
            const args = cleanMessage.split(' ');
            const command = args[0].toLowerCase();

            switch (command) {
                case 'buy':
                    if (args.length >= 3) {
                        return await this.handleGroupBuyCommand(ctx, args);
                    } else {
                        await ctx.reply('❌ Usage: @bot buy <contract_address> <amount>');
                        return true;
                    }
                
                case 'help':
                    return await this.handleGroupHelpCommand(ctx);
                
                default:
                    // Unknown command - ignore
                    return false;
            }
        } catch (error) {
            this.monitoring?.logError('Group mention command error', error, { 
                userId: ctx.from.id, 
                message: message 
            });
            return false;
        }
    }

    /**
     * Handle buy command in groups
     */
    async handleGroupBuyCommand(ctx, args) {
        try {
            const tokenAddress = args[1];
            const amount = args[2];

            // Validate contract address format
            if (!tokenAddress || !tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
                await ctx.reply('❌ Invalid contract address format. Please use a valid Ethereum address.');
                return true;
            }

            // Validate amount
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                await ctx.reply('❌ Invalid amount. Please enter a valid number.');
                return true;
            }

            // Check if user exists in database
            const user = await this.database.getUser(ctx.from.id);
            if (!user) {
                await ctx.reply('❌ You need to start the bot privately first to create a wallet: /start');
                return true;
            }

            // Check if user has a wallet
            if (!user.wallet_address) {
                await ctx.reply('❌ You need to create or import a wallet first. Use /start in private chat.');
                return true;
            }

            // Execute the buy
            await this.executeBuyInGroup(ctx, tokenAddress, amount, user);
            return true;

        } catch (error) {
            this.monitoring?.logError('Group buy command error', error, { 
                userId: ctx.from.id, 
                args: args 
            });
            await ctx.reply('❌ An error occurred while processing your buy request.');
            return true;
        }
    }

    /**
     * Handle token recognition in messages (contract addresses only)
     */
    async handleTokenRecognition(ctx, message) {
        try {
            // Only recognize contract addresses (0x followed by 40 hex characters)
            const contractRegex = /0x[a-fA-F0-9]{40}/g;
            const matches = message.match(contractRegex);
            
            if (matches && matches.length > 0) {
                // Take the first contract address found
                const contractAddress = matches[0];
                
                // Get token info
                const tokenInfoResponse = await this.monorailAPI.getTokenInfo(contractAddress);
                
                if (tokenInfoResponse && tokenInfoResponse.success && tokenInfoResponse.token) {
                    await this.sendTokenInfoToGroup(ctx, tokenInfoResponse.token);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            this.monitoring?.logError('Token recognition error', error);
            return false;
        }
    }

    /**
     * Send formatted token information to group
     */
    async sendTokenInfoToGroup(ctx, tokenInfo) {
        try {
            // Access token data correctly from API response structure
            const token = tokenInfo.token || tokenInfo;
            
            if (!token || !token.symbol) {
                await ctx.reply('❌ Token information not available');
                return;
            }

            // Build token stats dynamically - only show available data
            let tokenStats = [];
            
            // USD Price (always show if available)
            if (token.usd_per_token && token.usd_per_token !== 'N/A' && token.usd_per_token > 0) {
                tokenStats.push(`├ USD Price: $${this.formatNumber(token.usd_per_token)}`);
            }
            
            // MON Price (show if available)
            if (token.mon_per_token && token.mon_per_token !== 'N/A' && token.mon_per_token > 0) {
                tokenStats.push(`├ MON Price: ${this.formatNumber(token.mon_per_token)} MON`);
            }
            
            // Confidence (show if available and meaningful) - Fix percentage calculation
            if (token.pconf && token.pconf !== 'N/A' && token.pconf > 0) {
                // pconf is already a percentage value, don't multiply by 100
                const confidence = Math.round(token.pconf);
                tokenStats.push(`├ Confidence: ${confidence}%`);
            }
            
            // Market Cap (only show if available and not N/A)
            if (token.marketCap && token.marketCap !== 'N/A' && token.marketCap > 0) {
                tokenStats.push(`├ Market Cap: $${this.formatNumber(token.marketCap)}`);
            }
            
            // Volume 24h (only show if available and not N/A)
            if (token.volume24h && token.volume24h !== 'N/A' && token.volume24h > 0) {
                tokenStats.push(`└ 24h Volume: $${this.formatNumber(token.volume24h)}`);
            }
            
            // Fix the last item to use └ instead of ├
            if (tokenStats.length > 0) {
                const lastIndex = tokenStats.length - 1;
                tokenStats[lastIndex] = tokenStats[lastIndex].replace('├', '└');
            }

            const message = `🪙 **${token.name || token.symbol}** (${token.symbol})
├ ${token.address}
└ #MON (Monad) | 🌱 Active

${tokenStats.length > 0 ? `**📊 Token Stats**
${tokenStats.join('\n')}

` : ''}**💡 Quick Buy**
└ \`@${this.botUsername} buy ${token.address} <amount>\``;

            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error sending token info to group:', error);
            await ctx.reply('❌ Error displaying token information');
        }
    }

    /**
     * Execute buy operation in group
     */
    async executeBuyInGroup(ctx, tokenAddress, amount, user) {
        try {
            // Show processing message
            const processingMsg = await ctx.reply('⏳ Processing purchase...');

            // Get user settings
            const userSettings = await this.database.getUserSettings(ctx.from.id);
            
            // Execute buy using unified trading engine - FIX: use engine.executeTrade
            const tradeType = userSettings?.turbo_mode ? 'turbo' : 'normal';
            const result = await this.tradingEngine.engine.executeTrade({
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
                // Ignore deletion errors
            }

            if (result.success) {
                // Get token info for better display
                const tokenInfoResponse = await this.monorailAPI.getTokenInfo(tokenAddress);
                const tokenSymbol = tokenInfoResponse?.token?.symbol || 'Token';
                
                // Create proper explorer URL instead of just hash
                const explorerUrl = result.txHash ? 
                    `https://testnet.monadexplorer.com/tx/${result.txHash}` : 
                    (result.explorerUrl || '#');
                
                // Clean success message with bold headers
                const successMessage = 
                    `**✅ Purchase Successful**\n\n` +
                    `**👤 User:** ${ctx.from.first_name || 'User'}\n` +
                    `**🪙 Token:** ${tokenSymbol}\n` +
                    `**💰 Amount:** ${amount} MON\n` +
                    `**⚡ Mode:** ${tradeType.toUpperCase()}\n\n` +
                    `**🔗 Transaction:** [View on Explorer](${explorerUrl})`;

                await ctx.reply(successMessage, { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            } else {
                // Error message
                await ctx.reply(`❌ Purchase failed: ${result.error || 'Unknown error'}`);
            }

        } catch (error) {
            this.monitoring?.logError('Group buy execution failed', {
                error: error.message,
                stack: error.stack,
                userId: ctx.from.id,
                tokenAddress,
                amount
            });

            await ctx.reply('❌ Purchase failed. Please try again later.');
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
     * Format large numbers for display
     */
    formatNumber(num) {
        if (!num || isNaN(num)) return '0';
        
        const number = parseFloat(num);
        
        if (number >= 1e9) {
            return (number / 1e9).toFixed(2) + 'B';
        } else if (number >= 1e6) {
            return (number / 1e6).toFixed(2) + 'M';
        } else if (number >= 1e3) {
            return (number / 1e3).toFixed(2) + 'K';
        } else if (number >= 1) {
            return number.toFixed(4);
        } else {
            // For very small numbers, show more decimal places
            return number.toFixed(8).replace(/\.?0+$/, '');
        }
    }
}

module.exports = GroupHandlers;