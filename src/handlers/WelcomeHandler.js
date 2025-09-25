/**
 * Welcome Handler for Access Code Entry
 * Handles the initial welcome screen and code verification process
 */

class WelcomeHandler {
    constructor(bot, accessCodeSystem, database, monitoring) {
        this.bot = bot;
        this.accessCodeSystem = accessCodeSystem;
        this.database = database;
        this.monitoring = monitoring;
        
        this.setupWelcomeHandlers();
    }

    setupWelcomeHandlers() {
        // Handle the "Enter Code" button
        this.bot.action('enter_access_code', async (ctx) => {
            await this.promptForCode(ctx);
        });

        // Handle code input
        this.bot.on('text', async (ctx, next) => {
            const userId = ctx.from.id;
            
            // Skip state check for admin
            if (this.accessCodeSystem.isAdmin(userId)) {
                return next();
            }
            
            // Check if user is waiting for code input
            try {
                const userState = await this.database.getUserState(userId);
                if (userState && userState.state === 'waiting_for_access_code') {
                    await this.handleCodeInput(ctx);
                    return;
                }
            } catch (error) {
                // If getUserState fails, continue to next handler
                this.monitoring?.logError('getUserState failed in WelcomeHandler', error, { userId });
            }
            
            // Continue to next handler if not waiting for code
            return next();
        });

        // Retry code entry
        this.bot.action('retry_code_entry', async (ctx) => {
            await this.promptForCode(ctx);
        });

        // Follow developer button
        this.bot.action('follow_developer', async (ctx) => {
            await ctx.answerCbQuery('Opening Twitter...');
            
            const message = `🐦 **Follow the Developer**

Follow [@yahia_crypto](https://twitter.com/yahia_crypto) on Twitter for:

• 🎫 **Access codes** for exclusive events
• 📢 **Updates** and announcements  
• 🎉 **Contests** and giveaways
• 💡 **Trading tips** and insights

Stay connected for the latest Area51 Bot news!`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { 
                            text: '🐦 Follow @yahia_crypto', 
                            url: 'https://twitter.com/yahia_crypto' 
                        }
                    ],
                    [
                        { text: '🔙 Back', callback_data: 'enter_access_code' }
                    ]
                ]
            };

