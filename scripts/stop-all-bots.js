#!/usr/bin/env node
// 🛑 Stop All Bot Instances Script
// Prevents Telegram API conflicts by stopping all running bot processes

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class BotStopper {
    constructor() {
        this.processNames = [
            'node src/index-modular-simple.js',
            'node index-modular-simple.js',
            'area51-telegram-bot',
            'telegraf'
        ];
    }

    async findBotProcesses() {
        try {
            console.log('🔍 Searching for running bot processes...');
            
            // Windows command to find Node.js processes
            const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
            const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
            
            const processes = [];
            for (const line of lines) {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const pid = parts[1].replace(/"/g, '');
                    if (pid && !isNaN(pid)) {
                        processes.push({
                            pid: parseInt(pid),
                            name: 'node.exe'
                        });
                    }
                }
            }
            
            console.log(`📊 Found ${processes.length} Node.js processes`);
            return processes;
            
        } catch (error) {
            console.error('❌ Error finding processes:', error.message);
            return [];
        }
    }

    async stopProcess(pid) {
        try {
            await execAsync(`taskkill /F /PID ${pid}`);
            console.log(`✅ Stopped process PID: ${pid}`);
            return true;
        } catch (error) {
            console.log(`⚠️ Could not stop PID ${pid}: ${error.message}`);
            return false;
        }
    }

    async stopAllBots() {
        console.log('🛑 Starting bot cleanup process...\n');
        
        const processes = await this.findBotProcesses();
        
        if (processes.length === 0) {
            console.log('✅ No bot processes found running');
            return;
        }

        let stoppedCount = 0;
        for (const process of processes) {
            const success = await this.stopProcess(process.pid);
            if (success) stoppedCount++;
        }

        console.log(`\n📊 Summary: Stopped ${stoppedCount}/${processes.length} processes`);
        
        // Wait a moment for cleanup
        console.log('⏳ Waiting for cleanup...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('✅ Bot cleanup completed!');
        console.log('🚀 You can now start the bot safely with: npm start');
    }

    async checkTelegramAPI() {
        console.log('\n🔍 Checking Telegram API status...');
        
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            if (!token) {
                console.log('⚠️ TELEGRAM_BOT_TOKEN not found in environment');
                return;
            }

            // Simple API check (without starting polling)
            const https = require('https');
            const url = `https://api.telegram.org/bot${token}/getMe`;
            
            const response = await new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(JSON.parse(data)));
                }).on('error', reject);
            });

            if (response.ok) {
                console.log(`✅ Telegram API accessible - Bot: @${response.result.username}`);
            } else {
                console.log('❌ Telegram API error:', response.description);
            }
            
        } catch (error) {
            console.log('⚠️ Could not check Telegram API:', error.message);
        }
    }
}

// Main execution
async function main() {
    console.log('🤖 Area51 Bot Process Manager\n');
    
    const stopper = new BotStopper();
    
    try {
        await stopper.stopAllBots();
        await stopper.checkTelegramAPI();
        
        console.log('\n🎯 Next steps:');
        console.log('1. Run: npm start');
        console.log('2. Check for conflicts if you see 409 errors');
        console.log('3. Use this script again if needed');
        
    } catch (error) {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = BotStopper;
