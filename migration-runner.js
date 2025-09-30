#!/usr/bin/env node

/**
 * Safe Migration Runner
 * Gradually integrates new handlers with monitoring and rollback capabilities
 * 
 * Usage:
 *   node migration-runner.js --phase=phase1
 *   node migration-runner.js --handler=navigation --enable
 *   node migration-runner.js --status
 *   node migration-runner.js --rollback
 */

const path = require('path');
const fs = require('fs');

// Import our migration components
const MigrationConfig = require('./src/config/MigrationConfig');
const HandlerManager = require('./src/core/HandlerManager');
const HandlerPerformanceMonitor = require('./src/monitoring/HandlerPerformanceMonitor');

class MigrationRunner {
    constructor() {
        this.config = new MigrationConfig();
        this.monitor = null; // Will be initialized later
        this.handlerManager = null;
        this.isRunning = false;
        this.stats = {
            startTime: null,
            totalRequests: 0,
            successfulMigrations: 0,
            failedMigrations: 0,
            rollbacks: 0
        };
    }

    /**
     * Initialize migration runner
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Migration Runner...');
            
            // Create mock dependencies
            const mockDependencies = {
                userService: this.createMockUserService(),
                cacheService: this.createMockCacheService(),
                walletService: this.createMockWalletService(),
                apiService: this.createMockApiService(),
                monitoring: this.createMockMonitoring(),
                redis: this.createMockRedis()
            };
            
            // Initialize performance monitor
            this.monitor = new HandlerPerformanceMonitor(mockDependencies);
            
            // Initialize handler manager with mock dependencies for testing
            this.handlerManager = new HandlerManager(mockDependencies);

            await this.handlerManager.initializeHandlers();
            
            console.log('✅ Migration Runner initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Migration Runner:', error);
            return false;
        }
    }

    /**
     * Start migration for specific phase
     */
    async startPhase(phaseName) {
        try {
            console.log(`🔄 Starting migration phase: ${phaseName}`);
            
            // Enable the phase
            const success = this.config.enablePhase(phaseName);
            if (!success) {
                throw new Error(`Invalid phase: ${phaseName}`);
            }

            // Update handler manager configuration
            await this.handlerManager.updateMigrationConfig(this.config.getConfig());
            
            // Start monitoring
            this.monitor.startMonitoring();
            this.isRunning = true;
            this.stats.startTime = new Date();
            
            console.log(`✅ Phase ${phaseName} started successfully`);
            this.printStatus();
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to start phase ${phaseName}:`, error);
            return false;
        }
    }

    /**
     * Enable specific handler
     */
    async enableHandler(handlerName) {
        try {
            console.log(`🔄 Enabling handler: ${handlerName}`);
            
            const success = this.config.enableHandler(handlerName);
            if (!success) {
                throw new Error(`Invalid handler: ${handlerName}`);
            }

            await this.handlerManager.updateMigrationConfig(this.config.getConfig());
            
            console.log(`✅ Handler ${handlerName} enabled successfully`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to enable handler ${handlerName}:`, error);
            return false;
        }
    }

    /**
     * Disable specific handler
     */
    async disableHandler(handlerName) {
        try {
            console.log(`🔄 Disabling handler: ${handlerName}`);
            
            const success = this.config.disableHandler(handlerName);
            if (!success) {
                throw new Error(`Invalid handler: ${handlerName}`);
            }

            await this.handlerManager.updateMigrationConfig(this.config.getConfig());
            
            console.log(`✅ Handler ${handlerName} disabled successfully`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to disable handler ${handlerName}:`, error);
            return false;
        }
    }

    /**
     * Perform emergency rollback
     */
    async performRollback() {
        try {
            console.log('🚨 Performing emergency rollback...');
            
            // Reset configuration to safe defaults
            this.config.resetToDefaults();
            
            // Update handler manager
            await this.handlerManager.updateMigrationConfig(this.config.getConfig());
            
            // Stop monitoring
            this.monitor.stopMonitoring();
            this.isRunning = false;
            this.stats.rollbacks++;
            
            console.log('✅ Emergency rollback completed successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to perform rollback:', error);
            return false;
        }
    }

    /**
     * Print current migration status
     */
    printStatus() {
        const stats = this.config.getStats();
        const performance = this.monitor ? this.monitor.getPerformanceComparison() : null;
        
        console.log('\n📊 Migration Status:');
        console.log('==================');
        console.log(`Enabled: ${stats.enabled ? '✅' : '❌'}`);
        console.log(`Test Mode: ${stats.testMode ? '✅' : '❌'}`);
        console.log(`Current Phase: ${stats.currentPhase}`);
        console.log(`Enabled Handlers: ${stats.enabledHandlers.join(', ') || 'none'}`);
        console.log(`Rollback Enabled: ${stats.rollbackEnabled ? '✅' : '❌'}`);
        console.log(`Monitoring: ${stats.monitoringEnabled ? '✅' : '❌'}`);
        
        if (this.isRunning) {
            console.log('\n📈 Runtime Statistics:');
            console.log('=====================');
            console.log(`Running Time: ${this.getRunningTime()}`);
            console.log(`Total Requests: ${this.stats.totalRequests}`);
            console.log(`Successful Migrations: ${this.stats.successfulMigrations}`);
            console.log(`Failed Migrations: ${this.stats.failedMigrations}`);
            console.log(`Rollbacks: ${this.stats.rollbacks}`);
        }
        
        console.log('\n🎯 Available Phases:');
        console.log('===================');
        Object.entries(this.config.getConfig().phases).forEach(([name, phase]) => {
            const status = phase.enabled ? '✅' : '❌';
            console.log(`${status} ${name}: ${phase.name} (${phase.percentage}%)`);
        });
        
        console.log('\n🔧 Available Handlers:');
        console.log('=====================');
        Object.entries(this.config.getConfig().handlers).forEach(([name, handler]) => {
            const status = handler.enabled ? '✅' : '❌';
            console.log(`${status} ${name}: Priority ${handler.priority}`);
        });
    }

    /**
     * Get running time formatted
     */
    getRunningTime() {
        if (!this.stats.startTime) return 'Not started';
        
        const now = new Date();
        const diff = now - this.stats.startTime;
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        return `${minutes}m ${seconds}s`;
    }

    /**
     * Simulate migration test
     */
    async runMigrationTest() {
        console.log('🧪 Running migration test...');
        
        const testUsers = ['test_user_1', 'test_user_2', 'test_user_3'];
        const testActions = ['start', 'wallet', 'buy'];
        
        for (const userId of testUsers) {
            for (const action of testActions) {
                try {
                    const shouldUseNew = this.config.shouldUseNewHandler(userId, 'navigation');
                    console.log(`User ${userId}, Action ${action}: ${shouldUseNew ? 'NEW' : 'OLD'} handler`);
                    
                    this.stats.totalRequests++;
                    this.stats.successfulMigrations++;
                } catch (error) {
                    console.error(`Test failed for ${userId}/${action}:`, error);
                    this.stats.failedMigrations++;
                }
            }
        }
        
        console.log('✅ Migration test completed');
    }

    /**
     * Create mock services for testing
     */
    createMockUserService() {
        return {
            getUser: async (userId) => ({ id: userId, username: `user_${userId}` }),
            updateUserActivity: async () => true,
            clearUserCache: async () => true
        };
    }

    createMockCacheService() {
        return {
            get: async () => null,
            set: async () => true,
            del: async () => true
        };
    }

    createMockWalletService() {
        return {
            getWallet: async () => ({ address: '0x123...', balance: '100' })
        };
    }

    createMockApiService() {
        return {
            get: async () => ({ data: 'mock' }),
            post: async () => ({ success: true })
        };
    }

    createMockMonitoring() {
        return {
            logError: () => {},
            logInfo: () => {},
            incrementCounter: () => {},
            recordTiming: () => {}
        };
    }

    createMockRedis() {
        return {
            get: async () => null,
            set: async () => 'OK',
            del: async () => 1
        };
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const runner = new MigrationRunner();
    
    // Initialize runner
    const initialized = await runner.initialize();
    if (!initialized) {
        process.exit(1);
    }
    
    // Parse command line arguments
    let command = null;
    let value = null;
    
    for (const arg of args) {
        if (arg.startsWith('--phase=')) {
            command = 'phase';
            value = arg.split('=')[1];
        } else if (arg.startsWith('--handler=')) {
            command = 'handler';
            value = arg.split('=')[1];
        } else if (arg === '--enable') {
            command = 'enable';
        } else if (arg === '--disable') {
            command = 'disable';
        } else if (arg === '--status') {
            command = 'status';
        } else if (arg === '--rollback') {
            command = 'rollback';
        } else if (arg === '--test') {
            command = 'test';
        }
    }
    
    // Execute command
    try {
        switch (command) {
            case 'phase':
                await runner.startPhase(value);
                break;
                
            case 'handler':
                if (args.includes('--enable')) {
                    await runner.enableHandler(value);
                } else if (args.includes('--disable')) {
                    await runner.disableHandler(value);
                } else {
                    console.log('Please specify --enable or --disable with --handler');
                }
                break;
                
            case 'status':
                runner.printStatus();
                break;
                
            case 'rollback':
                await runner.performRollback();
                break;
                
            case 'test':
                await runner.runMigrationTest();
                break;
                
            default:
                console.log('Usage:');
                console.log('  node migration-runner.js --phase=phase1');
                console.log('  node migration-runner.js --handler=navigation --enable');
                console.log('  node migration-runner.js --handler=navigation --disable');
                console.log('  node migration-runner.js --status');
                console.log('  node migration-runner.js --rollback');
                console.log('  node migration-runner.js --test');
                break;
        }
    } catch (error) {
        console.error('❌ Command failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = MigrationRunner;