            try {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    disable_web_page_preview: true
                });
            } catch (error) {
                // Fallback if edit fails
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    disable_web_page_preview: true
                });
            }
        });
    }

    /**
     * عرض شاشة الترحيب الأولى للمستخدمين الجدد
     */
    async showWelcomeScreen(ctx) {
        try {
            const message = `🚀 **Welcome to Area51 Bot!**

*The ultimate trading companion for the Monad ecosystem*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 **Exclusive Access Required**

This bot is currently in **exclusive access mode**. You need a valid access code to use the bot.

**Don't have a code?** 
Follow our developer for access codes, contests, and updates!

🐦 **[@yahia_crypto](https://twitter.com/yahia_crypto)**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Ready to get started?**`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { 
                            text: '🎫 Enter Access Code', 
                            callback_data: 'enter_access_code' 
                        }
                    ],
                    [
                        { 
                            text: '🐦 Follow Developer', 
                            callback_data: 'follow_developer' 
                        }
                    ]
                ]
            };

            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });

            // Log the welcome screen view
            this.monitoring?.logInfo('Welcome screen shown', {
                userId: ctx.from.id,
                username: ctx.from.username,
                firstName: ctx.from.first_name
            });

        } catch (error) {
            this.monitoring?.logError('Show welcome screen failed', error);
            await ctx.reply('❌ Error loading welcome screen. Please try again with /start');
        }
    }

    /**
     * طلب إدخال الكود من المستخدم
     */
    async promptForCode(ctx) {
        try {
            const userId = ctx.from.id;

            // Set user state to waiting for code
            await this.database.setUserState(userId, 'waiting_for_access_code', {
                timestamp: new Date().toISOString()
            });

            const message = `🎫 **Enter Your Access Code**

Please send your access code in the chat.

**Code Format:** \`AREA51-XXXXXXXX\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Need a code?**
• Follow [@yahia_crypto](https://twitter.com/yahia_crypto) for codes
• Participate in contests and giveaways
• Join community events

**Security Note:** 
*Each code can only be used once. Keep your code secure.*`;

            // No keyboard - user should just type the code

            if (ctx.callbackQuery) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }

        } catch (error) {
            this.monitoring?.logError('Prompt for code failed', error);
            await ctx.reply('❌ Error. Please try again.');
        }
    }

    /**
     * معالجة إدخال الكود من المستخدم
     */
    async handleCodeInput(ctx) {
        try {
            const userId = ctx.from.id;
            const inputCode = ctx.message.text.trim();

            // Clear the user state first
            await this.database.clearUserState(userId);

            // Show processing message
            const processingMsg = await ctx.reply('🔄 *Verifying your access code...*', {
                parse_mode: 'Markdown'
            });

            // Verify the code
            const result = await this.accessCodeSystem.verifyAndGrantAccess(
                userId, 
                inputCode, 
                {
                    username: ctx.from.username,
                    first_name: ctx.from.first_name,
                    last_name: ctx.from.last_name,
                    language_code: ctx.from.language_code
                }
            );

            // Delete the processing message
            try {
                await ctx.telegram.deleteMessage(processingMsg.chat.id, processingMsg.message_id);
            } catch (deleteError) {
                // Ignore delete errors
            }

            if (result.success) {
                // Success! Show welcome message and proceed to main bot
                const successMessage = `${result.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**You're all set!**

**What you can do now:**
• Trade MON tokens instantly
• Track your portfolio  
• Auto-buy with custom settings
• Full control over fees and slippage

**Getting Started:**
Type /start to access the main menu and explore all features!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

                await ctx.reply(successMessage, {
                    parse_mode: 'Markdown'
                });

                // Log successful access
                this.monitoring?.logInfo('User gained access successfully', {
                    userId,
                    code: result.code,
                    codeType: result.codeType,
                    username: ctx.from.username
                });

                // Trigger the main bot flow
                return true;

            } else {
                // Failed verification
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🔄 Try Again', callback_data: 'retry_code_entry' },
                            { text: '🐦 Get Code', callback_data: 'follow_developer' }
                        ]
                    ]
                };

                await ctx.reply(result.message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

                // Log failed attempt
                this.monitoring?.logInfo('Access code verification failed', {
                    userId,
                    reason: result.reason,
                    username: ctx.from.username
                });

                return false;
            }

        } catch (error) {
            this.monitoring?.logError('Handle code input failed', error);
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Try Again', callback_data: 'retry_code_entry' }
                    ]
                ]
            };

            await ctx.reply('❌ *System Error*\n\nAn error occurred while verifying your code. Please try again.', {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            return false;
        }
    }

    /**
     * تحقق من وجود وصول للمستخدم
     */
    async checkUserAccess(userId) {
        try {
            const accessResult = await this.accessCodeSystem.checkUserAccess(userId);
            return accessResult.hasAccess;
        } catch (error) {
            this.monitoring?.logError('Check user access failed', error);
            return false;
        }
    }

    /**
     * عرض رسالة عدم وجود وصول
     */
    async showNoAccessMessage(ctx) {
        const message = `🔐 **Access Required**

You need a valid access code to use this bot.

**Get your access code:**
• Follow [@yahia_crypto](https://twitter.com/yahia_crypto)
• Participate in contests
• Join community events

**Already have a code?**`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎫 Enter Code', callback_data: 'enter_access_code' }
                ],
                [
                    { text: '🐦 Follow Developer', callback_data: 'follow_developer' }
                ]
            ]
        };

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
            disable_web_page_preview: true
        });
    }
}

module.exports = WelcomeHandler;
