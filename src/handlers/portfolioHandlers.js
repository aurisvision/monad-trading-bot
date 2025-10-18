// Portfolio Management Handlers
const { Markup } = require('telegraf');
const InterfaceUtils = require('../utils/interfaceUtils');

class PortfolioHandlers {
    constructor(bot, database, portfolioService, monitoring, cacheService = null) {
        this.bot = bot;
        this.database = database;
        this.portfolioService = portfolioService;
        this.monitoring = monitoring;
        this.cacheService = cacheService;
    }

    setupHandlers() {
        // Portfolio handlers
        this.bot.action('portfolio', async (ctx) => {
            await this.handleNewPortfolio(ctx);
        });

        // Portfolio pagination handlers
        this.bot.action(/^portfolio:page:(\d+)$/, async (ctx) => {
            await this.handlePortfolioPage(ctx);
        });

        // Portfolio refresh handler
        this.bot.action('portfolio:refresh', async (ctx) => {
            await this.handlePortfolioRefresh(ctx);
        });

        // Refresh handler removed - handled by navigationHandlers.js to avoid conflicts

        this.bot.action('refresh_balance', async (ctx) => {
            await this.handleRefresh(ctx);
        });

        // Portfolio "Show More" handler
        this.bot.action('portfolio_more', async (ctx) => {
            await this.handlePortfolioMore(ctx);
        });
    }

    async handleNewPortfolio(ctx) {
        try {
            console.log('🔍 [DEBUG] Portfolio request started for user:', ctx.from.id);
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            const userId = ctx.from.id;
            
            // Get user from cache first
            let user;
            if (this.cacheService) {
                try {
                    user = await this.cacheService.get('user', userId);
                    if (!user) {
                        user = await this.database.getUserByTelegramId(userId);
                        if (user) await this.cacheService.set('user', userId, user);
                    }
                } catch (cacheError) {
                    user = await this.database.getUserByTelegramId(userId);
                }
            } else {
                user = await this.database.getUserByTelegramId(userId);
            }
            
            console.log('🔍 [DEBUG] User found:', user ? `ID: ${user.id}, Wallet: ${user.wallet_address}` : 'null');
            
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            console.log('🔍 [DEBUG] Calling getPortfolioDisplay for wallet:', user.wallet_address);
            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(
                userId, 
                user.wallet_address, 
                1, // page 1
                false // don't force refresh
            );
            
            console.log('🔍 [DEBUG] Portfolio display result:', {
                messageLength: portfolioDisplay.message?.length || 0,
                hasKeyboard: !!portfolioDisplay.keyboard
            });

            const portfolioOptions = {
                parse_mode: 'HTML',
                reply_markup: portfolioDisplay.keyboard
            };

            if (ctx.callbackQuery) {
                // For buttons - edit existing message
                try {
                    await ctx.editMessageText(portfolioDisplay.text, portfolioOptions);
                } catch (error) {
                    // Fallback if edit fails
                    await ctx.reply(portfolioDisplay.text, portfolioOptions);
                }
            } else {
                // For commands - send new message
                await ctx.reply(portfolioDisplay.text, portfolioOptions);
            }

        } catch (error) {
            this.monitoring.logError('New portfolio display failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading portfolio. Please try again.');
        }
    }

