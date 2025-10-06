/**
 * Simple Access Handler
 * Handles access code entry and admin functions
 */

class SimpleAccessHandler {
    constructor(bot, database, accessSystem) {
        this.bot = bot;
        this.database = database;
        this.accessSystem = accessSystem;
        
        this.setupHandlers();
        console.log('[SimpleAccessHandler] Handlers setup complete');
    }

    /**
     * Escape text for Markdown (simple version)
     */
    escapeMarkdown(text) {
        if (!text) return '';
        
        let escaped = text.toString();
        
        // Escape only the most problematic characters for regular Markdown
        escaped = escaped.replace(/\*/g, '\\*');
        escaped = escaped.replace(/_/g, '\\_');
        escaped = escaped.replace(/`/g, '\\`');
        escaped = escaped.replace(/\[/g, '\\[');
        escaped = escaped.replace(/\]/g, '\\]');
        
        return escaped;
    }

    setupHandlers() {
        // Handle access code entry
        this.bot.action('enter_code', async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🎫 *Enter Access Code*\n\n` +
                `Please send your access code in the next message.`,
                { parse_mode: 'Markdown' }
            );
            
            // Set user state
            await this.database.setUserState(ctx.from.id, 'waiting_for_code');
        });

        // Handle delete commands
        this.bot.hears(/^\/delete(.+)$/, async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if admin
            if (userId !== this.accessSystem.adminId) {
                await ctx.reply('This command is for administrators only.');
                return;
            }
            
            let codeToDelete = ctx.match[1];
            
            // Remove escape characters from the code (convert A51\_TEST to A51_TEST)
            codeToDelete = codeToDelete.replace(/\\_/g, '_');
            
            console.log(`[SimpleAccessHandler] Admin ${userId} attempting to delete code: ${codeToDelete}`);
            console.log(`[SimpleAccessHandler] Full command: ${ctx.message.text}`);
            console.log(`[SimpleAccessHandler] Regex match: ${JSON.stringify(ctx.match)}`);
            
            const result = await this.accessSystem.deleteCode(codeToDelete);
            
            if (result.success) {
                await ctx.reply(
                    `✅ *Code Deleted Successfully*\n\n` +
                    `🗑️ Code \`${codeToDelete}\` has been permanently removed from the system.\n\n` +
                    `The code is no longer valid for access.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back to Admin Panel', callback_data: 'admin_menu' }
                            ]]
                        }
                    }
                );
            } else {
                await ctx.reply(
                    `❌ *Delete Failed*\n\n` +
                    `⚠️ ${result.message}\n\n` +
                    `Please check if the code exists and is unused.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Back to Admin Panel', callback_data: 'admin_menu' }
                            ]]
                        }
                    }
                );
            }
        });

        // Handle code input
        this.bot.on('text', async (ctx, next) => {
            const userId = ctx.from.id;
            const text = ctx.message.text;
            
            // Check if user is waiting for code
            const userState = await this.database.getUserState(userId);
            
            if (userState && userState.state === 'waiting_for_code') {
                console.log(`[SimpleAccessHandler] User ${userId} submitted code`);
                
                // Clear state
                await this.database.clearUserState(userId);
                
                // Verify code
                const result = await this.accessSystem.verifyCode(userId, text, {
                    username: ctx.from.username,
                    first_name: ctx.from.first_name,
                    last_name: ctx.from.last_name
                });
                
                if (result.success) {
                    // Send success message with start button
                    await ctx.reply(
                        result.message + '\n\nClick below to get started.',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: 'Get Started', callback_data: 'start' }
                                ]]
                            }
                        }
                    );
                } else {
                    // Send error with retry button
                    await ctx.reply(
                        result.message,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: 'Try Again', callback_data: 'enter_code' }
                                ]]
                            }
                        }
                    );
                }
                
                return; // Don't continue to next handler
            }
            
            return next();
        });

        // Admin command
        this.bot.command('admin', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if admin
            if (userId !== this.accessSystem.adminId) {
                await ctx.reply('This command is for administrators only.');
                return;
            }
            
            await this.showAdminMenu(ctx);
        });

        // Admin menu callbacks
        this.bot.action('admin_generate', async (ctx) => {
            if (ctx.from.id !== this.accessSystem.adminId) {
                await ctx.answerCbQuery('Admin only');
                return;
            }
            
            const result = await this.accessSystem.generateCode();
            
            if (result.success) {
                await ctx.editMessageText(
                    `*New Code Generated*\n\n` +
                    `Code: \`${result.code}\`\n` +
                    `Created: ${new Date(result.createdAt).toLocaleString('en-US')}\n\n` +
                    `Share this code with a user to grant them access.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Back to Admin', callback_data: 'admin_menu' }
                            ]]
                        }
                    }
                );
            } else {
                await ctx.editMessageText(
                    `*Error*\n\nFailed to generate code: ${result.error}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Back to Admin', callback_data: 'admin_menu' }
                            ]]
                        }
                    }
                );
            }
            
            await ctx.answerCbQuery();
        });

        this.bot.action('admin_users', async (ctx) => {
            if (ctx.from.id !== this.accessSystem.adminId) {
                await ctx.answerCbQuery('Admin only');
                return;
            }
            
            const users = await this.accessSystem.getRegisteredUsers();
            
            let message = `*Registered Users (${users.length})*\n\n`;
            
            if (users.length === 0) {
                message += 'No users registered yet.';
            } else {
                users.forEach((user, index) => {
                    const username = user.username ? `@${user.username}` : `User ${user.user_id}`;
                    const date = new Date(user.used_at).toLocaleString('en-US');
                    
                    // Simple escaping for regular Markdown
                    const escapedUsername = this.escapeMarkdown(username);
                    
                    message += `${index + 1}. ${escapedUsername}\n`;
                    message += `   Code: \`${user.code}\`\n`;
                    message += `   Date: ${date}\n\n`;
                });
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Back to Admin', callback_data: 'admin_menu' }
                    ]]
                }
            });
            
            await ctx.answerCbQuery();
        });

        this.bot.action('admin_codes', async (ctx) => {
            if (ctx.from.id !== this.accessSystem.adminId) {
                await ctx.answerCbQuery('Admin only');
                return;
            }
            
            const codes = await this.accessSystem.getUnusedCodes();
            
            let message = `*Unused Codes (${codes.length})*\n\n`;
            
            if (codes.length === 0) {
                message += 'No unused codes available.';
            } else {
                codes.forEach((code, index) => {
                    const date = new Date(code.created_at).toLocaleString('en-US');
                    
                    // Escape underscore in code for display
                    const escapedCode = this.escapeMarkdown(code.code);
                    const escapedCodeForLink = this.escapeMarkdown(code.code);
                    
                    message += `${index + 1}. \`${escapedCode}\`\n`;
                    message += `   Created: ${date}\n`;
                    message += `   🗑️ Delete: \`/delete${escapedCodeForLink}\`\n\n`;
                });
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Generate New Code', callback_data: 'admin_generate' },
                        { text: 'Back to Admin', callback_data: 'admin_menu' }
                    ]]
                }
            });
            
            await ctx.answerCbQuery();
        });

        this.bot.action('admin_menu', async (ctx) => {
            if (ctx.from.id !== this.accessSystem.adminId) {
                await ctx.answerCbQuery('Admin only');
                return;
            }
            
            await this.showAdminMenu(ctx, true);
            await ctx.answerCbQuery();
        });
    }

    async showAdminMenu(ctx, edit = false) {
        // Get statistics
        const stats = await this.accessSystem.getStats();
        
        const message = 
            `🛸 *Area51 Admin Panel*\n\n` +
            `📊 *System Statistics:*\n` +
            `┌─ Total Codes: \`${stats.total_codes}\`\n` +
            `├─ Used Codes: \`${stats.used_codes}\`\n` +
            `├─ Unused Codes: \`${stats.unused_codes}\`\n` +
            `└─ Active Users: \`${stats.total_users}\`\n\n` +
            `⚡ *Quick Actions:*`;
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '🎫 Generate New Code', callback_data: 'admin_generate' }],
                [{ text: `👥 View Users (${stats.total_users})`, callback_data: 'admin_users' }],
                [{ text: `🗂️ Manage Codes (${stats.unused_codes})`, callback_data: 'admin_codes' }]
            ]
        };
        
        if (edit) {
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    }

    /**
     * Show access code prompt
     */
    async showAccessPrompt(ctx) {
        const message = 
            `🛸 *Welcome to Area51 Bot*\n\n` +
            `🚀 *Experience Lightning-Fast Trading on Monad*\n\n` +
            `To access our advanced trading platform, you'll need an exclusive access code.\n\n` +
            `🎯 *Get Your Access Code:*\n` +
            `Follow our official X page for instant access to Area51 Bot:\n\n` +
            `👉 **https://x.com/0xArea**\n\n` +
            `📈 Join thousands of traders already experiencing Monad's revolutionary speed and efficiency.\n\n` +
            `Once you have your access code, click below to enter it and start trading.`;
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🐦 Follow @0xArea', url: 'https://x.com/0xArea' }],
                    [{ text: '🎫 Enter Access Code', callback_data: 'enter_code' }]
                ]
            }
        });
    }
}

module.exports = SimpleAccessHandler;
