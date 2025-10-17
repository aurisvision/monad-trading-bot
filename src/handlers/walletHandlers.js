// Wallet Management Handlers
const { Markup } = require('telegraf');
const WalletManager = require('../wallet');
const UnifiedSecuritySystem = require('../security/UnifiedSecuritySystem');
const AdminRateLimitManager = require('../utils/AdminRateLimitManager');
const { validateInput } = require('../utils/index');
const { formatBalance } = require('../utils/interfaceUtils');
const InterfaceUtils = require('../utils/interfaceUtils');
const { secureLogger } = require('../utils/secureLogger');
class WalletHandlers {
    constructor(bot, database, walletManager, monitoring, redis = null, cacheService = null) {
        this.bot = bot;
        this.database = database;
        this.walletManager = walletManager;
        this.monitoring = monitoring;
        this.redis = redis;
        this.cacheService = cacheService;
        // Initialize unified security system
        this.security = new UnifiedSecuritySystem(redis, database);
        
        // Initialize admin rate limit manager
        this.adminRateLimitManager = new AdminRateLimitManager(
            redis, 
            this.security.rateLimiter, 
            monitoring
        );
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
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
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
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            const userId = ctx.from.id;
            // Clear any existing cache for this user first
            if (this.cacheService) {
                try {
                    if (typeof this.cacheService.clearUserCache === 'function') {
                        await this.cacheService.clearUserCache(userId);
                    } else {
                        // Fallback to individual delete operations
                        await this.cacheService.delete('user', userId);
                        await this.cacheService.delete('user_settings', userId);
                        await this.cacheService.delete('user_state', userId);
                        await this.cacheService.delete('main_menu', userId);
                        await this.cacheService.delete('portfolio', userId);
                    }
                } catch (cacheError) {
                    console.log('⚠️ Cache cleanup error:', cacheError.message);
                }
            }
            // Ensure user exists in database before wallet generation
            await this.database.createUser(ctx.from.id, ctx.from.username || 'Unknown');
            // Use existing wallet manager with unified security
            const walletManager = this.walletManager;
            const wallet = await walletManager.generateWallet();
            const updatedUser = await this.database.updateUserWallet(userId, wallet.address, wallet.encryptedPrivateKey, wallet.encryptedMnemonic);
            
            // CRITICAL: Update cache with new user data immediately after wallet creation
            if (this.cacheService && updatedUser) {
                try {
                    await this.cacheService.set('user', userId, updatedUser);
                    // Clear main_menu cache to force refresh with new wallet data
                    await this.cacheService.delete('main_menu', userId);
                    console.log('✅ User cache updated with new wallet data:', userId);
                } catch (cacheError) {
                    console.log('⚠️ Post-wallet cache update error:', cacheError.message);
                }
            }
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
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            const userId = ctx.from.id;
            // Clear any existing cache for this user first
            if (this.cacheService) {
                try {
                    if (typeof this.cacheService.clearUserCache === 'function') {
                        await this.cacheService.clearUserCache(userId);
                    } else {
                        // Fallback to individual delete operations
                        await this.cacheService.delete('user', userId);
                        await this.cacheService.delete('user_settings', userId);
                        await this.cacheService.delete('user_state', userId);
                        await this.cacheService.delete('main_menu', userId);
                        await this.cacheService.delete('portfolio', userId);
                    }
                } catch (cacheError) {
                    console.log('⚠️ Import wallet cache cleanup error:', cacheError.message);
                }
            }
            // Ensure user exists in database before setting state
            await this.database.createUser(ctx.from.id, ctx.from.username || 'Unknown');
            const importText = `🔑 **Import Existing Wallet**

📤 **How to Import:**
Send your private key or mnemonic phrase to import your existing wallet.

🔒 **Security Guarantee:**
• Your message will be automatically deleted after processing
• We encrypt and store your key using military-grade security
• Your private information never leaves our secure system
• Never share this information with anyone else

📝 **Ready to Import?**
Send your private key (0x123...) or mnemonic phrase (12-24 words) now:`;
            
            await ctx.editMessageText(importText, {
                parse_mode: 'Markdown'
            });
            
            // Send force reply as separate message with better placeholder
            await ctx.reply('🔐 Paste your private key or mnemonic phrase here:', {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "0x1234abcd... or word1 word2 word3..."
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
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
            const userId = ctx.from.id;
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) {
                return ctx.reply('❌ No wallet found.');
            }

            // Simple security: Just decrypt and show the private key
            const decryptedPrivateKey = this.security.decrypt(user.encrypted_private_key, userId);
            if (decryptedPrivateKey === 'DECRYPTION_FAILED_PLEASE_REGENERATE_WALLET') {
                return ctx.reply('❌ Unable to decrypt private key. Please regenerate your wallet.');
            }

            // Log the access for basic security tracking
            secureLogger.info('Private key accessed', { userId });

            // Show private key directly with basic security warning
            const message = await ctx.editMessageText(`🔑 **Your Private Key**

\`${decryptedPrivateKey}\`

**⚠️ Security Warning:**
• Never share this key with anyone
• This key provides full wallet access
• Store securely offline

_This message will be deleted in 30 seconds for security._`, {
                parse_mode: 'Markdown'
            });

            // Securely wipe the private key from memory
            this.security.secureWipeMemory(decryptedPrivateKey);

            // Auto-delete after 30 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage();
                    // Send confirmation that message was deleted
                    const confirmMsg = await ctx.reply('🛡️ Private key message deleted for security.');
                    // Delete confirmation after 3 seconds
                    setTimeout(async () => {
                        try {
                            await ctx.telegram.deleteMessage(ctx.chat.id, confirmMsg.message_id);
                        } catch (deleteError) {
                            // Ignore deletion errors
                        }
                    }, 3000);
                } catch (deleteError) {
                    // Ignore deletion errors
                }
            }, 30000);

        } catch (error) {
            this.monitoring.logError('Export private key failed', { 
                message: error.message,
                userId: ctx.from.id 
            });
            await ctx.reply('❌ Error exporting private key.');
        }
    }

    async handleDeleteWallet(ctx) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
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
            // Answer callback query first
            try {
                if (ctx.callbackQuery) {
                    await ctx.answerCbQuery('Processing wallet deletion...');
                }
            } catch (cbError) {
                console.warn('Failed to answer callback query (non-critical)', { error: cbError.message });
            }
            const userId = ctx.from.id;
            // Check if user still exists (prevent double deletion)
            const existingUser = await this.database.getUserByTelegramId(userId);
            if (!existingUser) {
                await ctx.editMessageText(`🗑️ *Wallet Already Deleted*
Your wallet has already been deleted.
Use /start to create a new wallet.`, {
                    parse_mode: 'Markdown'
                });
                return;
            }
            // Delete user from database
            secureLogger.info('Starting wallet deletion process', { userId });
            await this.database.deleteUser(userId);
            secureLogger.info('Database deletion completed', { userId });
            // Clear all Redis cache for this user
            if (this.cacheService) {
                try {
                    // Try the clearUserCache method first (if available)
                    if (typeof this.cacheService.clearUserCache === 'function') {
                        await this.cacheService.clearUserCache(userId);
                        secureLogger.info('User cache cleared using clearUserCache method', { userId });
                    } else {
                        // Fallback to individual delete operations
                        await this.cacheService.delete('user', userId);
                        await this.cacheService.delete('user_settings', userId);
                        await this.cacheService.delete('user_state', userId);
                        await this.cacheService.delete('session', userId);
                        await this.cacheService.delete('main_menu', userId);
                        // Clear wallet-related cache if we have user data
                        if (ctx.user?.wallet_address) {
                            const walletAddress = ctx.user.wallet_address;
                            await this.cacheService.delete('wallet_balance', walletAddress);
                            await this.cacheService.delete('portfolio', walletAddress);
                            await this.cacheService.delete('mon_balance', walletAddress);
                        }
                        secureLogger.info('User cache cleared using individual delete operations', { userId });
                    }
                } catch (cacheError) {
                    secureLogger.warn('Cache clearing failed in wallet handler (non-critical)', { 
                        error: cacheError.message, 
                        userId 
                    });
                }
            }
            try {
                await ctx.editMessageText(`🗑️ *Wallet Deleted*
Your wallet has been permanently deleted.
Use /start to create a new wallet.`, {
                    parse_mode: 'Markdown'
                });
            } catch (editError) {
                // If edit fails, send new message
                await ctx.reply(`🗑️ *Wallet Deleted*
Your wallet has been permanently deleted.
Use /start to create a new wallet.`, {
                    parse_mode: 'Markdown'
                });
            }
            this.monitoring.logInfo('Wallet deleted', { userId });
            secureLogger.info('Wallet deletion process completed successfully', { userId });
            // Ensure no further processing happens
            return;
        } catch (error) {
            secureLogger.error('Confirm delete wallet failed', error, { 
                userId: ctx.from.id,
                errorMessage: error.message,
                errorStack: error.stack
            });
            this.monitoring.logError('Confirm delete wallet failed', error, { userId: ctx.from.id });
            
            // More specific error handling
            let errorMessage = '❌ Error deleting wallet. Please try again.';
            if (error.message && error.message.includes('database')) {
                errorMessage = '❌ Database error while deleting wallet. Please try again.';
            } else if (error.message && error.message.includes('Redis')) {
                errorMessage = '❌ Cache error while deleting wallet. Please try again.';
            }
            
            try {
                await ctx.editMessageText(errorMessage, {
                    parse_mode: 'Markdown'
                });
            } catch (editError) {
                await ctx.reply(errorMessage);
            }
        }
    }
    getTrustLevelEmoji(trustLevel) {
        const emojis = {
            'new': '🆕',
            'regular': '👤', 
            'trusted': '⭐',
            'vip': '💎'
        };
        return emojis[trustLevel] || '👤';
    }
    maskPrivateKey(privateKey) {
        if (!privateKey || privateKey.length < 10) return '***';
        return privateKey.substring(0, 6) + '...' + privateKey.substring(privateKey.length - 4);
    }
}
module.exports = WalletHandlers;
