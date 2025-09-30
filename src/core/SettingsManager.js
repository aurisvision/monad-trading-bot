/**
 * SettingsManager - Handles all settings-related functionality for Area51 Bot
 * Extracted from main bot file for better modularity and maintainability
 */

const { Markup } = require('telegraf');

class SettingsManager {
    constructor(bot, database, monitoring) {
        this.bot = bot;
        this.database = database;
        this.monitoring = monitoring;
    }

    /**
     * Setup all settings-related handlers
     */
    setupHandlers() {
        // Settings handlers
        this.bot.action('settings', async (ctx) => {
            await this.showSettings(ctx);
        });

        // Buy Settings handlers
        this.bot.action('buy_settings', async (ctx) => {
            await this.showBuySettings(ctx);
        });

        this.bot.action('buy_gas_settings', async (ctx) => {
            await this.showBuyGasSettings(ctx);
        });

        this.bot.action('buy_slippage_settings', async (ctx) => {
            await this.showBuySlippageSettings(ctx);
        });

        // Auto Buy handlers
        this.bot.action('auto_buy_settings', async (ctx) => {
            await this.showAutoBuySettings(ctx);
        });

        this.bot.action('toggle_auto_buy', async (ctx) => {
            await this.toggleAutoBuy(ctx);
        });

        this.bot.action('auto_buy_amount', async (ctx) => {
            await this.showAutoBuyAmount(ctx);
        });

        // Sell Settings handlers
        this.bot.action('sell_settings', async (ctx) => {
            await this.showSellSettings(ctx);
        });

        this.bot.action('sell_gas_settings', async (ctx) => {
            await this.showSellGasSettings(ctx);
        });

        this.bot.action('sell_slippage_settings', async (ctx) => {
            await this.showSellSlippageSettings(ctx);
        });

        // Gas Settings handlers - specific handlers for defined buttons
        this.setupGasHandlers();

        // Slippage Settings handlers - specific handlers for defined buttons
        this.setupSlippageHandlers();

        // Auto Buy Amount handlers - specific handlers only
        this.setupAutoBuyAmountHandlers();

        // Custom handlers
        this.setupCustomHandlers();

        console.log('✅ Settings handlers setup complete');
    }

    /**
     * Setup gas-related handlers
     */
    setupGasHandlers() {
        this.bot.action('set_buy_gas_50', async (ctx) => {
            await this.updateGasSetting(ctx, 'gas_price', 50 * 1000000000, 'buy_settings');
        });

        this.bot.action('set_buy_gas_100', async (ctx) => {
            await this.updateGasSetting(ctx, 'gas_price', 100 * 1000000000, 'buy_settings');
        });

        this.bot.action('set_sell_gas_50', async (ctx) => {
            await this.updateGasSetting(ctx, 'sell_gas_price', 50 * 1000000000, 'sell_settings');
        });

        this.bot.action('set_sell_gas_100', async (ctx) => {
            await this.updateGasSetting(ctx, 'sell_gas_price', 100 * 1000000000, 'sell_settings');
        });

        // Custom Gas handlers
        this.bot.action('buy_gas_custom', async (ctx) => {
            await this.showCustomGas(ctx, 'buy');
        });

        this.bot.action('sell_gas_custom', async (ctx) => {
            await this.showCustomGas(ctx, 'sell');
        });
    }

