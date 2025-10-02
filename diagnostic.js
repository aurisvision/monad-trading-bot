// Diagnostic script to check bot functionality
require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Test basic bot functionality
bot.on('text', async (ctx) => {
    try {
        console.log('📨 Received message:', {
            chatType: ctx.chat.type,
            chatId: ctx.chat.id,
            userId: ctx.from.id,
            username: ctx.from.username,
            message: ctx.message.text,
            botInfo: ctx.botInfo
        });

        // Try to send a simple response
        if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
            console.log('🔍 Group message detected, attempting to respond...');
            
            // Test if bot can send messages
            await ctx.reply('✅ Bot is working! I can see and respond to messages.');
            console.log('✅ Response sent successfully');
        }
    } catch (error) {
        console.error('❌ Error processing message:', error);
    }
});

bot.on('inline_query', async (ctx) => {
    try {
        console.log('🔍 Inline query received:', ctx.inlineQuery.query);
        await ctx.answerInlineQuery([{
            type: 'article',
            id: 'test',
            title: 'Bot is working',
            description: 'Inline queries are working',
            input_message_content: {
                message_text: '✅ Inline functionality is working!'
            }
        }]);
        console.log('✅ Inline query answered');
    } catch (error) {
        console.error('❌ Inline query error:', error);
    }
});

console.log('🚀 Starting diagnostic bot...');
bot.launch().then(() => {
    console.log('✅ Diagnostic bot started successfully');
    console.log('📝 Send any message to the bot in the group to test');
}).catch(error => {
    console.error('❌ Failed to start bot:', error);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));