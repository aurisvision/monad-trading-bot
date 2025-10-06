const { Markup } = require('telegraf');

class FeedbackHandlers {
    constructor(bot, database, monitoring, cacheService) {
        this.bot = bot;
        this.database = database;
        this.monitoring = monitoring;
        this.cacheService = cacheService;
        this.setupHandlers();
    }

    setupHandlers() {
        // Main feedback handler
        this.bot.action('feedback', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showFeedbackMenu(ctx);
        });

        // Feedback type handlers
        this.bot.action('feedback_bug', async (ctx) => {
            await ctx.answerCbQuery();
            await this.startFeedbackCollection(ctx, 'bug');
        });

        this.bot.action('feedback_suggestion', async (ctx) => {
            await ctx.answerCbQuery();
            await this.startFeedbackCollection(ctx, 'suggestion');
        });

        this.bot.action('feedback_general', async (ctx) => {
            await ctx.answerCbQuery();
            await this.startFeedbackCollection(ctx, 'general');
        });

        // Back to feedback menu
        this.bot.action('back_to_feedback', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showFeedbackMenu(ctx);
        });
    }

    /**
     * Show feedback menu with different feedback types
     */
    async showFeedbackMenu(ctx) {
        const userId = ctx.from.id;
        
        try {
            const feedbackText = `💬 *Feedback Center*

We value your feedback to improve Area51 Bot!

Please select the type of feedback you'd like to provide:

🐛 *Bug Report* - Report issues or problems
💡 *Suggestion* - Share ideas for improvements  
💭 *General Feedback* - Share your overall experience

Your feedback helps us make the bot better for everyone!`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🐛 Bug Report', 'feedback_bug')],
                [Markup.button.callback('💡 Suggestion', 'feedback_suggestion')],
                [Markup.button.callback('💭 General Feedback', 'feedback_general')],
                [Markup.button.callback('🏠 Back to Main', 'back_to_main')]
            ]);

            if (ctx.callbackQuery) {
                await ctx.editMessageText(feedbackText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                });
            } else {
                await ctx.replyWithMarkdown(feedbackText, keyboard);
            }

            this.monitoring?.logInfo('Feedback menu shown', { userId });

        } catch (error) {
            this.monitoring?.logError('Show feedback menu failed', error, { userId });
            await ctx.reply('❌ Error loading feedback menu. Please try again.');
        }
    }

    /**
     * Start feedback collection process
     */
    async startFeedbackCollection(ctx, feedbackType) {
        const userId = ctx.from.id;
        
        try {
            // Set user state for feedback collection
            await this.database.setUserState(userId, 'collecting_feedback', {
                type: feedbackType,
                timestamp: Date.now()
            });

            const typeEmojis = {
                'bug': '🐛',
                'suggestion': '💡',
                'general': '💭'
            };

            const typeNames = {
                'bug': 'Bug Report',
                'suggestion': 'Suggestion',
                'general': 'General Feedback'
            };

            const instructions = {
                'bug': 'Please describe the bug you encountered:\n• What were you trying to do?\n• What happened instead?\n• Any error messages?',
                'suggestion': 'Please share your suggestion:\n• What feature would you like to see?\n• How would it improve your experience?\n• Any specific details?',
                'general': 'Please share your feedback:\n• What do you like about the bot?\n• What could be improved?\n• Any other thoughts?'
            };

            const feedbackText = `${typeEmojis[feedbackType]} *${typeNames[feedbackType]}*

${instructions[feedbackType]}

*Please type your feedback message below:*

_Note: Your feedback will be reviewed by our team to improve the bot._`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Feedback', 'back_to_feedback')],
                [Markup.button.callback('🏠 Main Menu', 'back_to_main')]
            ]);

            await ctx.editMessageText(feedbackText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });

            this.monitoring?.logInfo('Feedback collection started', { userId, feedbackType });

        } catch (error) {
            this.monitoring?.logError('Start feedback collection failed', error, { userId, feedbackType });
            await ctx.reply('❌ Error starting feedback collection. Please try again.');
        }
    }

    /**
     * Process feedback message (called from text handler)
     */
    async processFeedbackMessage(ctx, userState) {
        const userId = ctx.from.id;
        const feedbackText = ctx.message.text;
        
        try {
            // Validate feedback length
            if (feedbackText.length < 10) {
                await ctx.reply('❌ Please provide more detailed feedback (at least 10 characters).');
                return false;
            }

            if (feedbackText.length > 2000) {
                await ctx.reply('❌ Feedback is too long. Please keep it under 2000 characters.');
                return false;
            }

            const feedbackData = {
                user_id: userId,
                username: ctx.from.username || 'N/A',
                first_name: ctx.from.first_name || 'N/A',
                feedback_type: userState.data.type,
                feedback_text: feedbackText,
                timestamp: new Date(),
                status: 'new'
            };

            // Store feedback efficiently
            await this.storeFeedback(feedbackData);

            // Clear user state
            await this.database.clearUserState(userId);

            // Send confirmation
            const typeEmojis = {
                'bug': '🐛',
                'suggestion': '💡',
                'general': '💭'
            };

            const confirmationText = `✅ *Feedback Submitted Successfully!*

${typeEmojis[userState.data.type]} Your feedback has been received and will be reviewed by our team.

Thank you for helping us improve Area51 Bot!`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💬 Submit More Feedback', 'feedback')],
                [Markup.button.callback('🏠 Back to Main', 'back_to_main')]
            ]);

            await ctx.replyWithMarkdown(confirmationText, keyboard);

            this.monitoring?.logInfo('Feedback submitted successfully', { 
                userId, 
                feedbackType: userState.data.type,
                feedbackLength: feedbackText.length 
            });

            return true;

        } catch (error) {
            this.monitoring?.logError('Process feedback message failed', error, { userId });
            await ctx.reply('❌ Error submitting feedback. Please try again.');
            return false;
        }
    }

    /**
     * Store feedback in memory temporarily until database is available
     */
    async storeFeedback(feedbackData) {
        try {
            // Temporary storage in memory until database is available
            const feedbackEntry = {
                id: Date.now(),
                user_id: feedbackData.user_id,
                username: feedbackData.username,
                first_name: feedbackData.first_name,
                feedback_type: feedbackData.feedback_type,
                feedback_text: feedbackData.feedback_text,
                status: 'new',
                created_at: new Date().toISOString()
            };
            
            // Store in memory (temporary solution)
            if (!this.tempFeedbackStorage) {
                this.tempFeedbackStorage = [];
            }
            this.tempFeedbackStorage.push(feedbackEntry);
            
            // Log feedback for admin review
            this.monitoring?.logInfo('📝 NEW FEEDBACK RECEIVED', {
                feedbackId: feedbackEntry.id,
                userId: feedbackData.user_id,
                username: feedbackData.username,
                firstName: feedbackData.first_name,
                feedbackType: feedbackData.feedback_type,
                feedbackText: feedbackData.feedback_text,
                timestamp: feedbackEntry.created_at
            });
            
            // Also log to console for immediate visibility
            console.log(`\n🔔 NEW FEEDBACK ALERT:`);
            console.log(`📋 Type: ${feedbackData.feedback_type.toUpperCase()}`);
            console.log(`👤 User: ${feedbackData.first_name} (@${feedbackData.username}) [ID: ${feedbackData.user_id}]`);
            console.log(`💬 Message: ${feedbackData.feedback_text}`);
            console.log(`⏰ Time: ${feedbackEntry.created_at}`);
            console.log(`🆔 Feedback ID: ${feedbackEntry.id}\n`);
            
            return feedbackEntry.id;

        } catch (error) {
            this.monitoring?.logError('Store feedback failed', error, feedbackData);
            throw error;
        }
    }

    /**
     * Get feedback statistics (for admin use)
     * Currently works with temporary memory storage
     */
    async getFeedbackStats() {
        try {
            if (!this.tempFeedbackStorage || this.tempFeedbackStorage.length === 0) {
                return {
                    total: 0,
                    byType: {},
                    byStatus: {},
                    recent: []
                };
            }
            
            const stats = {
                total: this.tempFeedbackStorage.length,
                byType: {},
                byStatus: {},
                recent: this.tempFeedbackStorage.slice(-5) // Last 5 feedback entries
            };
            
            // Count by type and status
            this.tempFeedbackStorage.forEach(feedback => {
                // Count by type
                if (!stats.byType[feedback.feedback_type]) {
                    stats.byType[feedback.feedback_type] = 0;
                }
                stats.byType[feedback.feedback_type]++;
                
                // Count by status
                if (!stats.byStatus[feedback.status]) {
                    stats.byStatus[feedback.status] = 0;
                }
                stats.byStatus[feedback.status]++;
            });
            
            return stats;
        } catch (error) {
            this.monitoring?.logError('Failed to get feedback stats', error);
            return {
                total: 0,
                byType: {},
                byStatus: {},
                recent: []
            };
        }
    }
}

module.exports = FeedbackHandlers;