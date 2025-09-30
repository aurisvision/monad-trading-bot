/**
 * HandlerTestRunner - Comprehensive testing system for new handlers
 * Ensures all functionality works correctly before integration
 */

const HandlerTester = require('./HandlerTester');
const EnhancedNavigationHandler = require('../handlers/EnhancedNavigationHandler');
const EnhancedWalletHandler = require('../handlers/EnhancedWalletHandler');
const EnhancedTradingInterface = require('../trading/EnhancedTradingInterface');

class HandlerTestRunner {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.tester = new HandlerTester(dependencies);
        this.testResults = {
            navigation: { passed: 0, failed: 0, errors: [] },
            wallet: { passed: 0, failed: 0, errors: [] },
            trading: { passed: 0, failed: 0, errors: [] }
        };
        this.totalTests = 0;
        this.passedTests = 0;
    }

    /**
     * Run all handler tests
     */
    async runAllTests() {
        console.log('🧪 Starting comprehensive handler testing...');
        
        try {
            // Test Navigation Handler
            await this.testNavigationHandler();
            
            // Test Wallet Handler
            await this.testWalletHandler();
            
            // Test Trading Interface
            await this.testTradingInterface();
            
            // Generate final report
            this.generateTestReport();
            
            return this.isAllTestsPassed();
            
        } catch (error) {
            console.error('❌ Critical error during testing:', error);
            return false;
        }
    }

    /**
     * Test Enhanced Navigation Handler
     */
    async testNavigationHandler() {
        console.log('📱 Testing Enhanced Navigation Handler...');
        
        const handler = new EnhancedNavigationHandler(this.dependencies);
        
        const tests = [
            {
                name: 'Start Command',
                test: () => this.tester.testHandler(handler, 'start', { userId: 'test123' })
            },
            {
                name: 'Back to Main',
                test: () => this.tester.testHandler(handler, 'back_to_main', { userId: 'test123' })
            },
            {
                name: 'Token Categories',
                test: () => this.tester.testHandler(handler, 'token_categories', { userId: 'test123' })
            },
            {
                name: 'Refresh Data',
                test: () => this.tester.testHandler(handler, 'refresh', { userId: 'test123' })
            },
            {
                name: 'Transfer Function',
                test: () => this.tester.testHandler(handler, 'transfer', { userId: 'test123' })
            }
        ];

        await this.runTestSuite('navigation', tests);
    }

    /**
     * Test Enhanced Wallet Handler
     */
    async testWalletHandler() {
        console.log('💰 Testing Enhanced Wallet Handler...');
        
        const handler = new EnhancedWalletHandler(this.dependencies);
        
        const tests = [
            {
                name: 'Wallet Main',
                test: () => this.tester.testHandler(handler, 'wallet', { userId: 'test123' })
            },
            {
                name: 'Generate Wallet',
                test: () => this.tester.testHandler(handler, 'generate_wallet', { userId: 'test123' })
            },
            {
                name: 'Import Wallet',
                test: () => this.tester.testHandler(handler, 'import_wallet', { userId: 'test123' })
            },
            {
                name: 'Export Private Key',
                test: () => this.tester.testHandler(handler, 'export_private_key', { userId: 'test123' })
            },
            {
                name: 'Delete Wallet',
                test: () => this.tester.testHandler(handler, 'delete_wallet', { userId: 'test123' })
            }
        ];

        await this.runTestSuite('wallet', tests);
    }

    /**
     * Test Enhanced Trading Interface
     */
    async testTradingInterface() {
        console.log('📈 Testing Enhanced Trading Interface...');
        
        const handler = new EnhancedTradingInterface(this.dependencies);
        
        const tests = [
            {
                name: 'Buy Action',
                test: () => this.tester.testHandler(handler, 'buy', { userId: 'test123' })
            },
            {
                name: 'Portfolio View',
                test: () => this.tester.testHandler(handler, 'portfolio', { userId: 'test123' })
            },
            {
                name: 'Sell Action',
                test: () => this.tester.testHandler(handler, 'sell', { userId: 'test123' })
            },
            {
                name: 'Cancel Order',
                test: () => this.tester.testHandler(handler, 'cancel', { userId: 'test123' })
            }
        ];

        await this.runTestSuite('trading', tests);
    }

    /**
     * Run a test suite for a specific handler type
     */
    async runTestSuite(handlerType, tests) {
        for (const testCase of tests) {
            this.totalTests++;
            
            try {
                console.log(`  ⏳ Running: ${testCase.name}`);
                
                const result = await testCase.test();
                
                if (result.success) {
                    this.testResults[handlerType].passed++;
                    this.passedTests++;
                    console.log(`  ✅ ${testCase.name}: PASSED`);
                } else {
                    this.testResults[handlerType].failed++;
                    this.testResults[handlerType].errors.push({
                        test: testCase.name,
                        error: result.error
                    });
                    console.log(`  ❌ ${testCase.name}: FAILED - ${result.error}`);
                }
                
            } catch (error) {
                this.testResults[handlerType].failed++;
                this.testResults[handlerType].errors.push({
                    test: testCase.name,
                    error: error.message
                });
                console.log(`  💥 ${testCase.name}: ERROR - ${error.message}`);
            }
        }
    }

    /**
     * Generate comprehensive test report
     */
    generateTestReport() {
        console.log('\n📊 TEST RESULTS SUMMARY');
        console.log('========================');
        
        console.log(`Total Tests: ${this.totalTests}`);
        console.log(`Passed: ${this.passedTests}`);
        console.log(`Failed: ${this.totalTests - this.passedTests}`);
        console.log(`Success Rate: ${((this.passedTests / this.totalTests) * 100).toFixed(2)}%`);
        
        console.log('\n📱 Navigation Handler:');
        console.log(`  Passed: ${this.testResults.navigation.passed}`);
        console.log(`  Failed: ${this.testResults.navigation.failed}`);
        
        console.log('\n💰 Wallet Handler:');
        console.log(`  Passed: ${this.testResults.wallet.passed}`);
        console.log(`  Failed: ${this.testResults.wallet.failed}`);
        
        console.log('\n📈 Trading Interface:');
        console.log(`  Passed: ${this.testResults.trading.passed}`);
        console.log(`  Failed: ${this.testResults.trading.failed}`);
        
        // Show errors if any
        this.showErrors();
    }

    /**
     * Show detailed error information
     */
    showErrors() {
        const allErrors = [
            ...this.testResults.navigation.errors,
            ...this.testResults.wallet.errors,
            ...this.testResults.trading.errors
        ];
        
        if (allErrors.length > 0) {
            console.log('\n❌ DETAILED ERROR REPORT');
            console.log('=========================');
            
            allErrors.forEach((error, index) => {
                console.log(`${index + 1}. ${error.test}: ${error.error}`);
            });
        }
    }

    /**
     * Check if all tests passed
     */
    isAllTestsPassed() {
        return this.passedTests === this.totalTests;
    }

    /**
     * Get test statistics
     */
    getTestStats() {
        return {
            total: this.totalTests,
            passed: this.passedTests,
            failed: this.totalTests - this.passedTests,
            successRate: (this.passedTests / this.totalTests) * 100,
            results: this.testResults
        };
    }
}

module.exports = HandlerTestRunner;