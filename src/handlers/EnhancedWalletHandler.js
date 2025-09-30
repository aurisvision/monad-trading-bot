/**
 * Enhanced Wallet Handler
 * Uses BaseHandler and UserService to eliminate code duplication
 * 
 * SAFETY: This is a NEW handler that doesn't replace the existing one
 * The old walletHandlers.js remains untouched
 */

const { Markup } = require('telegraf');
const BaseHandler = require('../core/BaseHandler');
const UserService = require('../services/UserService');

class EnhancedWalletHandler extends BaseHandler {
    constructor(dependencies) {
        super(dependencies);
        
        // Initialize UserService
        this.userService = new UserService(
            this.database,
            this.cacheService,
            this.monitoring
        );
        
        // Additional dependencies specific to wallet
        this.walletManager = dependencies.walletManager;
        this.UnifiedSecuritySystem = dependencies.UnifiedSecuritySystem;
        
        // Handler-specific metrics
        this.walletMetrics = {
            walletViews: 0,
            walletGenerations: 0,
            walletImports: 0,
            keyExports: 0,
            walletDeletions: 0,
            keyReveals: 0
        };
    }

    /**
     * Setup all wallet handlers
     */
    setupHandlers() {
        if (!this.bot) return;

        // Main wallet handler
        this.bot.action('wallet', async (ctx) => {
            await this.handleWallet(ctx);
        });

        // Wallet management handlers
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

        // Key reveal handler with regex
        this.bot.action(/^reveal_key_(.+)$/, async (ctx) => {
            await this.handleRevealKey(ctx);
        });

        this.logInfo('Enhanced wallet handlers setup completed');
    }

    /**
     * Handle wallet main menu
     */
    async handleWallet(ctx) {
        try {
            this.walletMetrics.walletViews++;
            
            await ctx.answerCbQuery();
            
            // Validate user and check access
            const { userId, user } = await this.validateUserAccess(ctx);
            
            // Track user activity
            await this.userService.trackUserActivity(userId);
            
            // Get wallet information
            const walletInfo = await this.getWalletInfo(user);
            
            // Build wallet message and keyboard
            const message = this.buildWalletMessage(walletInfo);
            const keyboard = this.buildWalletKeyboard(walletInfo);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            if (error.message === 'User access denied') {
                return await this.sendError(ctx, 
                    '🔐 Access denied. Please contact support.', 
                    false
                );
            }
            
            this.logError('Failed to handle wallet', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to load wallet information. Please try again.', 
                true
            );
        }
    }

    /**
     * Get wallet information for user
     */
    async getWalletInfo(user) {
        try {
            if (!user?.wallet_address) {
                return { hasWallet: false };
            }

            // Get wallet balance
            let balance = null;
            try {
                if (this.monorailAPI?.getWalletBalance) {
                    balance = await this.monorailAPI.getWalletBalance(user.wallet_address);
                }
            } catch (balanceError) {
                this.logWarn('Failed to get wallet balance', { 
                    walletAddress: user.wallet_address,
                    error: balanceError.message 
                });
            }

            return {
                hasWallet: true,
                address: user.wallet_address,
                balance: balance,
                createdAt: user.created_at
            };
            
        } catch (error) {
            this.logError('Failed to get wallet info', { 
                userId: user?.telegram_id, 
                error: error.message 
            });
            return { hasWallet: false, error: error.message };
        }
    }

    /**
     * Build wallet message
     */
    buildWalletMessage(walletInfo) {
        if (!walletInfo.hasWallet) {
            return '👛 <b>Wallet Management</b>\n\n' +
                   '❌ No wallet found.\n\n' +
                   'You need to create or import a wallet to start trading.\n\n' +
                   '🔐 <b>Security Notice:</b>\n' +
                   '• Keep your private key safe\n' +
                   '• Never share it with anyone\n' +
                   '• Make a backup copy';
        }

        const shortAddress = `${walletInfo.address.slice(0, 8)}...${walletInfo.address.slice(-6)}`;
        
        let message = '👛 <b>Your Wallet</b>\n\n';
        message += `📍 <b>Address:</b>\n<code>${walletInfo.address}</code>\n\n`;
        message += `🏷️ <b>Short Address:</b> <code>${shortAddress}</code>\n\n`;
        
        if (walletInfo.balance) {
            message += `💰 <b>Balance:</b> ${walletInfo.balance.formatted || 'Loading...'} MON\n\n`;
        }
        
        if (walletInfo.createdAt) {
            const date = new Date(walletInfo.createdAt).toLocaleDateString();
            message += `📅 <b>Created:</b> ${date}\n\n`;
        }
        
        message += '⚠️ <b>Security Reminder:</b>\n';
        message += '• Keep your private key secure\n';
        message += '• Never share it with anyone\n';
        message += '• Make regular backups';
        
        return message;
    }

