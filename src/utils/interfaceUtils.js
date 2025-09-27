const { Markup } = require('telegraf');

class InterfaceUtils {
    /**
     * Generate the main welcome interface text and keyboard
     * @param {Object} user - User object with wallet_address
     * @param {number} monBalance - MON balance
     * @param {number} monPriceUSD - MON price in USD
     * @param {number} portfolioValueUSD - Portfolio value in USD
     * @returns {Object} - {text, keyboard}
     */
    static generateMainInterface(user, monBalance, monPriceUSD, portfolioValueUSD) {
        const portfolioValueMON = monPriceUSD > 0 ? portfolioValueUSD / monPriceUSD : 0;
        const monValueUSD = monBalance * monPriceUSD;

        const welcomeText = `🛸 *Welcome to Area51!*
_The main area for real nads!_

🧾 *Your Wallet Address:*
\`${user.wallet_address}\`

💼 *Balance:*
• MON: ${monBalance.toFixed(2)} ~$${monValueUSD.toFixed(2)}
• Portfolio Value: ${portfolioValueMON.toFixed(2)} MON ~$${portfolioValueUSD.toFixed(2)}

🟣 *Current MON Price:* $${monPriceUSD.toFixed(2)}

📖 *Check the Docs button to learn what you can do with this bot.*

💡 Click on the Refresh button to update your current balance.`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('💰 Buy', 'buy')],
            [Markup.button.callback('👛 Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
            [Markup.button.callback('📈 Categories', 'token_categories'), Markup.button.callback('⚙️ Settings', 'settings')],
            [Markup.button.callback('📤 Transfer', 'transfer'), Markup.button.callback('🔄 Refresh', 'refresh')],
            [Markup.button.url('📚 Docs', 'https://area51-1.gitbook.io/area51/')]
        ]);

        return { text: welcomeText, keyboard };
    }

    /**
     * Generate new user welcome interface
     * @returns {Object} - {text, keyboard}
     */
    static generateNewUserInterface() {
        const welcomeText = `*🛸 Welcome to Area51!*
_The main area for real nads!_

To get started, you need to create or import a wallet:`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Generate New Wallet', 'generate_wallet')],
            [Markup.button.callback('📥 Import Existing Wallet', 'import_wallet')]
        ]);

        return { text: welcomeText, keyboard };
    }

    /**
     * Generate wallet success interface with start trading button
     * @param {string} walletAddress - Wallet address
     * @param {string} type - 'created' or 'imported'
     * @returns {Object} - {text, keyboard}
     */
    static generateWalletSuccessInterface(walletAddress, type = 'created') {
        const action = type === 'created' ? 'created' : 'imported';
        const text = `✅ *Wallet ${action.charAt(0).toUpperCase() + action.slice(1)} Successfully!*

🏠 *Address:* \`${walletAddress}\`

Your wallet has been ${action} and encrypted securely.`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Start Trading', 'back_to_main')]
        ]);

        return { text, keyboard };
    }

    /**
     * Safe message edit with fallback to new message
     * @param {Object} ctx - Telegram context
     * @param {string} text - Message text
     * @param {Object} keyboard - Keyboard markup
     * @param {Object} options - Additional options
     */
    static async safeEditMessage(ctx, text, keyboard, options = {}) {
        const messageOptions = {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup,
            ...options
        };

        try {
            await ctx.editMessageText(text, messageOptions);
        } catch (editError) {
            try {
                await ctx.deleteMessage();
                await ctx.replyWithMarkdown(text, keyboard);
            } catch (deleteError) {
                await ctx.replyWithMarkdown(text, keyboard);
            }
        }
    }
}

module.exports = InterfaceUtils;
