// Wallet Management Handlers
const { Markup } = require('telegraf');
const InterfaceUtils = require('../utils/interfaceUtils');

class WalletHandlers {
    constructor(bot, database, walletManager, monitoring, redis = null, cacheService = null) {
        this.bot = bot;
        this.database = database;
        this.walletManager = walletManager;
        this.monitoring = monitoring;
        this.redis = redis;
        this.cacheService = cacheService;
    }

    setupHandlers() {
        // Wallet management handlers
        this.bot.action('wallet', async (ctx) => {
            await this.showWalletInterface(ctx);
        });

        this.bot.action('generate_wallet', async (ctx) => {
            await this.handleGenerateWallet(ctx);
        });

        this.bot.action('import_wallet', async (ctx) => {
            await this.handleImportWallet(ctx);
        });

        this.bot.action('export_private_key', async (ctx) => {
            await this.handleExportPrivateKey(ctx);
        });

        this.bot.action('delete_wallet', async (ctx) => {
            await this.handleDeleteWallet(ctx);
        });

        this.bot.action('confirm_delete_wallet', async (ctx) => {
            await this.handleConfirmDeleteWallet(ctx);
        });

        // Reveal handlers for security
        this.bot.action(/^reveal_key_(.+)$/, async (ctx) => {
            await this.handleRevealPrivateKey(ctx);
        });
    }

    async showWalletInterface(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                return ctx.reply('❌ No wallet found. Please create one first.');
            }

            const walletText = `👛 *Wallet Management*

*Address:* \`${user.wallet_address}\`

Manage your wallet securely:`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔑 Export Private Key', 'export_private_key')],
                [Markup.button.callback('🗑️ Delete Wallet', 'delete_wallet')],
                [Markup.button.callback('🔙 Back to Main', 'back_to_main')]
            ]);

            try {
                await ctx.editMessageText(walletText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (error) {
                await ctx.replyWithMarkdown(walletText, keyboard);
            }
            
        } catch (error) {
            this.monitoring.logError('Wallet interface failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading wallet interface.');
        }
    }

    async handleGenerateWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            // Ensure user exists in database before wallet generation
            await this.database.createUser(ctx.from.id, ctx.from.username || 'Unknown');
            
            // Import required modules
            const WalletManager = require('../wallet');
            const walletManager = new WalletManager();
            
            const wallet = await walletManager.generateWallet();
            
            await this.database.updateUserWallet(userId, wallet.address, wallet.encryptedPrivateKey, wallet.mnemonic);
            
            // Use wallet success interface with Start Trading button
            try {
                const { text, keyboard } = InterfaceUtils.generateWalletSuccessInterface(wallet.address, 'created');
                
                await ctx.editMessageText(text, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } catch (editError) {
                // If edit fails, send new message with wallet success interface
                const { text, keyboard } = InterfaceUtils.generateWalletSuccessInterface(wallet.address, 'created');
                
                await ctx.reply(text, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            }
            
        } catch (error) {
            this.monitoring.logError('Wallet generation failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error generating wallet. Please try again.');
        }
    }

    async handleImportWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Ensure user exists in database before setting state
            await this.database.createUser(ctx.from.id, ctx.from.username || 'Unknown');
            
            const importText = `🔑 *Import Existing Wallet*

Send your private key or mnemonic phrase to import your wallet.

⚠️ *Security Notice:*
• Your message will be automatically deleted
• We encrypt and store your key securely
• Never share this information with others

📝 Send your private key or mnemonic phrase now:`;

            await ctx.editMessageText(importText, {
                parse_mode: 'Markdown'
            });
            
            // Send force reply as separate message
            await ctx.reply('📝 Send your private key or mnemonic phrase:', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "0x123... or 12-word phrase"
                }
            });

            // Set user state for import and store message ID for later deletion
            await this.database.setUserState(ctx.from.id, 'importing_wallet', {
                importMessageId: ctx.callbackQuery.message.message_id
            });
            
        } catch (error) {
            this.monitoring.logError('Import wallet failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error starting wallet import.');
        }
    }

    async handleExportPrivateKey(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                return ctx.reply('❌ No wallet found.');
            }

            const WalletManager = require('../wallet');
            const walletManager = new WalletManager();
            const privateKey = walletManager.decrypt(user.encrypted_private_key);
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔓 Reveal Full Key', `reveal_key_${userId}`)],
                [Markup.button.callback('🔙 Back to Wallet', 'wallet')]
            ]);

            await ctx.editMessageText(`🔑 *Private Key Export*

*Masked Key:* \`${this.maskPrivateKey(privateKey)}\`

⚠️ *SECURITY WARNING*
• Never share your private key
• Anyone with this key can access your funds
• Store it securely offline

Click below to reveal the full key:`, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Export private key failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error exporting private key.');
        }
    }

    async handleRevealPrivateKey(ctx) {
        await ctx.answerCbQuery();
        const userId = ctx.match[1];
        
        try {
            // Security check
            if (parseInt(userId) !== ctx.from.id) {
                return ctx.reply('❌ Access denied.');
            }
            
            const user = await this.database.getUserByTelegramId(ctx.from.id);
            if (!user) {
                return ctx.reply('❌ No wallet found.');
            }

            const privateKey = this.walletManager.decrypt(user.encrypted_private_key);
            
            const message = await ctx.editMessageText(`🔑 *Private Key*

\`${privateKey}\`

⚠️ *KEEP THIS SECURE!*
_Never share your private key with anyone._

_This message will be deleted in 15 seconds._`, {
                parse_mode: 'Markdown'
            });

            // Auto-delete after 15 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage();
                } catch (error) {
                    // Silent error handling
                }
            }, 15000);
            
        } catch (error) {
            this.monitoring.logError('Reveal private key failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error revealing private key.');
        }
    }

    async handleDeleteWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            
            const warningText = `⚠️ *DELETE WALLET*

*This action is IRREVERSIBLE!*

• All funds will be lost if not backed up
• Your private key will be permanently deleted
• You cannot recover your wallet without backup

Are you absolutely sure?`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🗑️ Yes, Delete Forever', 'confirm_delete_wallet')],
                [Markup.button.callback('❌ Cancel', 'wallet')]
            ]);

            await ctx.editMessageText(warningText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
            
        } catch (error) {
            this.monitoring.logError('Delete wallet warning failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error loading delete confirmation.');
        }
    }

    async handleConfirmDeleteWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            const userId = ctx.from.id;
            
            // Delete user from database
            await this.database.deleteUser(userId);
            
            // Clear all Redis cache for this user
            if (this.cacheService) {
                await this.cacheService.clearUserCache(userId);
            }
            
            await ctx.editMessageText(`🗑️ *Wallet Deleted*

Your wallet has been permanently deleted.

Use /start to create a new wallet.`, {
                parse_mode: 'Markdown'
            });
            
            this.monitoring.logInfo('Wallet deleted', { userId });
            
        } catch (error) {
            this.monitoring.logError('Confirm delete wallet failed', error, { userId: ctx.from.id });
            await ctx.reply('❌ Error deleting wallet.');
        }
    }

    maskPrivateKey(privateKey) {
        if (!privateKey || privateKey.length < 10) return '***';
        return privateKey.substring(0, 6) + '...' + privateKey.substring(privateKey.length - 4);
    }
}

module.exports = WalletHandlers;