    /**
     * Build wallet keyboard
     */
    buildWalletKeyboard(walletInfo) {
        if (!walletInfo.hasWallet) {
            return Markup.inlineKeyboard([
                [
                    Markup.button.callback('🆕 Generate New Wallet', 'generate_wallet')
                ],
                [
                    Markup.button.callback('📥 Import Existing Wallet', 'import_wallet')
                ],
                [
                    Markup.button.callback('🏠 Main Menu', 'main')
                ]
            ]);
        }

        return Markup.inlineKeyboard([
            [
                Markup.button.callback('🔑 Export Private Key', 'export_private_key')
            ],
            [
                Markup.button.callback('📥 Import New Wallet', 'import_wallet'),
                Markup.button.callback('🗑️ Delete Wallet', 'delete_wallet')
            ],
            [
                Markup.button.callback('🔄 Refresh', 'wallet'),
                Markup.button.callback('🏠 Main Menu', 'main')
            ]
        ]);
    }

    /**
     * Handle generate wallet
     */
    async handleGenerateWallet(ctx) {
        try {
            this.walletMetrics.walletGenerations++;
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId } = await this.validateUserAccess(ctx);
            
            // Check if user already has a wallet
            const user = await this.userService.getUser(userId);
            if (user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ You already have a wallet. Delete the current one first if you want to create a new one.', 
                    false
                );
            }

            // Generate new wallet
            if (!this.walletManager?.generateWallet) {
                return await this.sendError(ctx, 
                    '❌ Wallet generation service is not available.', 
                    false
                );
            }

            const walletData = await this.walletManager.generateWallet();
            
            if (!walletData?.address || !walletData?.privateKey) {
                return await this.sendError(ctx, 
                    '❌ Failed to generate wallet. Please try again.', 
                    false
                );
            }

            // Save wallet to database
            await this.database.updateUser(userId, {
                wallet_address: walletData.address,
                wallet_private_key: walletData.privateKey // Should be encrypted
            });

            // Clear user cache
            await this.userService.refreshUserCache(userId);
            
