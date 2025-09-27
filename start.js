#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

async function runDatabaseFix() {
    console.log('🔧 Running database schema fix...');
    
    return new Promise((resolve, reject) => {
        const fixScript = spawn('node', [path.join(__dirname, 'database', 'run_fix.js')], {
            stdio: 'inherit',
            env: process.env
        });
        
        fixScript.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Database fix completed');
                resolve();
            } else {
                console.error('❌ Database fix failed');
                reject(new Error(`Database fix failed with code ${code}`));
            }
        });
        
        fixScript.on('error', (error) => {
            console.error('❌ Database fix error:', error);
            reject(error);
        });
    });
}

async function stopExistingBots() {
    console.log('🛑 Stopping existing bot instances...');
    
    return new Promise((resolve) => {
        const stopScript = spawn('node', [path.join(__dirname, 'scripts', 'stop_all_bots.js')], {
            stdio: 'inherit',
            env: process.env
        });
        
        stopScript.on('close', () => {
            console.log('✅ Bot cleanup completed');
            resolve();
        });
        
        stopScript.on('error', (error) => {
            console.warn('⚠️ Bot cleanup warning:', error.message);
            resolve(); // Continue anyway
        });
    });
}

async function startBot() {
    console.log('🚀 Starting Area51 Bot...');
    
    const botProcess = spawn('node', [path.join(__dirname, 'src', 'index-modular-simple.js')], {
        stdio: 'inherit',
        env: process.env
    });
    
    botProcess.on('close', (code) => {
        console.log(`Bot process exited with code ${code}`);
        process.exit(code);
    });
    
    botProcess.on('error', (error) => {
        console.error('❌ Bot startup error:', error);
        process.exit(1);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
        console.log('📤 Received SIGTERM, shutting down gracefully...');
        botProcess.kill('SIGTERM');
    });
    
    process.on('SIGINT', () => {
        console.log('📤 Received SIGINT, shutting down gracefully...');
        botProcess.kill('SIGINT');
    });
}

async function main() {
    try {
        console.log('🎯 Area51 Bot Production Startup');
        console.log('================================');
        
        // Step 1: Fix database schema
        await runDatabaseFix();
        
        // Step 2: Stop any existing bot instances
        await stopExistingBots();
        
        // Step 3: Wait a moment for cleanup
        console.log('⏳ Waiting 5 seconds for cleanup...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 4: Start the bot
        await startBot();
        
    } catch (error) {
        console.error('❌ Startup failed:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);
