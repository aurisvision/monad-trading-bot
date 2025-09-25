/**
 * Admin Handler for Access Code Management
 * Provides admin interface for generating and managing access codes
 */

class AdminHandler {
    constructor(bot, accessCodeSystem, database, monitoring) {
        this.bot = bot;
        this.accessCodeSystem = accessCodeSystem;
        this.database = database;
        this.monitoring = monitoring;
        
        this.setupAdminHandlers();
    }

    setupAdminHandlers() {
        // Admin main menu
        this.bot.command('admin', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.reply('❌ Access denied. Admin only.');
                return;
            }
            await this.showAdminMenu(ctx);
        });

        // Admin menu buttons
        this.bot.action('admin_generate_code', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.showGenerateCodeMenu(ctx);
        });

        this.bot.action('admin_view_codes', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.showCodesList(ctx);
        });

        this.bot.action('admin_stats', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.showStats(ctx);
        });

        this.bot.action('admin_users', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.showUsersList(ctx);
        });

        // Code generation types
        this.bot.action('generate_general_code', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'general');
        });

        this.bot.action('generate_vip_code', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'vip', 1); // VIP is single-use
        });

        this.bot.action('generate_limited_code', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateLimitedCode(ctx);
        });

        this.bot.action('generate_timed_code', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.showTimedCodeOptions(ctx);
        });

        // Back to admin menu
        this.bot.action('back_to_admin', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.showAdminMenu(ctx);
        });

        // Timed code duration options
        this.bot.action('timed_1h', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'timed', 1, 1);
        });

        this.bot.action('timed_6h', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'timed', 1, 6);
        });

        this.bot.action('timed_12h', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'timed', 1, 12);
        });

        this.bot.action('timed_24h', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'timed', 1, 24);
        });

        this.bot.action('timed_48h', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'timed', 1, 48);
        });

        this.bot.action('timed_72h', async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            await this.generateCode(ctx, 'timed', 1, 72);
        });

        // Code management actions
        this.bot.action(/^disable_code_(.+)$/, async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            const code = ctx.match[1];
            await this.disableCode(ctx, code);
        });

        this.bot.action(/^revoke_user_(.+)$/, async (ctx) => {
            if (!this.accessCodeSystem.isAdmin(ctx.from.id)) {
                await ctx.answerCbQuery('❌ Access denied');
                return;
            }
            const userId = ctx.match[1];
            await this.revokeUserAccess(ctx, userId);
        });
    }

    async showAdminMenu(ctx) {
        try {
            const stats = await this.accessCodeSystem.getCodeStats();
            
            const message = `🔧 **Admin Control Panel**

📊 **Quick Stats:**
• Active Codes: ${stats.codes.active}
• Total Uses: ${stats.codes.total_uses}
• Users with Access: ${stats.users.total_with_access}
• New Users Today: ${stats.users.new_today}

Choose an action:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🎫 Generate Code', callback_data: 'admin_generate_code' },
                        { text: '📋 View Codes', callback_data: 'admin_view_codes' }
                    ],
                    [
                        { text: '📊 Statistics', callback_data: 'admin_stats' },
                        { text: '👥 Users', callback_data: 'admin_users' }
                    ]
                ]
            };

            if (ctx.callbackQuery) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

        } catch (error) {
            this.monitoring?.logError('Show admin menu failed', error);
            await ctx.reply('❌ Error loading admin menu');
        }
    }

    async showGenerateCodeMenu(ctx) {
        try {
            const message = `🎫 **Generate Access Code**

Choose the type of code to generate:

• **General**: Standard access code (unlimited uses)
• **VIP**: Premium access code (single-use, exclusive)
• **Limited**: Single-use code (1 use only)
• **Timed**: Single-use code with custom expiration`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🎫 General Code', callback_data: 'generate_general_code' },
                        { text: '⭐ VIP Code', callback_data: 'generate_vip_code' }
                    ],
                    [
                        { text: '🔢 Single Use', callback_data: 'generate_limited_code' },
                        { text: '⏰ Single Use + Timer', callback_data: 'generate_timed_code' }
                    ],
                    [
                        { text: '← Back to Admin', callback_data: 'back_to_admin' }
                    ]
                ]
            };

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            await ctx.answerCbQuery();

        } catch (error) {
            this.monitoring?.logError('Show generate code menu failed', error);
            await ctx.reply('❌ Error loading generate code menu');
        }
    }

    async generateCode(ctx, codeType, maxUses = null, expiresInHours = null) {
        try {
            await ctx.answerCbQuery('🔄 Generating code...');

            const result = await this.accessCodeSystem.generateCode(
                codeType, 
                maxUses, 
                expiresInHours, 
                `Generated by admin at ${new Date().toISOString()}`
            );

            if (result.success) {
                const expiryText = expiresInHours ? 
                    `\n⏰ **Expires:** ${expiresInHours} hours` : 
                    '\n⏰ **Expires:** Never';
                
                const usageText = maxUses ? 
                    `\n🔢 **Max Uses:** ${maxUses}` : 
                    '\n🔢 **Max Uses:** Unlimited';

                const message = `✅ **Code Generated Successfully!**

🎫 **Code:** \`${result.code}\`
🏷️ **Type:** ${codeType.toUpperCase()}${expiryText}${usageText}

📋 **Share this code with users to grant them access to the bot.**

⚠️ **Security Note:** Keep codes secure and only share with intended users.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🎫 Generate Another', callback_data: 'admin_generate_code' },
                            { text: '📋 View All Codes', callback_data: 'admin_view_codes' }
                        ],
                        [
                            { text: '← Back to Admin', callback_data: 'back_to_admin' }
                        ]
                    ]
                };

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

                // Log the generation
                this.monitoring?.logInfo('Admin generated access code', {
                    adminId: ctx.from.id,
                    code: result.code,
                    codeType,
                    maxUses,
                    expiresInHours
                });

            } else {
                await ctx.editMessageText(`❌ **Code Generation Failed**\n\nError: ${result.error}`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '← Back to Admin', callback_data: 'back_to_admin' }
                        ]]
                    }
                });
            }

        } catch (error) {
            this.monitoring?.logError('Generate code failed', error);
            await ctx.editMessageText('❌ Error generating code', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '← Back to Admin', callback_data: 'back_to_admin' }
                    ]]
                }
            });
        }
    }

    async generateLimitedCode(ctx) {
        // Generate code with 1 use limit (single use)
        await this.generateCode(ctx, 'limited', 1);
    }

    async showTimedCodeOptions(ctx) {
        try {
            const message = `⏰ **Generate Timed Code**

Choose the expiration time for your single-use code:

**Quick Access:**
• 1 Hour - Perfect for flash events
• 6 Hours - Short-term access
• 12 Hours - Half-day access

**Extended Access:**
• 24 Hours - Full day access
• 48 Hours - Weekend events
• 72 Hours - Extended campaigns

*All timed codes are single-use only*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚡ 1 Hour', callback_data: 'timed_1h' },
                        { text: '🕕 6 Hours', callback_data: 'timed_6h' }
                    ],
                    [
                        { text: '🕐 12 Hours', callback_data: 'timed_12h' },
                        { text: '📅 24 Hours', callback_data: 'timed_24h' }
                    ],
                    [
                        { text: '🗓️ 48 Hours', callback_data: 'timed_48h' },
                        { text: '📆 72 Hours', callback_data: 'timed_72h' }
                    ],
                    [
                        { text: '← Back to Generate', callback_data: 'admin_generate_code' }
                    ]
                ]
            };

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            await ctx.answerCbQuery();

        } catch (error) {
            this.monitoring?.logError('Show timed code options failed', error);
            await ctx.reply('❌ Error loading timed code options');
        }
    }

    async generateTimedCode(ctx) {
        // This method is now replaced by showTimedCodeOptions
        await this.showTimedCodeOptions(ctx);
    }

    async showCodesList(ctx) {
        try {
            const codes = await this.accessCodeSystem.getCodes(10, 0, true);
            
            if (codes.length === 0) {
                const message = `📋 **Access Codes**

No active codes found.

Generate your first code to get started!`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🎫 Generate Code', callback_data: 'admin_generate_code' }
                        ],
                        [
                            { text: '← Back to Admin', callback_data: 'back_to_admin' }
                        ]
                    ]
                };

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                await ctx.answerCbQuery();
                return;
            }

            let message = `📋 **Access Codes** (Showing latest 10)\n\n`;

            codes.forEach((code, index) => {
                const usageText = code.max_uses ? 
                    `${code.used_count}/${code.max_uses}` : 
                    `${code.used_count}/∞`;
                
                const expiryText = code.expires_at ? 
                    new Date(code.expires_at).toLocaleDateString('en-US') : 
                    'Never';

                const statusIcon = code.is_active ? '✅' : '❌';

                message += `**${index + 1}.** \`${code.code}\` ${statusIcon}\n`;
                message += `   📊 Uses: ${usageText} | ⏰ Expires: ${expiryText}\n`;
                message += `   🏷️ Type: ${code.code_type.toUpperCase()}\n`;
                if (code.is_active) {
                    message += `   🔧 [Disable Code](callback://disable_code_${code.code})\n`;
                }
                message += `\n`;
            });

            // Create inline keyboard with disable buttons for active codes
            const keyboard = {
                inline_keyboard: [
                    // Add disable buttons for first 3 active codes
                    ...codes.slice(0, 3).filter(code => code.is_active).map(code => [
                        { text: `❌ Disable ${code.code}`, callback_data: `disable_code_${code.code}` }
                    ]),
                    [
                        { text: '🎫 Generate New', callback_data: 'admin_generate_code' },
                        { text: '📊 Statistics', callback_data: 'admin_stats' }
                    ],
                    [
                        { text: '← Back to Admin', callback_data: 'back_to_admin' }
                    ]
                ]
            };

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            await ctx.answerCbQuery();

        } catch (error) {
            this.monitoring?.logError('Show codes list failed', error);
            await ctx.reply('❌ Error loading codes list');
        }
    }

    async showStats(ctx) {
        try {
            const stats = await this.accessCodeSystem.getCodeStats();
            
            const message = `📊 **Detailed Statistics**

**📋 Codes:**
• Total Created: ${stats.codes.total}
• Currently Active: ${stats.codes.active}
• Valid (Not Expired): ${stats.codes.valid}
• Total Uses: ${stats.codes.total_uses}
• Created Today: ${stats.codes.created_today}
• Created This Week: ${stats.codes.created_this_week}

**👥 Users:**
• Total with Access: ${stats.users.total_with_access}
• New Today: ${stats.users.new_today}
• New This Week: ${stats.users.new_this_week}

**📈 Performance:**
• Average Uses per Code: ${stats.codes.total > 0 ? (stats.codes.total_uses / stats.codes.total).toFixed(1) : '0'}
• Active Code Ratio: ${stats.codes.total > 0 ? ((stats.codes.active / stats.codes.total) * 100).toFixed(1) : '0'}%`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 View Codes', callback_data: 'admin_view_codes' },
                        { text: '👥 View Users', callback_data: 'admin_users' }
                    ],
                    [
                        { text: '← Back to Admin', callback_data: 'back_to_admin' }
                    ]
                ]
            };

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            await ctx.answerCbQuery();

        } catch (error) {
            this.monitoring?.logError('Show stats failed', error);
            await ctx.reply('❌ Error loading statistics');
        }
    }

    async showUsersList(ctx) {
        try {
            // Fixed query - only use user_access table
            const query = `
                SELECT telegram_id, used_code, access_granted_at, user_info
                FROM user_access
                WHERE is_active = true
                ORDER BY access_granted_at DESC
                LIMIT 10
            `;

            const users = await this.database.getMany(query);
            
            if (users.length === 0) {
                const message = `👥 **Users with Access**

No users with access found.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🎫 Generate Code', callback_data: 'admin_generate_code' }
                        ],
                        [
                            { text: '← Back to Admin', callback_data: 'back_to_admin' }
                        ]
                    ]
                };

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                await ctx.answerCbQuery();
                return;
            }

            let message = `👥 **Users with Access** (Latest 10)\n\n`;

            users.forEach((user, index) => {
                // Parse user_info JSON if available
                let userInfo = {};
                try {
                    if (user.user_info) {
                        userInfo = typeof user.user_info === 'string' ? 
                            JSON.parse(user.user_info) : user.user_info;
                    }
                } catch (e) {
                    userInfo = {};
                }

                // Create display name with fallback
                const displayName = userInfo.first_name ? 
                    `${userInfo.first_name} ${userInfo.last_name || ''}`.trim() : 
                    'Unknown User';
                
                const username = userInfo.username ? `@${userInfo.username}` : 'No username';
                const accessDate = new Date(user.access_granted_at).toLocaleDateString('en-US');

                message += `**${index + 1}.** ${displayName}\n`;
                message += `   👤 Username: ${username}\n`;
                message += `   🆔 ID: \`${user.telegram_id}\`\n`;
                message += `   🎫 Code: \`${user.used_code}\`\n`;
                message += `   📅 Access: ${accessDate}\n\n`;
            });

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 Statistics', callback_data: 'admin_stats' },
                        { text: '📋 View Codes', callback_data: 'admin_view_codes' }
                    ],
                    [
                        { text: '← Back to Admin', callback_data: 'back_to_admin' }
                    ]
                ]
            };

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            await ctx.answerCbQuery();

        } catch (error) {
            this.monitoring?.logError('Show users list failed', error);
            await ctx.reply('❌ Error loading users list');
        }
    }

    async disableCode(ctx, code) {
        try {
            const success = await this.accessCodeSystem.disableCode(code);
            
            if (success) {
                await ctx.answerCbQuery(`✅ Code ${code} disabled`);
                await this.showCodesList(ctx);
            } else {
                await ctx.answerCbQuery('❌ Failed to disable code');
            }

        } catch (error) {
            this.monitoring?.logError('Disable code failed', error);
            await ctx.answerCbQuery('❌ Error disabling code');
        }
    }

    async revokeUserAccess(ctx, userId) {
        try {
            const success = await this.accessCodeSystem.revokeUserAccess(parseInt(userId));
            
            if (success) {
                await ctx.answerCbQuery(`✅ Access revoked for user ${userId}`);
                await this.showUsersList(ctx);
            } else {
                await ctx.answerCbQuery('❌ Failed to revoke access');
            }

        } catch (error) {
            this.monitoring?.logError('Revoke user access failed', error);
            await ctx.answerCbQuery('❌ Error revoking access');
        }
    }
}

module.exports = AdminHandler;