    /**
     * Setup slippage-related handlers
     */
    setupSlippageHandlers() {
        this.bot.action('set_buy_slippage_1', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 1, 'buy_settings');
        });

        this.bot.action('set_buy_slippage_3', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 3, 'buy_settings');
        });

        this.bot.action('set_buy_slippage_5', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 5, 'buy_settings');
        });

        this.bot.action('set_buy_slippage_10', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'slippage_tolerance', 10, 'buy_settings');
        });

        this.bot.action('set_sell_slippage_1', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 1, 'sell_settings');
        });

        this.bot.action('set_sell_slippage_3', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 3, 'sell_settings');
        });

        this.bot.action('set_sell_slippage_5', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 5, 'sell_settings');
        });

        this.bot.action('set_sell_slippage_10', async (ctx) => {
            await this.updateSlippageSetting(ctx, 'sell_slippage_tolerance', 10, 'sell_settings');
        });

        // Custom Slippage handlers
        this.bot.action('buy_slippage_custom', async (ctx) => {
            await this.showCustomSlippage(ctx, 'buy');
        });

        this.bot.action('sell_slippage_custom', async (ctx) => {
            await this.showCustomSlippage(ctx, 'sell');
        });
    }

    /**
     * Setup auto buy amount handlers
     */
    setupAutoBuyAmountHandlers() {
        this.bot.action('set_auto_buy_0.1', async (ctx) => {
            await this.updateAutoBuyAmount(ctx, 0.1);
        });

        this.bot.action('set_auto_buy_0.5', async (ctx) => {
            await this.updateAutoBuyAmount(ctx, 0.5);
        });

        this.bot.action('set_auto_buy_1', async (ctx) => {
            await this.updateAutoBuyAmount(ctx, 1);
        });

        this.bot.action('set_auto_buy_2', async (ctx) => {
            await this.updateAutoBuyAmount(ctx, 2);
        });

        this.bot.action('set_auto_buy_5', async (ctx) => {
            await this.updateAutoBuyAmount(ctx, 5);
        });

        this.bot.action('auto_buy_amount_custom', async (ctx) => {
            await this.showCustomAmount(ctx, 'auto_buy');
        });
    }

    /**
     * Setup custom input handlers
     */
    setupCustomHandlers() {
        // Auto Buy Gas and Slippage Settings
        this.bot.action('auto_buy_gas_settings', async (ctx) => {
            await this.showAutoBuyGasSettings(ctx);
        });

        this.bot.action('auto_buy_slippage_settings', async (ctx) => {
            await this.showAutoBuySlippageSettings(ctx);
        });

        // Custom Buy Amounts and Sell Percentages
        this.bot.action('custom_buy_amounts', async (ctx) => {
            await this.showCustomBuyAmounts(ctx);
        });

        this.bot.action('custom_sell_percentages', async (ctx) => {
            await this.showCustomSellPercentages(ctx);
        });

        // Reset handlers
        this.bot.action('reset_custom_buy_amounts', async (ctx) => {
            await this.resetCustomBuyAmounts(ctx);
        });

        this.bot.action('reset_custom_sell_percentages', async (ctx) => {
            await this.resetCustomSellPercentages(ctx);
        });
    }

    /**
     * Show main settings menu
     */
    async showSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            
            const turboStatus = userSettings.turbo_mode ? '🟢 Enabled' : '🔴 Disabled';
            const autoBuyStatus = userSettings.auto_buy_enabled ? '🟢 Enabled' : '🔴 Disabled';
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💰 Buy Settings', 'buy_settings')],
                [Markup.button.callback('💸 Sell Settings', 'sell_settings')],
                [Markup.button.callback('🤖 Auto Buy Settings', 'auto_buy_settings')],
                [Markup.button.callback(`⚡ Turbo Mode: ${turboStatus}`, 'toggle_turbo_mode')],
                [Markup.button.callback('🔙 Back to Main Menu', 'start')]
            ]);

            const message = `⚙️ *Settings Menu*\n\n` +
                `Current Status:\n` +
                `⚡ Turbo Mode: ${turboStatus}\n` +
                `🤖 Auto Buy: ${autoBuyStatus}\n\n` +
                `Configure your trading preferences below:`;

            if (ctx.callbackQuery) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            }
        } catch (error) {
            this.monitoring?.logError('Error showing settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading settings. Please try again.');
        }
    }

    /**
     * Show buy settings menu
     */
    async showBuySettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            
            const gasPrice = userSettings.gas_price ? (userSettings.gas_price / 1000000000).toFixed(1) : '50.0';
            const slippage = userSettings.slippage_tolerance || 5;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('⛽ Gas Settings', 'buy_gas_settings')],
                [Markup.button.callback('📊 Slippage Settings', 'buy_slippage_settings')],
                [Markup.button.callback('💰 Custom Buy Amounts', 'custom_buy_amounts')],
                [Markup.button.callback('🔙 Back to Settings', 'settings')]
            ]);

            const message = `💰 *Buy Settings*\n\n` +
                `Current Configuration:\n` +
                `⛽ Gas Price: ${gasPrice} Gwei\n` +
                `📊 Slippage: ${slippage}%\n\n` +
                `Adjust your buy transaction settings:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing buy settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading buy settings. Please try again.');
        }
    }

    /**
     * Show buy gas settings
     */
    async showBuyGasSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            const currentGas = userSettings.gas_price ? (userSettings.gas_price / 1000000000).toFixed(1) : '50.0';
            
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('50 Gwei', 'set_buy_gas_50'),
                    Markup.button.callback('100 Gwei', 'set_buy_gas_100')
                ],
                [Markup.button.callback('🔧 Custom', 'buy_gas_custom')],
                [Markup.button.callback('🔙 Back', 'buy_settings')]
            ]);

            const message = `⛽ *Buy Gas Settings*\n\n` +
                `Current: ${currentGas} Gwei\n\n` +
                `Select gas price for buy transactions:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing buy gas settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading gas settings. Please try again.');
        }
    }

    /**
     * Show buy slippage settings
     */
    async showBuySlippageSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            const currentSlippage = userSettings.slippage_tolerance || 5;
            
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('1%', 'set_buy_slippage_1'),
                    Markup.button.callback('3%', 'set_buy_slippage_3')
                ],
                [
                    Markup.button.callback('5%', 'set_buy_slippage_5'),
                    Markup.button.callback('10%', 'set_buy_slippage_10')
                ],
                [Markup.button.callback('🔧 Custom', 'buy_slippage_custom')],
                [Markup.button.callback('🔙 Back', 'buy_settings')]
            ]);

            const message = `📊 *Buy Slippage Settings*\n\n` +
                `Current: ${currentSlippage}%\n\n` +
                `Select slippage tolerance for buy transactions:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing buy slippage settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading slippage settings. Please try again.');
        }
    }

    /**
     * Show auto buy settings
     */
    async showAutoBuySettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            
            const autoBuyStatus = userSettings.auto_buy_enabled ? '🟢 Enabled' : '🔴 Disabled';
            const autoBuyAmount = userSettings.auto_buy_amount || 0.1;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback(`Toggle Auto Buy: ${autoBuyStatus}`, 'toggle_auto_buy')],
                [Markup.button.callback('💰 Auto Buy Amount', 'auto_buy_amount')],
                [Markup.button.callback('⛽ Auto Buy Gas', 'auto_buy_gas_settings')],
                [Markup.button.callback('📊 Auto Buy Slippage', 'auto_buy_slippage_settings')],
                [Markup.button.callback('🔙 Back to Settings', 'settings')]
            ]);

            const message = `🤖 *Auto Buy Settings*\n\n` +
                `Status: ${autoBuyStatus}\n` +
                `Amount: ${autoBuyAmount} MON\n\n` +
                `Configure automatic buying when new tokens are detected:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing auto buy settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading auto buy settings. Please try again.');
        }
    }

    /**
     * Toggle auto buy functionality
     */
    async toggleAutoBuy(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            const newStatus = !userSettings.auto_buy_enabled;
            
            await this.database.updateUserSettings(userId, {
                auto_buy_enabled: newStatus
            });
            
            const statusText = newStatus ? '🟢 Enabled' : '🔴 Disabled';
            await ctx.answerCbQuery(`Auto Buy ${statusText}`);
            
            // Refresh the auto buy settings menu
            await this.showAutoBuySettings(ctx);
            
        } catch (error) {
            this.monitoring?.logError('Error toggling auto buy', error, { userId: ctx.from?.id });
            await ctx.answerCbQuery('❌ Error updating auto buy setting');
        }
    }

    /**
     * Show auto buy amount settings
     */
    async showAutoBuyAmount(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            const currentAmount = userSettings.auto_buy_amount || 0.1;
            
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('0.1 MON', 'set_auto_buy_0.1'),
                    Markup.button.callback('0.5 MON', 'set_auto_buy_0.5')
                ],
                [
                    Markup.button.callback('1 MON', 'set_auto_buy_1'),
                    Markup.button.callback('2 MON', 'set_auto_buy_2')
                ],
                [Markup.button.callback('5 MON', 'set_auto_buy_5')],
                [Markup.button.callback('🔧 Custom', 'auto_buy_amount_custom')],
                [Markup.button.callback('🔙 Back', 'auto_buy_settings')]
            ]);

            const message = `💰 *Auto Buy Amount*\n\n` +
                `Current: ${currentAmount} MON\n\n` +
                `Select amount for automatic purchases:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing auto buy amount', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading auto buy amount settings. Please try again.');
        }
    }

    /**
     * Show sell settings menu
     */
    async showSellSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            
            const gasPrice = userSettings.sell_gas_price ? (userSettings.sell_gas_price / 1000000000).toFixed(1) : '50.0';
            const slippage = userSettings.sell_slippage_tolerance || 5;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('⛽ Gas Settings', 'sell_gas_settings')],
                [Markup.button.callback('📊 Slippage Settings', 'sell_slippage_settings')],
                [Markup.button.callback('💸 Custom Sell Percentages', 'custom_sell_percentages')],
                [Markup.button.callback('🔙 Back to Settings', 'settings')]
            ]);

            const message = `💸 *Sell Settings*\n\n` +
                `Current Configuration:\n` +
                `⛽ Gas Price: ${gasPrice} Gwei\n` +
                `📊 Slippage: ${slippage}%\n\n` +
                `Adjust your sell transaction settings:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing sell settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading sell settings. Please try again.');
        }
    }

    /**
     * Show sell gas settings
     */
    async showSellGasSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            const currentGas = userSettings.sell_gas_price ? (userSettings.sell_gas_price / 1000000000).toFixed(1) : '50.0';
            
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('50 Gwei', 'set_sell_gas_50'),
                    Markup.button.callback('100 Gwei', 'set_sell_gas_100')
                ],
                [Markup.button.callback('🔧 Custom', 'sell_gas_custom')],
                [Markup.button.callback('🔙 Back', 'sell_settings')]
            ]);

            const message = `⛽ *Sell Gas Settings*\n\n` +
                `Current: ${currentGas} Gwei\n\n` +
                `Select gas price for sell transactions:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing sell gas settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading sell gas settings. Please try again.');
        }
    }

    /**
     * Show sell slippage settings
     */
    async showSellSlippageSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const userSettings = await this.database.getUserSettings(userId);
            const currentSlippage = userSettings.sell_slippage_tolerance || 5;
            
            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('1%', 'set_sell_slippage_1'),
                    Markup.button.callback('3%', 'set_sell_slippage_3')
                ],
                [
                    Markup.button.callback('5%', 'set_sell_slippage_5'),
                    Markup.button.callback('10%', 'set_sell_slippage_10')
                ],
                [Markup.button.callback('🔧 Custom', 'sell_slippage_custom')],
                [Markup.button.callback('🔙 Back', 'sell_settings')]
            ]);

            const message = `📊 *Sell Slippage Settings*\n\n` +
                `Current: ${currentSlippage}%\n\n` +
                `Select slippage tolerance for sell transactions:`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (error) {
            this.monitoring?.logError('Error showing sell slippage settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading sell slippage settings. Please try again.');
        }
    }

    /**
     * Update gas setting
     */
    async updateGasSetting(ctx, field, value, returnMenu) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const updateData = {};
            updateData[field] = value;
            
            await this.database.updateUserSettings(userId, updateData);
            
            const gasGwei = (value / 1000000000).toFixed(1);
            await ctx.answerCbQuery(`✅ Gas updated to ${gasGwei} Gwei`);
            
            // Return to appropriate menu
            if (returnMenu === 'buy_settings') {
                await this.showBuyGasSettings(ctx);
            } else if (returnMenu === 'sell_settings') {
                await this.showSellGasSettings(ctx);
            }
            
        } catch (error) {
            this.monitoring?.logError('Error updating gas setting', error, { userId: ctx.from?.id });
            await ctx.answerCbQuery('❌ Error updating gas setting');
        }
    }

    /**
     * Update slippage setting
     */
    async updateSlippageSetting(ctx, field, value, returnMenu) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            const updateData = {};
            updateData[field] = value;
            
            await this.database.updateUserSettings(userId, updateData);
            
            await ctx.answerCbQuery(`✅ Slippage updated to ${value}%`);
            
            // Return to appropriate menu
            if (returnMenu === 'buy_settings') {
                await this.showBuySlippageSettings(ctx);
            } else if (returnMenu === 'sell_settings') {
                await this.showSellSlippageSettings(ctx);
            }
            
        } catch (error) {
            this.monitoring?.logError('Error updating slippage setting', error, { userId: ctx.from?.id });
            await ctx.answerCbQuery('❌ Error updating slippage setting');
        }
    }

    /**
     * Update auto buy amount
     */
    async updateAutoBuyAmount(ctx, amount) {
        try {
            await ctx.answerCbQuery();
            
            const userId = ctx.from.id;
            await this.database.updateUserSettings(userId, {
                auto_buy_amount: amount
            });
            
            await ctx.answerCbQuery(`✅ Auto buy amount updated to ${amount} MON`);
            await this.showAutoBuyAmount(ctx);
            
        } catch (error) {
            this.monitoring?.logError('Error updating auto buy amount', error, { userId: ctx.from?.id });
            await ctx.answerCbQuery('❌ Error updating auto buy amount');
        }
    }

    /**
     * Show custom gas input
     */
    async showCustomGas(ctx, type) {
        try {
            await ctx.answerCbQuery();
            
            const message = `🔧 *Custom Gas Setting*\n\n` +
                `Please enter gas price in Gwei (e.g., 75):\n\n` +
                `Current range: 1-500 Gwei`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', `${type}_gas_settings`)]
                ]).reply_markup
            });

            // Set user state for custom gas input
            await this.database.setUserState(ctx.from.id, `custom_gas_${type}`);
            
        } catch (error) {
            this.monitoring?.logError('Error showing custom gas', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading custom gas input. Please try again.');
        }
    }

    /**
     * Show custom slippage input
     */
    async showCustomSlippage(ctx, type) {
        try {
            await ctx.answerCbQuery();
            
            const message = `🔧 *Custom Slippage Setting*\n\n` +
                `Please enter slippage percentage (e.g., 7.5):\n\n` +
                `Current range: 0.1-50%`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', `${type}_slippage_settings`)]
                ]).reply_markup
            });

            // Set user state for custom slippage input
            await this.database.setUserState(ctx.from.id, `custom_slippage_${type}`);
            
        } catch (error) {
            this.monitoring?.logError('Error showing custom slippage', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading custom slippage input. Please try again.');
        }
    }

    /**
     * Show custom amount input
     */
    async showCustomAmount(ctx, type) {
        try {
            await ctx.answerCbQuery();
            
            const message = `🔧 *Custom Amount Setting*\n\n` +
                `Please enter amount in MON (e.g., 1.5):\n\n` +
                `Minimum: 0.01 MON`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', 'auto_buy_amount')]
                ]).reply_markup
            });

            // Set user state for custom amount input
            await this.database.setUserState(ctx.from.id, `custom_amount_${type}`);
            
        } catch (error) {
            this.monitoring?.logError('Error showing custom amount', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading custom amount input. Please try again.');
        }
    }

    /**
     * Show custom buy amounts
     */
    async showCustomBuyAmounts(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const message = `💰 *Custom Buy Amounts*\n\n` +
                `Feature coming soon!\n\n` +
                `This will allow you to set custom quick-buy amounts.`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', 'buy_settings')]
                ]).reply_markup
            });
            
        } catch (error) {
            this.monitoring?.logError('Error showing custom buy amounts', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading custom buy amounts. Please try again.');
        }
    }

    /**
     * Show custom sell percentages
     */
    async showCustomSellPercentages(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const message = `💸 *Custom Sell Percentages*\n\n` +
                `Feature coming soon!\n\n` +
                `This will allow you to set custom quick-sell percentages.`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', 'sell_settings')]
                ]).reply_markup
            });
            
        } catch (error) {
            this.monitoring?.logError('Error showing custom sell percentages', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading custom sell percentages. Please try again.');
        }
    }

    /**
     * Show auto buy gas settings
     */
    async showAutoBuyGasSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const message = `⛽ *Auto Buy Gas Settings*\n\n` +
                `Feature coming soon!\n\n` +
                `This will allow you to set specific gas settings for auto buy.`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', 'auto_buy_settings')]
                ]).reply_markup
            });
            
        } catch (error) {
            this.monitoring?.logError('Error showing auto buy gas settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading auto buy gas settings. Please try again.');
        }
    }

    /**
     * Show auto buy slippage settings
     */
    async showAutoBuySlippageSettings(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const message = `📊 *Auto Buy Slippage Settings*\n\n` +
                `Feature coming soon!\n\n` +
                `This will allow you to set specific slippage settings for auto buy.`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', 'auto_buy_settings')]
                ]).reply_markup
            });
            
        } catch (error) {
            this.monitoring?.logError('Error showing auto buy slippage settings', error, { userId: ctx.from?.id });
            await ctx.reply('❌ Error loading auto buy slippage settings. Please try again.');
        }
    }

    /**
     * Reset custom buy amounts
     */
    async resetCustomBuyAmounts(ctx) {
        try {
            await ctx.answerCbQuery('✅ Custom buy amounts reset to default');
            await this.showCustomBuyAmounts(ctx);
        } catch (error) {
            this.monitoring?.logError('Error resetting custom buy amounts', error, { userId: ctx.from?.id });
            await ctx.answerCbQuery('❌ Error resetting custom buy amounts');
        }
    }

    /**
     * Reset custom sell percentages
     */
    async resetCustomSellPercentages(ctx) {
        try {
            await ctx.answerCbQuery('✅ Custom sell percentages reset to default');
            await this.showCustomSellPercentages(ctx);
        } catch (error) {
            this.monitoring?.logError('Error resetting custom sell percentages', error, { userId: ctx.from?.id });
            await ctx.answerCbQuery('❌ Error resetting custom sell percentages');
        }
    }
}

module.exports = SettingsManager;