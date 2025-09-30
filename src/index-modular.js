#!/usr/bin/env node

/**
 * Area51 Telegram Trading Bot - Modular Entry Point
 * 
 * This is the new modular entry point that replaces the monolithic structure
 * with organized, maintainable modules for better scalability and maintenance.
 * 
 * Features:
 * - Modular architecture with clear separation of concerns
 * - Migration system for gradual handler rollout
 * - Comprehensive error handling and monitoring
 * - Graceful shutdown and cleanup
 * - Health monitoring and status reporting
 */

require('dotenv').config();

const ModularBot = require('./core/ModularBot');

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

/**
 * Main function to start the bot
 */
async function main() {
    try {
        console.log('🚀 Starting Area51 Telegram Trading Bot (Modular)...');
        console.log('📅 Started at:', new Date().toISOString());
        
        // Environment validation
        validateEnvironment();
        
        // Create and start bot
        const bot = new ModularBot();
        await bot.start();
        
        // Log startup success
        const status = bot.getStatus();
        console.log('📊 Bot Status:', JSON.stringify(status, null, 2));
        
        // Log migration status if enabled
        if (status.migration.enabled) {
            const migrationStatus = bot.getMigrationStatus();
            console.log('🔄 Migration Status:', JSON.stringify(migrationStatus, null, 2));
        }
        
        console.log('🎉 Area51 Bot is ready for trading!');
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

/**
 * Validate required environment variables
 */
function validateEnvironment() {
    const required = [
        'BOT_TOKEN',
        'DATABASE_URL',
        'REDIS_URL'
    ];
    
    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing.join(', '));
        console.error('Please check your .env file and ensure all required variables are set.');
        process.exit(1);
    }
    
    console.log('✅ Environment validation passed');
}

/**
 * Display startup banner
 */
function displayBanner() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Area51 Trading Bot                       ║
║                     Modular Edition                         ║
║                                                              ║
║  🚀 Advanced Telegram Trading Bot for Monad Blockchain      ║
║  📦 Modular Architecture with Migration Support             ║
║  🔒 Secure, Fast, and Reliable Trading Experience           ║
╚══════════════════════════════════════════════════════════════╝
    `);
}

// Display banner and start
displayBanner();
main().catch(error => {
    console.error('❌ Fatal error in main:', error);
    process.exit(1);
});