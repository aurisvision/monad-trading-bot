#!/usr/bin/env node

const { Telegraf } = require('telegraf');

async function stopAllBots() {
    console.log('🛑 Stopping all bot instances...');
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.error('❌ TELEGRAM_BOT_TOKEN not found');
        process.exit(1);
    }
    
    try {
        const bot = new Telegraf(botToken);
        
        // Delete webhook to stop any webhook-based instances
        await bot.telegram.deleteWebhook();
        console.log('✅ Webhook deleted');
        
        // Try to get updates with a very short timeout to clear any pending updates
        try {
            await bot.telegram.getUpdates({ timeout: 1, limit: 100 });
            console.log('✅ Cleared pending updates');
        } catch (error) {
            // This is expected if there are no updates
            console.log('ℹ️ No pending updates to clear');
        }
        
        console.log('🎉 All bot instances should now be stopped');
        console.log('🚀 You can now start the bot safely');
        
    } catch (error) {
        console.error('❌ Error stopping bots:', error.message);
        
        if (error.message.includes('409')) {
            console.log('ℹ️ Bot conflict detected - this is what we\'re trying to fix');
            console.log('⏳ Wait 30 seconds and try deploying again');
        }
    }
}

stopAllBots().catch(console.error);
