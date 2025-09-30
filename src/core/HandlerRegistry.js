/**
 * HandlerRegistry - Manages all handler registration for Area51 Bot
 * Extracted from main bot file for better modularity and maintainability
 */

class HandlerRegistry {
    constructor(bot, dependencies) {
        this.bot = bot;
        this.dependencies = dependencies;
        this.registeredHandlers = new Set();
    }

    /**
     * Register all handlers
     */
    async registerAllHandlers() {
        console.log('📝 Registering all handlers...');

        try {
            // Core handlers
            await this.registerCoreHandlers();
            
            // Navigation handlers
            await this.registerNavigationHandlers();
            
            // Wallet handlers
            await this.registerWalletHandlers();
            
            // Portfolio handlers
            await this.registerPortfolioHandlers();
            
            // Trading handlers
            await this.registerTradingHandlers();
            
            // Settings handlers (via SettingsManager)
            await this.registerSettingsHandlers();
            
            // Access handlers
            await this.registerAccessHandlers();
            
            // Additional handlers
            await this.registerAdditionalHandlers();

            console.log(`✅ All handlers registered successfully (${this.registeredHandlers.size} handlers)`);
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register handlers', error);
            throw error;
        }
    }

    /**
     * Register core handlers (start, help, etc.)
     */
    async registerCoreHandlers() {
        try {
            // Start command
            this.bot.start(async (ctx) => {
                await this.dependencies.navigationHandlers.showMainMenu(ctx);
            });
            this.registeredHandlers.add('start');

            // Help command
            this.bot.help(async (ctx) => {
                await this.dependencies.navigationHandlers.showHelp(ctx);
            });
            this.registeredHandlers.add('help');

            // Main menu action
            this.bot.action('start', async (ctx) => {
                await this.dependencies.navigationHandlers.showMainMenu(ctx);
            });
            this.registeredHandlers.add('action:start');

            console.log('✅ Core handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register core handlers', error);
            throw error;
        }
    }

    /**
     * Register navigation handlers
     */
    async registerNavigationHandlers() {
        try {
            const navigationActions = [
                'main_menu',
                'help',
                'about',
                'support',
                'refresh_main'
            ];

            for (const action of navigationActions) {
                this.bot.action(action, async (ctx) => {
                    await this.dependencies.navigationHandlers.handleNavigation(ctx, action);
                });
                this.registeredHandlers.add(`action:${action}`);
            }

            console.log('✅ Navigation handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register navigation handlers', error);
            throw error;
        }
    }

    /**
     * Register wallet handlers
     */
    async registerWalletHandlers() {
        try {
            const walletActions = [
                'wallet',
                'create_wallet',
                'import_wallet',
                'export_wallet',
                'wallet_balance',
                'wallet_transactions',
                'refresh_wallet'
            ];

            for (const action of walletActions) {
                this.bot.action(action, async (ctx) => {
                    await this.dependencies.walletHandlers.handleWalletAction(ctx, action);
                });
                this.registeredHandlers.add(`action:${action}`);
            }

            // Wallet command
            this.bot.command('wallet', async (ctx) => {
                await this.dependencies.walletHandlers.showWallet(ctx);
            });
            this.registeredHandlers.add('command:wallet');

            console.log('✅ Wallet handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register wallet handlers', error);
            throw error;
        }
    }

    /**
     * Register portfolio handlers
     */
    async registerPortfolioHandlers() {
        try {
            const portfolioActions = [
                'portfolio',
                'refresh_portfolio',
                'portfolio_details',
                'token_details',
                'portfolio_history'
            ];

            for (const action of portfolioActions) {
                this.bot.action(action, async (ctx) => {
                    await this.dependencies.portfolioHandlers.handlePortfolioAction(ctx, action);
                });
                this.registeredHandlers.add(`action:${action}`);
            }

            // Portfolio command
            this.bot.command('portfolio', async (ctx) => {
                await this.dependencies.portfolioHandlers.showPortfolio(ctx);
            });
            this.registeredHandlers.add('command:portfolio');

            // Token-specific handlers with dynamic routing
            this.bot.action(/^token_(.+)$/, async (ctx) => {
                const tokenAddress = ctx.match[1];
                await this.dependencies.portfolioHandlers.showTokenDetails(ctx, tokenAddress);
            });
            this.registeredHandlers.add('action:token_*');

            console.log('✅ Portfolio handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register portfolio handlers', error);
            throw error;
        }
    }

