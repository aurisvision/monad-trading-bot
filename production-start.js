#!/usr/bin/env node

// Production startup script for Area51 Bot
// Handles graceful startup, error handling, and process management

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ProductionStarter {
    constructor() {
        this.botProcess = null;
        this.isShuttingDown = false;
        this.restartCount = 0;
        this.maxRestarts = 5;
        this.restartDelay = 5000; // 5 seconds
        this.setupSignalHandlers();
    }

    async start() {
        console.log('🚀 Starting Area51 Bot in production mode...');
        
        // Validate environment
        if (!this.validateEnvironment()) {
            process.exit(1);
        }

        // Ensure logs directory exists
        this.ensureLogsDirectory();

        // Start the bot
        await this.startBot();
    }

    validateEnvironment() {
        const requiredEnvVars = [
            'TELEGRAM_BOT_TOKEN',
            'POSTGRES_HOST',
            'POSTGRES_DB_NAME',
            'POSTGRES_USER',
            'POSTGRES_PASSWORD'
        ];

        const missing = requiredEnvVars.filter(env => !process.env[env]);
        
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:', missing.join(', '));
            console.error('Please check your .env.production file');
            return false;
        }

        console.log('✅ Environment validation passed');
        return true;
    }

    ensureLogsDirectory() {
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            console.log('📁 Created logs directory');
        }
    }

    async startBot() {
        if (this.isShuttingDown) return;

        const botScript = path.join(__dirname, 'src', 'index-scalable.js');
        
        console.log(`🤖 Starting bot process (attempt ${this.restartCount + 1}/${this.maxRestarts + 1})`);
        
        this.botProcess = spawn('node', [botScript], {
            stdio: ['inherit', 'inherit', 'inherit'],
            env: { ...process.env, NODE_ENV: 'production' }
        });

        this.botProcess.on('exit', (code, signal) => {
            if (this.isShuttingDown) {
                console.log('🛑 Bot process stopped gracefully');
                return;
            }

            console.error(`❌ Bot process exited with code ${code}, signal ${signal}`);
            
            if (this.restartCount < this.maxRestarts) {
                this.restartCount++;
                console.log(`🔄 Restarting bot in ${this.restartDelay / 1000} seconds...`);
                
                setTimeout(() => {
                    this.startBot();
                }, this.restartDelay);
            } else {
                console.error('💀 Maximum restart attempts reached. Exiting...');
                process.exit(1);
            }
        });

        this.botProcess.on('error', (error) => {
            console.error('❌ Failed to start bot process:', error);
            process.exit(1);
        });

        // Reset restart count on successful start
        setTimeout(() => {
            if (this.botProcess && !this.botProcess.killed) {
                this.restartCount = 0;
                console.log('✅ Bot is running successfully');
            }
        }, 10000); // Reset after 10 seconds of successful operation
    }

    setupSignalHandlers() {
        const gracefulShutdown = (signal) => {
            console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
            this.isShuttingDown = true;

            if (this.botProcess) {
                console.log('📤 Sending shutdown signal to bot process...');
                this.botProcess.kill('SIGTERM');

                // Force kill after 30 seconds
                setTimeout(() => {
                    if (this.botProcess && !this.botProcess.killed) {
                        console.log('⚡ Force killing bot process...');
                        this.botProcess.kill('SIGKILL');
                    }
                }, 30000);

                this.botProcess.on('exit', () => {
                    console.log('✅ Graceful shutdown completed');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        };

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        
        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error);
            gracefulShutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            gracefulShutdown('UNHANDLED_REJECTION');
        });
    }
}

// Start the production server
if (require.main === module) {
    const starter = new ProductionStarter();
    starter.start().catch(error => {
        console.error('💥 Failed to start production server:', error);
        process.exit(1);
    });
}

module.exports = ProductionStarter;