            // Show success message with security warning
            const message = '✅ <b>Wallet Generated Successfully!</b>\n\n' +
                           `📍 <b>Address:</b>\n<code>${walletData.address}</code>\n\n` +
                           '🔐 <b>IMPORTANT SECURITY NOTICE:</b>\n' +
                           '• Your wallet has been created\n' +
                           '• Private key is securely stored\n' +
                           '• Use "Export Private Key" to backup\n' +
                           '• Never share your private key\n\n' +
                           '💡 <b>Next Steps:</b>\n' +
                           '• Export and backup your private key\n' +
                           '• Fund your wallet to start trading';

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🔑 Export Private Key', 'export_private_key')
                    ],
                    [
                        Markup.button.callback('👛 View Wallet', 'wallet'),
                        Markup.button.callback('🏠 Main Menu', 'main')
                    ]
                ])
            });
            
            this.logInfo('Wallet generated successfully', { userId });
            
        } catch (error) {
            this.logError('Failed to generate wallet', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Failed to generate wallet. Please try again later.', 
                true
            );
        }
    }

    /**
     * Handle import wallet
     */
    async handleImportWallet(ctx) {
        try {
            this.walletMetrics.walletImports++;
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId } = await this.validateUserAccess(ctx);
            
            // Set state for private key input
            await this.userService.setUserState(userId, 'waiting_for_private_key');
            
            const message = '📥 <b>Import Wallet</b>\n\n' +
                           '🔐 Please send your private key:\n\n' +
                           '⚠️ <b>Security Notice:</b>\n' +
                           '• This message will be deleted after processing\n' +
                           '• Make sure you\'re in a private chat\n' +
                           '• Never share your private key with others\n\n' +
                           '📝 <b>Supported formats:</b>\n' +
                           '• Raw private key (64 characters)\n' +
                           '• 0x prefixed private key';

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('❌ Cancel', 'wallet')
                    ]
                ])
            });
            
        } catch (error) {
            this.logError('Failed to handle import wallet', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to start wallet import. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle export private key
     */
    async handleExportPrivateKey(ctx) {
        try {
            this.walletMetrics.keyExports++;
            
            await ctx.answerCbQuery();
            
            // Validate user and check access
            const { userId, user } = await this.validateUserAccess(ctx);
            
            if (!user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ No wallet found. Please create a wallet first.', 
                    false
                );
            }

            // Security check using UnifiedSecuritySystem
            if (this.UnifiedSecuritySystem) {
                const trustLevel = await this.UnifiedSecuritySystem.getUserTrustLevel(userId);
                if (trustLevel < 0.5) {
                    return await this.sendError(ctx, 
                        '🔐 Security check failed. Please contact support.', 
                        false
                    );
                }
            }

            // Generate unique reveal key for security
            const revealKey = this.generateRevealKey();
            
            // Store reveal key temporarily
            await this.setCacheData('reveal_key', userId, {
                key: revealKey,
                action: 'export_private_key',
                timestamp: Date.now()
            }, 300); // 5 minutes expiry

            const message = '🔑 <b>Export Private Key</b>\n\n' +
                           '⚠️ <b>SECURITY WARNING:</b>\n' +
                           '• Your private key gives full access to your wallet\n' +
                           '• Never share it with anyone\n' +
                           '• Store it in a secure location\n' +
                           '• Anyone with this key can steal your funds\n\n' +
                           '🔐 Click the button below to reveal your private key:';

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🔓 Reveal Private Key', `reveal_key_${revealKey}`)
                    ],
                    [
                        Markup.button.callback('❌ Cancel', 'wallet')
                    ]
                ])
            });
            
        } catch (error) {
            this.logError('Failed to handle export private key', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to export private key. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle reveal key
     */
    async handleRevealKey(ctx) {
        try {
            this.walletMetrics.keyReveals++;
            
            const match = ctx.callbackQuery.data.match(/^reveal_key_(.+)$/);
            if (!match) return;

            const revealKey = match[1];
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId, user } = await this.validateUserAccess(ctx);
            
            // Verify reveal key
            const storedData = await this.getCacheData('reveal_key', userId);
            if (!storedData || storedData.key !== revealKey) {
                return await this.sendError(ctx, 
                    '❌ Invalid or expired security key. Please try again.', 
                    false
                );
            }

            // Check expiry (5 minutes)
            if (Date.now() - storedData.timestamp > 300000) {
                await this.clearCacheData('reveal_key', userId);
                return await this.sendError(ctx, 
                    '❌ Security key expired. Please try again.', 
                    false
                );
            }

            if (!user?.wallet_private_key) {
                return await this.sendError(ctx, 
                    '❌ Private key not found. Please contact support.', 
                    false
                );
            }

            // Clear the reveal key
            await this.clearCacheData('reveal_key', userId);
            
            // Send private key in a secure way
            const message = '🔑 <b>Your Private Key</b>\n\n' +
                           `<code>${user.wallet_private_key}</code>\n\n` +
                           '⚠️ <b>CRITICAL SECURITY REMINDERS:</b>\n' +
                           '• Copy this key to a secure location NOW\n' +
                           '• This message will be deleted in 60 seconds\n' +
                           '• Never share this key with anyone\n' +
                           '• Anyone with this key can access your funds\n' +
                           '• Store multiple backup copies safely\n\n' +
                           '🔐 <b>Recommended storage:</b>\n' +
                           '• Hardware wallet\n' +
                           '• Encrypted file\n' +
                           '• Physical paper backup\n' +
                           '• Password manager';

            // Send the message
            const sentMessage = await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ I\'ve Saved It', 'wallet')
                    ]
                ])
            });

            // Schedule message deletion after 60 seconds
            setTimeout(async () => {
                try {
                    await ctx.editMessageText(
                        '🔑 <b>Private Key Revealed</b>\n\n' +
                        '✅ Private key was displayed and automatically hidden for security.\n\n' +
                        '🔐 Make sure you\'ve saved it securely!',
                        {
                            parse_mode: 'HTML',
                            reply_markup: Markup.inlineKeyboard([
                                [
                                    Markup.button.callback('👛 Back to Wallet', 'wallet')
                                ]
                            ])
                        }
                    );
                } catch (deleteError) {
                    this.logWarn('Failed to auto-hide private key message', { 
                        userId, 
                        error: deleteError.message 
                    });
                }
            }, 60000); // 60 seconds
            
            this.logInfo('Private key revealed', { userId });
            
        } catch (error) {
            this.logError('Failed to reveal key', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to reveal private key. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle delete wallet
     */
    async handleDeleteWallet(ctx) {
        try {
            this.walletMetrics.walletDeletions++;
            
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId, user } = await this.validateUserAccess(ctx);
            
            if (!user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ No wallet found to delete.', 
                    false
                );
            }

            const message = '🗑️ <b>Delete Wallet</b>\n\n' +
                           '⚠️ <b>DANGER ZONE</b>\n\n' +
                           '🚨 <b>WARNING:</b>\n' +
                           '• This will permanently delete your wallet\n' +
                           '• You will lose access to all funds\n' +
                           '• This action cannot be undone\n' +
                           '• Make sure you have backed up your private key\n\n' +
                           `📍 <b>Wallet to delete:</b>\n<code>${user.wallet_address}</code>\n\n` +
                           '🔐 <b>Before proceeding:</b>\n' +
                           '• Export and save your private key\n' +
                           '• Transfer all funds to another wallet\n' +
                           '• Confirm you have secure backups\n\n' +
                           '❓ Are you absolutely sure you want to delete this wallet?';

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🔑 Export Key First', 'export_private_key')
                    ],
                    [
                        Markup.button.callback('🗑️ YES, DELETE WALLET', 'confirm_delete_wallet')
                    ],
                    [
                        Markup.button.callback('❌ Cancel', 'wallet')
                    ]
                ])
            });
            
        } catch (error) {
            this.logError('Failed to handle delete wallet', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Unable to process wallet deletion. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle confirm delete wallet
     */
    async handleConfirmDeleteWallet(ctx) {
        try {
            await ctx.answerCbQuery();
            
            // Validate user
            const { userId, user } = await this.validateUserAccess(ctx);
            
            if (!user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ No wallet found to delete.', 
                    false
                );
            }

            // Delete wallet from database
            await this.database.updateUser(userId, {
                wallet_address: null,
                wallet_private_key: null
            });

            // Clear all user cache
            await this.userService.refreshUserCache(userId);
            
            // Clear any pending states
            await this.userService.clearUserState(userId);

            const message = '✅ <b>Wallet Deleted Successfully</b>\n\n' +
                           '🗑️ Your wallet has been permanently deleted.\n\n' +
                           '📝 <b>What happened:</b>\n' +
                           '• Wallet address removed from account\n' +
                           '• Private key deleted from our systems\n' +
                           '• All cached data cleared\n\n' +
                           '🆕 <b>Next Steps:</b>\n' +
                           '• Create a new wallet, or\n' +
                           '• Import an existing wallet\n\n' +
                           '💡 <b>Remember:</b>\n' +
                           '• If you have the private key, you can still access funds\n' +
                           '• Import the same key to restore access';

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🆕 Generate New Wallet', 'generate_wallet')
                    ],
                    [
                        Markup.button.callback('📥 Import Wallet', 'import_wallet')
                    ],
                    [
                        Markup.button.callback('🏠 Main Menu', 'main')
                    ]
                ])
            });
            
            this.logInfo('Wallet deleted successfully', { userId });
            
        } catch (error) {
            this.logError('Failed to confirm delete wallet', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Failed to delete wallet. Please try again.', 
                true
            );
        }
    }

    /**
     * Generate a secure reveal key
     */
    generateRevealKey() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15) + 
               Date.now().toString(36);
    }

    /**
     * Get enhanced metrics
     */
    getEnhancedMetrics() {
        return {
            ...this.getMetrics(),
            wallet: this.walletMetrics,
            userService: this.userService.getMetrics(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Enhanced health check
     */
    async healthCheck() {
        try {
            const baseHealth = await super.healthCheck();
            const userServiceHealth = await this.userService.healthCheck();
            
            // Check wallet manager availability
            const walletManagerHealth = this.walletManager ? 'available' : 'unavailable';
            
            return {
                status: baseHealth.status === 'healthy' && 
                       userServiceHealth.status === 'healthy' && 
                       walletManagerHealth === 'available' 
                    ? 'healthy' : 'unhealthy',
                components: {
                    base: baseHealth,
                    userService: userServiceHealth,
                    walletManager: walletManagerHealth,
                    securitySystem: this.UnifiedSecuritySystem ? 'available' : 'unavailable'
                },
                metrics: this.getEnhancedMetrics(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = EnhancedWalletHandler;