    /**
     * Register trading handlers
     */
    async registerTradingHandlers() {
        try {
            // Buy/Sell actions
            const tradingActions = [
                'buy',
                'sell',
                'quick_buy',
                'quick_sell',
                'custom_buy',
                'custom_sell'
            ];

            for (const action of tradingActions) {
                this.bot.action(action, async (ctx) => {
                    await this.dependencies.tradingInterface.handleTradingAction(ctx, action);
                });
                this.registeredHandlers.add(`action:${action}`);
            }

            // Buy/Sell commands
            this.bot.command('buy', async (ctx) => {
                await this.dependencies.tradingInterface.showBuyInterface(ctx);
            });
            this.registeredHandlers.add('command:buy');

            this.bot.command('sell', async (ctx) => {
                await this.dependencies.tradingInterface.showSellInterface(ctx);
            });
            this.registeredHandlers.add('command:sell');

            // Token-specific trading handlers
            this.bot.action(/^buy_(.+)$/, async (ctx) => {
                const tokenAddress = ctx.match[1];
                await this.dependencies.tradingInterface.showBuyInterface(ctx, tokenAddress);
            });
            this.registeredHandlers.add('action:buy_*');

            this.bot.action(/^sell_(.+)$/, async (ctx) => {
                const tokenAddress = ctx.match[1];
                await this.dependencies.tradingInterface.showSellInterface(ctx, tokenAddress);
            });
            this.registeredHandlers.add('action:sell_*');

            // Quick buy amounts
            const quickBuyAmounts = ['0.1', '0.5', '1', '2', '5'];
            for (const amount of quickBuyAmounts) {
                this.bot.action(`quick_buy_${amount}`, async (ctx) => {
                    await this.dependencies.tradingInterface.handleQuickBuy(ctx, parseFloat(amount));
                });
                this.registeredHandlers.add(`action:quick_buy_${amount}`);
            }

            // Quick sell percentages
            const quickSellPercentages = ['25', '50', '75', '100'];
            for (const percentage of quickSellPercentages) {
                this.bot.action(`quick_sell_${percentage}`, async (ctx) => {
                    await this.dependencies.tradingInterface.handleQuickSell(ctx, parseInt(percentage));
                });
                this.registeredHandlers.add(`action:quick_sell_${percentage}`);
            }

            console.log('✅ Trading handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register trading handlers', error);
            throw error;
        }
    }

    /**
     * Register settings handlers via SettingsManager
     */
    async registerSettingsHandlers() {
        try {
            // Settings handlers are managed by SettingsManager
            if (this.dependencies.settingsManager) {
                await this.dependencies.settingsManager.setupHandlers();
                this.registeredHandlers.add('settings_manager');
            }

            // Turbo mode toggle
            this.bot.action('toggle_turbo_mode', async (ctx) => {
                await this.handleTurboModeToggle(ctx);
            });
            this.registeredHandlers.add('action:toggle_turbo_mode');

            console.log('✅ Settings handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register settings handlers', error);
            throw error;
        }
    }

    /**
     * Register access handlers
     */
    async registerAccessHandlers() {
        try {
            // Access code handlers are managed by SimpleAccessCode
            if (this.dependencies.simpleAccessCode) {
                await this.dependencies.simpleAccessCode.setupHandlers();
                this.registeredHandlers.add('access_handlers');
            }

            console.log('✅ Access handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register access handlers', error);
            throw error;
        }
    }

