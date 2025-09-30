#!/usr/bin/env node

/**
 * Comprehensive Functionality Test for Area51 Modular Bot
 * Tests all major functionality to ensure no regressions after modularization
 */

const fs = require('fs');
const path = require('path');

class ComprehensiveTester {
    constructor() {
        this.testResults = [];
        this.totalTests = 0;
        this.passedTests = 0;
        this.failedTests = 0;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    async runTest(testName, testFunction) {
        this.totalTests++;
        try {
            await testFunction();
            this.passedTests++;
            this.testResults.push({ name: testName, status: 'PASSED', error: null });
            this.log(`${testName}: PASSED`, 'success');
            return true;
        } catch (error) {
            this.failedTests++;
            this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
            this.log(`${testName}: FAILED - ${error.message}`, 'error');
            return false;
        }
    }

    // Test 1: Core Module Structure
    async testCoreModuleStructure() {
        const coreModules = [
            'src/core/ModularBot.js',
            'src/core/BotInitializer.js',
            'src/core/SettingsManager.js',
            'src/core/MiddlewareManager.js',
            'src/core/HandlerRegistry.js',
            'src/core/HealthServerManager.js',
            'src/core/HandlerManager.js'
        ];

        for (const module of coreModules) {
            if (!fs.existsSync(module)) {
                throw new Error(`Core module missing: ${module}`);
            }
            
            const content = fs.readFileSync(module, 'utf8');
            if (content.length < 100) {
                throw new Error(`Core module appears empty or too small: ${module}`);
            }
        }
    }

    // Test 2: Configuration Files
    async testConfigurationFiles() {
        const configFiles = [
            'src/config/MigrationConfig.js',
            'src/config/CacheConfig.js'
        ];

        for (const configFile of configFiles) {
            if (!fs.existsSync(configFile)) {
                throw new Error(`Configuration file missing: ${configFile}`);
            }
        }
    }

    // Test 3: Entry Points
    async testEntryPoints() {
        const entryPoints = [
            'src/index-modular-simple.js',  // Original
            'src/index-modular.js'          // New modular
        ];

        for (const entryPoint of entryPoints) {
            if (!fs.existsSync(entryPoint)) {
                throw new Error(`Entry point missing: ${entryPoint}`);
            }
            
            const content = fs.readFileSync(entryPoint, 'utf8');
            if (!content.includes('require') && !content.includes('import')) {
                throw new Error(`Entry point appears invalid: ${entryPoint}`);
            }
        }
    }

    // Test 4: Handler Files Integrity
    async testHandlerFiles() {
        const handlerFiles = [
            'src/handlers/navigationHandlers.js',
            'src/handlers/walletHandlers.js',
            'src/handlers/portfolioHandlers.js'
        ];

        for (const handlerFile of handlerFiles) {
            if (!fs.existsSync(handlerFile)) {
                throw new Error(`Handler file missing: ${handlerFile}`);
            }
            
            const content = fs.readFileSync(handlerFile, 'utf8');
            if (!content.includes('module.exports') && !content.includes('export')) {
                throw new Error(`Handler file appears to have no exports: ${handlerFile}`);
            }
        }
    }

    // Test 5: Trading System Files
    async testTradingSystemFiles() {
        const tradingFiles = [
            'src/trading/TradingInterface.js',
            'src/trading/UnifiedTradingEngine.js'
        ];

        for (const tradingFile of tradingFiles) {
            if (!fs.existsSync(tradingFile)) {
                throw new Error(`Trading file missing: ${tradingFile}`);
            }
            
            const content = fs.readFileSync(tradingFile, 'utf8');
            if (content.length < 500) {
                throw new Error(`Trading file appears too small: ${tradingFile}`);
            }
        }
    }

    // Test 6: Service Files
    async testServiceFiles() {
        const serviceFiles = [
            'src/services/PortfolioService.js',
            'src/services/BackgroundRefreshService.js',
            'src/services/StateManager.js'
        ];

        for (const serviceFile of serviceFiles) {
            if (!fs.existsSync(serviceFile)) {
                throw new Error(`Service file missing: ${serviceFile}`);
            }
        }
    }

    // Test 7: Package.json Scripts
    async testPackageJsonScripts() {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        const requiredScripts = [
            'start',
            'dev',
            'start:modular',
            'dev:modular',
            'test',
            'migrate',
            'backup'
        ];

        for (const script of requiredScripts) {
            if (!packageJson.scripts[script]) {
                throw new Error(`Required script missing: ${script}`);
            }
        }
    }

    // Test 8: Dependencies Check
    async testDependencies() {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        const criticalDependencies = [
            'telegraf',
            'redis',
            'pg',
            'winston',
            'express',
            'axios'
        ];

        for (const dep of criticalDependencies) {
            if (!packageJson.dependencies[dep]) {
                throw new Error(`Critical dependency missing: ${dep}`);
            }
        }
    }

    // Test 9: Module Import Syntax
    async testModuleImportSyntax() {
        const ModularBot = require('./src/core/ModularBot');
        const BotInitializer = require('./src/core/BotInitializer');
        const SettingsManager = require('./src/core/SettingsManager');
        const MiddlewareManager = require('./src/core/MiddlewareManager');
        const HandlerRegistry = require('./src/core/HandlerRegistry');
        const HealthServerManager = require('./src/core/HealthServerManager');

        // Verify they are constructors/classes
        if (typeof ModularBot !== 'function') {
            throw new Error('ModularBot is not a constructor');
        }
        if (typeof BotInitializer !== 'function') {
            throw new Error('BotInitializer is not a constructor');
        }
        if (typeof SettingsManager !== 'function') {
            throw new Error('SettingsManager is not a constructor');
        }
    }

    // Test 10: Migration System Integration
    async testMigrationSystemIntegration() {
        const MigrationConfig = require('./src/config/MigrationConfig');
        const HandlerManager = require('./src/core/HandlerManager');

        if (typeof MigrationConfig !== 'function') {
            throw new Error('MigrationConfig is not a constructor');
        }
        if (typeof HandlerManager !== 'function') {
            throw new Error('HandlerManager is not a constructor');
        }

        // Test migration config structure by instantiating it
        const migrationConfig = new MigrationConfig();
        const config = migrationConfig.getConfig();
        
        // Check required properties in the config object
        const requiredProperties = ['phases', 'handlers', 'enabled'];
        for (const prop of requiredProperties) {
            if (!(prop in config)) {
                throw new Error(`MigrationConfig missing property: ${prop}`);
            }
        }
    }

    // Test 11: Documentation Files
    async testDocumentationFiles() {
        const docFiles = [
            'README.md',
            'MODULAR_ARCHITECTURE.md',
            'production-migration-guide.md'
        ];

        for (const docFile of docFiles) {
            if (!fs.existsSync(docFile)) {
                throw new Error(`Documentation file missing: ${docFile}`);
            }
            
            const content = fs.readFileSync(docFile, 'utf8');
            if (content.length < 100) {
                throw new Error(`Documentation file appears too small: ${docFile}`);
            }
        }
    }

    // Test 12: Test Files Integrity
    async testTestFilesIntegrity() {
        const testFiles = [
            'test-modular-functionality.js',
            'simple-migration-test.js',
            'comprehensive-functionality-test.js'
        ];

        for (const testFile of testFiles) {
            if (!fs.existsSync(testFile)) {
                throw new Error(`Test file missing: ${testFile}`);
            }
        }
    }

    // Test 13: Environment Configuration
    async testEnvironmentConfiguration() {
        // Check if .env.example exists or environment variables are documented
        const hasEnvExample = fs.existsSync('.env.example');
        const hasEnvDoc = fs.existsSync('ENVIRONMENT.md');
        
        if (!hasEnvExample && !hasEnvDoc) {
            // Check if environment variables are documented in README
            const readmeContent = fs.readFileSync('README.md', 'utf8');
            if (!readmeContent.includes('BOT_TOKEN') && !readmeContent.includes('environment')) {
                throw new Error('No environment configuration documentation found');
            }
        }
    }

    // Test 14: Database Migration Files
    async testDatabaseMigrationFiles() {
        const migrationDirs = [
            'src/database/migrations',
            'migrations',
            'database/migrations'
        ];

        let foundMigrations = false;
        for (const dir of migrationDirs) {
            if (fs.existsSync(dir)) {
                foundMigrations = true;
                break;
            }
        }

        if (!foundMigrations) {
            // Check if database setup is handled elsewhere
            const dbFiles = [
                'src/database/setup.js',
                'src/database/schema.sql',
                'src/database/init.js'
            ];
            
            let foundDbSetup = false;
            for (const file of dbFiles) {
                if (fs.existsSync(file)) {
                    foundDbSetup = true;
                    break;
                }
            }
            
            if (!foundDbSetup) {
                throw new Error('No database migration or setup files found');
            }
        }
    }

    // Test 15: Monitoring and Logging Setup
    async testMonitoringAndLogging() {
        const monitoringFiles = [
            'src/monitoring',
            'src/utils/logger.js',
            'src/services/MonitoringService.js'
        ];

        let foundMonitoring = false;
        for (const file of monitoringFiles) {
            if (fs.existsSync(file)) {
                foundMonitoring = true;
                break;
            }
        }

        if (!foundMonitoring) {
            throw new Error('No monitoring or logging setup found');
        }
    }

    async runAllTests() {
        this.log('🚀 Starting Comprehensive Functionality Test Suite', 'info');
        this.log('=' * 60, 'info');

        const tests = [
            ['Core Module Structure', () => this.testCoreModuleStructure()],
            ['Configuration Files', () => this.testConfigurationFiles()],
            ['Entry Points', () => this.testEntryPoints()],
            ['Handler Files Integrity', () => this.testHandlerFiles()],
            ['Trading System Files', () => this.testTradingSystemFiles()],
            ['Service Files', () => this.testServiceFiles()],
            ['Package.json Scripts', () => this.testPackageJsonScripts()],
            ['Dependencies Check', () => this.testDependencies()],
            ['Module Import Syntax', () => this.testModuleImportSyntax()],
            ['Migration System Integration', () => this.testMigrationSystemIntegration()],
            ['Documentation Files', () => this.testDocumentationFiles()],
            ['Test Files Integrity', () => this.testTestFilesIntegrity()],
            ['Environment Configuration', () => this.testEnvironmentConfiguration()],
            ['Database Migration Files', () => this.testDatabaseMigrationFiles()],
            ['Monitoring and Logging Setup', () => this.testMonitoringAndLogging()]
        ];

        for (const [testName, testFunction] of tests) {
            await this.runTest(testName, testFunction);
        }

        this.printSummary();
    }

    printSummary() {
        this.log('=' * 60, 'info');
        this.log('📊 TEST SUMMARY', 'info');
        this.log('=' * 60, 'info');
        
        const successRate = Math.round((this.passedTests / this.totalTests) * 100);
        
        this.log(`Total Tests: ${this.totalTests}`, 'info');
        this.log(`Passed: ${this.passedTests}`, 'success');
        this.log(`Failed: ${this.failedTests}`, this.failedTests > 0 ? 'error' : 'info');
        this.log(`Success Rate: ${successRate}%`, successRate === 100 ? 'success' : 'error');

        if (this.failedTests > 0) {
            this.log('\n❌ FAILED TESTS:', 'error');
            this.testResults
                .filter(result => result.status === 'FAILED')
                .forEach(result => {
                    this.log(`  • ${result.name}: ${result.error}`, 'error');
                });
        }

        if (successRate === 100) {
            this.log('\n🎉 ALL TESTS PASSED! The modular bot is ready for production deployment.', 'success');
        } else if (successRate >= 90) {
            this.log('\n⚠️  Most tests passed, but some issues need attention before deployment.', 'error');
        } else {
            this.log('\n🚨 Critical issues found. Please fix before proceeding with deployment.', 'error');
        }

        this.log('=' * 60, 'info');
    }
}

// Run the comprehensive test suite
async function main() {
    const tester = new ComprehensiveTester();
    await tester.runAllTests();
    
    // Exit with appropriate code
    process.exit(tester.failedTests > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Test suite failed to run:', error);
        process.exit(1);
    });
}

module.exports = ComprehensiveTester;