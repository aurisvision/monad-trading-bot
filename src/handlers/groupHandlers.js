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
        this.botUsername = dependencies.botUsername || 'area51bot';
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
    async sendTokenInfoToGroup(ctx, tokenData) {
        try {
            // Extract data with proper fallbacks
            const symbol = tokenData.symbol || 'Unknown';
            const name = tokenData.name || 'Unknown Token';
            const address = tokenData.address || 'N/A';
            const price = tokenData.usd_per_token ? `$${this.formatNumber(tokenData.usd_per_token)}` : 'N/A';
            const marketCap = tokenData.marketCap ? `$${this.formatNumber(tokenData.marketCap)}` : 'N/A';
            const volume24h = tokenData.volume24h ? `$${this.formatNumber(tokenData.volume24h)}` : 'N/A';
            
            // Create clean tree-structured message inspired by Phanes bot
            const message = 
                `🪙 *${symbol}* (${name})\n` +
                `├ \`${address}\`\n` +
                `└ #MON (Monad) | 🌱 Active\n\n` +
                `📊 *Token Stats*\n` +
                `├ USD: ${price}\n` +
                `├ MC:  ${marketCap}\n` +
                `└ Vol: ${volume24h}\n\n` +
                `💡 *Quick Buy*\n` +
                `└ @${this.botUsername || 'area51bot'} buy ${address} <amount>`;

            await ctx.reply(message, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

        } catch (error) {
            this.monitoring?.logError('Send token info error', error);
            
            // Fallback without formatting
            await ctx.reply(
                `Token: ${tokenData.symbol || 'Unknown'}\n` +
                `Contract: ${tokenData.address || 'N/A'}\n` +
                `To buy: @${this.botUsername || 'area51bot'} buy ${tokenData.address || 'N/A'} <amount>`
            );
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
                
                // Clean success message
                const successMessage = 
                    `✅ *Purchase Successful*\n\n` +
                    `👤 ${ctx.from.first_name || 'User'}\n` +
                    `🪙 ${tokenSymbol}\n` +
                    `💰 ${amount} MON\n` +
                    `⚡ ${tradeType.toUpperCase()}\n\n` +
                    `🔗 [View Transaction](${explorerUrl})`;

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