    async handlePortfolioPage(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            const page = parseInt(ctx.match[1]);
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(
                userId, 
                user.wallet_address, 
                page, 
                false // don't force refresh
            );

            await ctx.editMessageText(portfolioDisplay.text, {
                parse_mode: 'HTML',
                reply_markup: portfolioDisplay.keyboard
            });

        } catch (error) {
            this.monitoring.logError('Portfolio page navigation failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading portfolio page. Please try again.');
        }
    }

    async handlePortfolioRefresh(ctx) {
        try {
            await ctx.answerCbQuery('🔄 Refreshing portfolio...');
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            // Clear portfolio cache first to ensure fresh data
            if (this.cacheService) {
                await this.cacheService.delete('portfolio', userId);
                console.log('🗑️ Portfolio cache cleared for user', userId);
            }
            
            // Force refresh from API
            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(
                userId, 
                user.wallet_address, 
                1, // reset to page 1
                true // force refresh
            );

            // Add timestamp to force message update even for empty portfolios
            let refreshedText = portfolioDisplay.text || '❌ Failed to load portfolio. Please try again.';
            
            // Always update timestamp to ensure message is different
            const currentTime = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
            
            if (refreshedText.includes('🕒 Last updated:')) {
                refreshedText = refreshedText.replace(
                    /(<i>🕒 Last updated: )([^<]+)(<\/i>)/,
                    `$1${currentTime}$3`
                );
            } else {
                // Add timestamp if not present
                refreshedText += `\n\n<i>🕒 Last updated: ${currentTime}</i>`;
            }
            
            // Try to edit the message, with fallback for "message not modified" error
            try {
                await ctx.editMessageText(refreshedText, {
                    parse_mode: 'HTML',
                    reply_markup: portfolioDisplay.keyboard
                });
            } catch (editError) {
                // If message is not modified, add a refresh indicator to force update
                if (editError.message && editError.message.includes('message is not modified')) {
                    const forceUpdateText = refreshedText + ` 🔄`;
                    await ctx.editMessageText(forceUpdateText, {
                        parse_mode: 'HTML',
                        reply_markup: portfolioDisplay.keyboard
                    });
                } else {
                    throw editError; // Re-throw if it's a different error
                }
            }

        } catch (error) {
            this.monitoring.logError('Portfolio refresh failed', error, { userId: ctx.from.id });
            try {
                // Try to edit the message first
                await ctx.editMessageText('❌ Error refreshing portfolio. Please try again.', {
                    parse_mode: 'HTML'
                });
            } catch (editError) {
                // If edit fails, send new message
                await ctx.reply('❌ Error refreshing portfolio. Please try again.');
            }
        }
    }

    async handleRefreshWithWelcome(ctx) {
        const userId = ctx.from.id;
        
        // Handle refresh with welcome message
        
        try {
            await ctx.answerCbQuery('🔄 Refreshing...');
            
            // Get fresh user data first
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.answerCbQuery('⚠️ User not found');
                return;
            }

            // Clear cache first to ensure fresh data
            if (this.cacheService) {
                try {
                    await this.cacheService.invalidateAfterBuy(userId, user.wallet_address);
                } catch (cacheError) {
                    this.monitoring.logError('Cache clear failed during refresh', cacheError, { userId });
                }
            }

            // Force refresh of all cached data using new API endpoints
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address, true), // Force refresh
                this.monorailAPI.getPortfolioValue(user.wallet_address, true), // Force refresh
                this.monorailAPI.getMONPriceUSD(false) // Use cache (price updates hourly)
            ]);

            // Process API responses

            // Process the data
            const monBalance = parseFloat(monBalanceData.balance || '0');
            const monPriceUSD = parseFloat(monPriceData.price || '0');
            const portfolioValueUSD = parseFloat(portfolioValueData.value || '0');
            const portfolioValueMON = monPriceUSD > 0 ? portfolioValueUSD / monPriceUSD : 0;
            const monValueUSD = monBalance * monPriceUSD;

            // Values processed for display

            const { text, keyboard } = InterfaceUtils.generateMainInterface(
                user, monBalance, monPriceUSD, portfolioValueUSD
            );

            // Update the message with fresh data
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup
            });

            await ctx.answerCbQuery('✅ Data refreshed successfully!');
        } catch (error) {
            this.monitoring.logError('Refresh with welcome failed', error, { userId });
            await ctx.answerCbQuery('❌ Refresh failed. Please try again.');
        }
    }

    async handleRefresh(ctx) {
        const userId = ctx.from.id;
        
        try {
            await ctx.answerCbQuery('🔄 Refreshing...');
            
            // Get fresh user data first
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.answerCbQuery('⚠️ User not found');
                return;
            }

            // For refresh button, force fresh data
            // Use cached data for faster response, only force refresh on explicit refresh button
            const [monBalanceData, portfolioValueData, monPriceData] = await Promise.all([
                this.monorailAPI.getMONBalance(user.wallet_address, true), // Use cached data
                this.monorailAPI.getPortfolioValue(user.wallet_address, true), // Use cached data
                this.monorailAPI.getMONPriceUSD(false) // Use cache (price updates hourly)
            ]);

            // Process the data
            const monBalance = parseFloat(monBalanceData.balance || '0');
            const monPriceUSD = parseFloat(monPriceData.price || '0');
            const portfolioValueUSD = parseFloat(portfolioValueData.value || '0');

            const { text, keyboard } = InterfaceUtils.generateMainInterface(
                user, monBalance, monPriceUSD, portfolioValueUSD
            );

            // Update the message with fresh data
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup
            });

            await ctx.answerCbQuery('✅ Data refreshed successfully!');
        } catch (error) {
            this.monitoring.logError('Refresh failed', error, { userId });
            await ctx.answerCbQuery('❌ Refresh failed. Please try again.');
        }
    }

    async handlePortfolioAction(ctx) {
        const userId = ctx.from.id;
        
        try {
            await ctx.answerCbQuery();
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            const portfolioDisplay = await this.portfolioService.getPortfolioDisplay(userId, user.wallet_address, 1, false);
            
            await ctx.editMessageText(portfolioDisplay.text, {
                parse_mode: 'HTML',
                reply_markup: portfolioDisplay.keyboard
            });
        } catch (error) {
            this.monitoring.logError('Portfolio display failed', error, { userId });
            await ctx.reply('❌ Error loading portfolio. Please try again.');
        }
    }

    async handlePortfolioMore(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                await ctx.reply('❌ Please start the bot first with /start');
                return;
            }

            // Get full portfolio data
            const portfolio = await this.portfolioManager.getPortfolio(user.wallet_address);
            
            // Filter tokens with meaningful balance (>= 0.01 MON value) and exclude MON
            const significantTokens = portfolio.filter(token => {
                const monValue = parseFloat(token.mon_value || '0');
                const isNotMON = token.address !== '0x0000000000000000000000000000000000000000';
                return isNotMON && monValue >= 0.01;
            });

            if (significantTokens.length === 0) {
                await ctx.editMessageText('📊 <b>Full Portfolio</b>\n\n<i>No significant token holdings found.</i>\n\n💡 <i>Tokens worth less than 0.01 MON are hidden.</i>', {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Back to Summary', 'main')]
                    ]).reply_markup
                });
                return;
            }

            let portfolioText = `📊 <b>Full Portfolio</b>\n\n`;
            let totalValue = 0;

            significantTokens.forEach((token, index) => {
                const balance = parseFloat(token.balance || '0').toFixed(6);
                const monValue = parseFloat(token.mon_value || '0');
                const usdValue = parseFloat(token.usd_value || '0');
                
                totalValue += monValue;
                
                portfolioText += `${index + 1}. <b>${token.symbol}</b> (${token.name})\n`;
                portfolioText += `   • Balance: ${balance} ${token.symbol}\n`;
                portfolioText += `   • Value: ${monValue.toFixed(4)} MON`;
                if (usdValue > 0) {
                    portfolioText += ` (~$${usdValue.toFixed(2)})`;
                }
                portfolioText += `\n\n`;
            });

            portfolioText += `💰 <b>Total Portfolio Value:</b> ${totalValue.toFixed(4)} MON\n`;
            portfolioText += `📈 <b>Token Count:</b> ${significantTokens.length}`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh Portfolio', 'refresh')],
                [Markup.button.callback('🔙 Back to Summary', 'main')]
            ]);

            await ctx.editMessageText(portfolioText, {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup
            });

        } catch (error) {
            this.monitoring.logError('Portfolio more display failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading full portfolio. Please try again.');
        }
    }
}

module.exports = PortfolioHandlers;