    /**
     * Register additional handlers (text inputs, etc.)
     */
    async registerAdditionalHandlers() {
        try {
            // Text message handler for various inputs
            this.bot.on('text', async (ctx) => {
                await this.handleTextInput(ctx);
            });
            this.registeredHandlers.add('on:text');

            // Callback query handler for unhandled callbacks
            this.bot.on('callback_query', async (ctx) => {
                await this.handleUnhandledCallback(ctx);
            });
            this.registeredHandlers.add('on:callback_query');

            // Document handler for wallet imports
            this.bot.on('document', async (ctx) => {
                await this.handleDocumentUpload(ctx);
            });
            this.registeredHandlers.add('on:document');

            console.log('✅ Additional handlers registered');
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Failed to register additional handlers', error);
            throw error;
        }
    }

    /**
     * Handle turbo mode toggle
     */
    async handleTurboModeToggle(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.dependencies.database.getUserSettings(userId);
            const newTurboMode = !userSettings.turbo_mode;
            
            await this.dependencies.database.updateUserSettings(userId, {
                turbo_mode: newTurboMode
            });
            
            const statusText = newTurboMode ? '🟢 Enabled' : '🔴 Disabled';
            await ctx.answerCbQuery(`Turbo Mode ${statusText}`);
            
            // Refresh settings menu
            if (this.dependencies.settingsManager) {
                await this.dependencies.settingsManager.showSettings(ctx);
            }
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Error toggling turbo mode', error, { userId: ctx.from?.id });
            await ctx.answerCbQuery('❌ Error updating turbo mode setting');
        }
    }

    /**
     * Handle text input based on user state
     */
    async handleTextInput(ctx) {
        try {
            const userId = ctx.from.id;
            const text = ctx.message.text;
            const userState = await this.dependencies.database.getUserState(userId);

            if (!userState) {
                // No specific state, show main menu
                await this.dependencies.navigationHandlers.showMainMenu(ctx);
                return;
            }

            // Handle different input states
            switch (userState) {
                case 'awaiting_access_code':
                    await this.dependencies.simpleAccessCode.handleAccessCodeInput(ctx, text);
                    break;
                    
                case 'awaiting_private_key':
                    await this.dependencies.walletHandlers.handlePrivateKeyInput(ctx, text);
                    break;
                    
                case 'awaiting_token_address':
                    await this.dependencies.tradingInterface.handleTokenAddressInput(ctx, text);
                    break;
                    
                case 'custom_gas_buy':
                case 'custom_gas_sell':
                    await this.handleCustomGasInput(ctx, text, userState);
                    break;
                    
                case 'custom_slippage_buy':
                case 'custom_slippage_sell':
                    await this.handleCustomSlippageInput(ctx, text, userState);
                    break;
                    
                case 'custom_amount_auto_buy':
                    await this.handleCustomAmountInput(ctx, text, userState);
                    break;
                    
                default:
                    // Unknown state, clear it and show main menu
                    await this.dependencies.database.clearUserState(userId);
                    await this.dependencies.navigationHandlers.showMainMenu(ctx);
                    break;
            }
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Error handling text input', error, { 
                userId: ctx.from?.id,
                text: ctx.message?.text?.substring(0, 50) // Log first 50 chars only
            });
            
            await ctx.reply('❌ Error processing your input. Please try again.');
        }
    }

    /**
     * Handle custom gas input
     */
    async handleCustomGasInput(ctx, text, state) {
        try {
            const gasValue = parseFloat(text);
            
            if (isNaN(gasValue) || gasValue < 1 || gasValue > 500) {
                await ctx.reply('❌ Invalid gas price. Please enter a value between 1 and 500 Gwei.');
                return;
            }
            
            const userId = ctx.from.id;
            const gasWei = gasValue * 1000000000;
            
            if (state === 'custom_gas_buy') {
                await this.dependencies.database.updateUserSettings(userId, {
                    gas_price: gasWei
                });
                await ctx.reply(`✅ Buy gas price updated to ${gasValue} Gwei`);
            } else {
                await this.dependencies.database.updateUserSettings(userId, {
                    sell_gas_price: gasWei
                });
                await ctx.reply(`✅ Sell gas price updated to ${gasValue} Gwei`);
            }
            
            // Clear user state
            await this.dependencies.database.clearUserState(userId);
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Error handling custom gas input', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error updating gas price. Please try again.');
        }
    }

    /**
     * Handle custom slippage input
     */
    async handleCustomSlippageInput(ctx, text, state) {
        try {
            const slippageValue = parseFloat(text);
            
            if (isNaN(slippageValue) || slippageValue < 0.1 || slippageValue > 50) {
                await ctx.reply('❌ Invalid slippage. Please enter a value between 0.1 and 50%.');
                return;
            }
            
            const userId = ctx.from.id;
            
            if (state === 'custom_slippage_buy') {
                await this.dependencies.database.updateUserSettings(userId, {
                    slippage_tolerance: slippageValue
                });
                await ctx.reply(`✅ Buy slippage updated to ${slippageValue}%`);
            } else {
                await this.dependencies.database.updateUserSettings(userId, {
                    sell_slippage_tolerance: slippageValue
                });
                await ctx.reply(`✅ Sell slippage updated to ${slippageValue}%`);
            }
            
            // Clear user state
            await this.dependencies.database.clearUserState(userId);
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Error handling custom slippage input', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error updating slippage. Please try again.');
        }
    }

    /**
     * Handle custom amount input
     */
    async handleCustomAmountInput(ctx, text, state) {
        try {
            const amountValue = parseFloat(text);
            
            if (isNaN(amountValue) || amountValue < 0.01) {
                await ctx.reply('❌ Invalid amount. Please enter a value of at least 0.01 MON.');
                return;
            }
            
            const userId = ctx.from.id;
            
            if (state === 'custom_amount_auto_buy') {
                await this.dependencies.database.updateUserSettings(userId, {
                    auto_buy_amount: amountValue
                });
                await ctx.reply(`✅ Auto buy amount updated to ${amountValue} MON`);
            }
            
            // Clear user state
            await this.dependencies.database.clearUserState(userId);
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Error handling custom amount input', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error updating amount. Please try again.');
        }
    }

    /**
     * Handle unhandled callback queries
     */
    async handleUnhandledCallback(ctx) {
        try {
            // If callback query wasn't handled by specific handlers, answer it
            if (ctx.callbackQuery && !ctx.callbackQuery.answered) {
                await ctx.answerCbQuery('Action not recognized. Please try again.');
                
                this.dependencies.monitoring?.logActivity('unhandled_callback', {
                    userId: ctx.from?.id,
                    data: ctx.callbackQuery.data,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            this.dependencies.monitoring?.logError('Error handling unhandled callback', error, { 
                userId: ctx.from?.id,
                callbackData: ctx.callbackQuery?.data 
            });
        }
    }

    /**
     * Handle document uploads
     */
    async handleDocumentUpload(ctx) {
        try {
            const userId = ctx.from.id;
            const userState = await this.dependencies.database.getUserState(userId);
            
            if (userState === 'awaiting_wallet_file') {
                await this.dependencies.walletHandlers.handleWalletFileUpload(ctx);
            } else {
                await ctx.reply('📄 Document received, but no action is currently expected. Please use the menu to navigate.');
            }
            
        } catch (error) {
            this.dependencies.monitoring?.logError('Error handling document upload', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error processing document. Please try again.');
        }
    }

    /**
     * Get registration statistics
     */
    getRegistrationStats() {
        return {
            totalHandlers: this.registeredHandlers.size,
            handlers: Array.from(this.registeredHandlers).sort()
        };
    }

    /**
     * Check if a specific handler is registered
     */
    isHandlerRegistered(handlerName) {
        return this.registeredHandlers.has(handlerName);
    }
}

module.exports = HandlerRegistry;