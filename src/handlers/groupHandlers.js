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
                await ctx.reply('❌ استخدام خاطئ. الصيغة الصحيحة: @bot buy <token> <amount>\n\nمثال: @bot buy USDC 5');
                return true;
            }

            const tokenSymbolOrAddress = args[0];
            const amount = parseFloat(args[1]);

            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ المبلغ يجب أن يكون رقم صحيح أكبر من صفر');
                return true;
            }

            // Check if user has wallet
            const user = await this.database.getUserByTelegramId(ctx.from.id);
            if (!user || !user.wallet_address || user.wallet_address === 'pending_wallet_creation') {
                await ctx.reply('❌ يجب إنشاء محفظة أولاً. ابدأ محادثة خاصة مع البوت واستخدم /start');
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
                    await ctx.reply(`❌ لم يتم العثور على العملة: ${tokenSymbolOrAddress}`);
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
                await ctx.reply(`❌ لم يتم العثور على العملة: ${tokenSymbolOrAddress}`);
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
            await ctx.reply('❌ حدث خطأ أثناء تنفيذ عملية الشراء. حاول مرة أخرى.');
            return true;
        }
    }

    /**
     * Execute buy transaction in group
     */
    async executeBuyInGroup(ctx, tokenAddress, amount, user) {
        try {
            // Show processing message
            const processingMsg = await ctx.reply('⏳ جاري تنفيذ عملية الشراء...');

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
                
                const successText = `✅ **تم الشراء بنجاح!**

👤 المشتري: ${ctx.from.first_name}
🪙 العملة: ${tokenSymbol}
💰 المبلغ: ${amount} MON
🔗 Transaction: \`${result.txHash}\`

_تم التنفيذ بواسطة Area51 Bot_`;

                await ctx.reply(successText, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply(`❌ فشل في تنفيذ عملية الشراء: ${result.error || 'خطأ غير معروف'}`);
            }

        } catch (error) {
            this.monitoring?.logError('Group buy execution failed', error, { 
                userId: ctx.from.id,
                tokenAddress,
                amount
            });
            await ctx.reply('❌ حدث خطأ أثناء تنفيذ عملية الشراء');
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
                // Check for token symbols/names (3-10 characters, letters/numbers only)
                const tokenNameRegex = /\b[A-Za-z][A-Za-z0-9]{2,9}\b/g;
                const nameMatches = message.match(tokenNameRegex);
                
                if (nameMatches && nameMatches.length > 0) {
                    // Common token symbols to check
                    const commonTokens = ['USDC', 'USDT', 'ETH', 'BTC', 'WETH', 'DAI', 'MATIC', 'LINK', 'UNI', 'AAVE'];
                    
                    for (const match of nameMatches) {
                        const upperMatch = match.toUpperCase();
                        
                        // Only process if it looks like a token symbol
                        if (commonTokens.includes(upperMatch) || 
                            (upperMatch.length >= 3 && upperMatch.length <= 6 && /^[A-Z0-9]+$/.test(upperMatch))) {
                            
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

            const tokenText = `🪙 **معلومات العملة**

**${token.symbol}** (${token.name})
📍 العقد: \`${token.address}\`
💰 السعر: $${price.usd || 'N/A'}
📊 Market Cap: $${this.formatNumber(price.market_cap) || 'N/A'}
📈 24h Change: ${price.change_24h ? (price.change_24h > 0 ? '+' : '') + price.change_24h.toFixed(2) + '%' : 'N/A'}

_للشراء استخدم: @MonAreaBot buy ${token.symbol} <amount>_`;

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
            const helpText = `🤖 **Area51 Bot - مساعدة الجروبات**

**الأوامر المتاحة:**
• \`@MonAreaBot buy <token> <amount>\` - شراء عملة
• \`@MonAreaBot help\` - عرض هذه المساعدة

**التعرف التلقائي:**
• إرسال عقد العملة (0x...) سيعرض معلوماتها تلقائياً

**أمثلة:**
• \`@MonAreaBot buy USDC 5\`
• \`@MonAreaBot buy 0x1234...abcd 10\`

_للوصول إلى جميع الميزات، ابدأ محادثة خاصة مع البوت_`;

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