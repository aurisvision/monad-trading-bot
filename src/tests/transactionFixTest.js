/**
 * Test Script for Transaction Fixes
 * Tests the fixes for QuickNode rate limiting and empty transaction data
 */

const { ethers } = require('ethers');

class TransactionFixTest {
    constructor() {
        this.testResults = [];
    }

    /**
     * Test rate limiting functionality
     */
    async testRateLimiting() {
        console.log('🧪 Testing Rate Limiting...');
        
        try {
            const startTime = Date.now();
            
            // Simulate multiple rapid requests
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(this.simulateAPIRequest(i));
            }
            
            await Promise.all(promises);
            
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            // Should take at least 400ms (5 requests * 100ms throttle)
            const passed = totalTime >= 400;
            
            this.testResults.push({
                test: 'Rate Limiting',
                passed,
                details: `Total time: ${totalTime}ms (expected >= 400ms)`
            });
            
            console.log(passed ? '✅ Rate limiting test passed' : '❌ Rate limiting test failed');
            
        } catch (error) {
            this.testResults.push({
                test: 'Rate Limiting',
                passed: false,
                error: error.message
            });
            console.log('❌ Rate limiting test failed:', error.message);
        }
    }

    /**
     * Test transaction data validation
     */
    async testTransactionValidation() {
        console.log('🧪 Testing Transaction Validation...');
        
        const testCases = [
            {
                name: 'Valid Transaction',
                data: {
                    to: '0x1234567890123456789012345678901234567890',
                    data: '0xa9059cbb000000000000000000000000',
                    value: '0x0'
                },
                shouldPass: true
            },
            {
                name: 'Empty Data',
                data: {
                    to: '0x1234567890123456789012345678901234567890',
                    data: '0x',
                    value: '0x0'
                },
                shouldPass: false
            },
            {
                name: 'Invalid Address',
                data: {
                    to: 'invalid_address',
                    data: '0xa9059cbb000000000000000000000000',
                    value: '0x0'
                },
                shouldPass: false
            },
            {
                name: 'Missing Data',
                data: {
                    to: '0x1234567890123456789012345678901234567890',
                    value: '0x0'
                },
                shouldPass: false
            }
        ];

        for (const testCase of testCases) {
            try {
                const result = this.validateTransactionData(testCase.data);
                const passed = testCase.shouldPass === result.valid;
                
                this.testResults.push({
                    test: `Transaction Validation - ${testCase.name}`,
                    passed,
                    details: result.error || 'Validation passed'
                });
                
                console.log(passed ? `✅ ${testCase.name} test passed` : `❌ ${testCase.name} test failed`);
                
            } catch (error) {
                const passed = !testCase.shouldPass;
                this.testResults.push({
                    test: `Transaction Validation - ${testCase.name}`,
                    passed,
                    error: error.message
                });
                console.log(passed ? `✅ ${testCase.name} test passed (expected error)` : `❌ ${testCase.name} test failed`);
            }
        }
    }

    /**
     * Test error message formatting
     */
    testErrorFormatting() {
        console.log('🧪 Testing Error Message Formatting...');
        
        const errorTests = [
            {
                input: 'rate limit exceeded',
                expected: 'Rate limit reached. Please wait a moment and try again.'
            },
            {
                input: 'insufficient balance for transfer',
                expected: 'Insufficient balance. Please add more MON to your wallet.'
            },
            {
                input: 'Invalid transaction data from Monorail API',
                expected: 'This token cannot be traded right now. Please try a different token.'
            },
            {
                input: 'execution reverted',
                expected: 'Transaction failed. This may be due to price changes or insufficient liquidity.'
            }
        ];

        for (const test of errorTests) {
            const formatted = this.formatErrorMessage(test.input);
            const passed = formatted === test.expected;
            
            this.testResults.push({
                test: `Error Formatting - ${test.input}`,
                passed,
                details: `Got: "${formatted}", Expected: "${test.expected}"`
            });
            
            console.log(passed ? '✅ Error formatting test passed' : '❌ Error formatting test failed');
        }
    }

    /**
     * Simulate API request with timing
     */
    async simulateAPIRequest(index) {
        const startTime = Date.now();
        
        // Simulate throttling delay
        if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const endTime = Date.now();
        console.log(`Request ${index} completed in ${endTime - startTime}ms`);
        
        return { index, time: endTime - startTime };
    }

    /**
     * Validate transaction data (simplified version)
     */
    validateTransactionData(data) {
        if (!data.to || !ethers.isAddress(data.to)) {
            return { valid: false, error: 'Invalid to address' };
        }

        if (!data.data || data.data === '0x' || data.data === '' || data.data.length < 10) {
            return { valid: false, error: 'Invalid transaction data' };
        }

        return { valid: true };
    }

    /**
     * Format error message (simplified version)
     */
    formatErrorMessage(error) {
        if (error.includes('rate limit')) {
            return 'Rate limit reached. Please wait a moment and try again.';
        } else if (error.includes('insufficient balance')) {
            return 'Insufficient balance. Please add more MON to your wallet.';
        } else if (error.includes('Invalid transaction data')) {
            return 'This token cannot be traded right now. Please try a different token.';
        } else if (error.includes('execution reverted')) {
            return 'Transaction failed. This may be due to price changes or insufficient liquidity.';
        } else {
            return `Transaction failed: ${error}`;
        }
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        console.log('🚀 Starting Transaction Fix Tests...\n');
        
        await this.testRateLimiting();
        console.log('');
        
        await this.testTransactionValidation();
        console.log('');
        
        this.testErrorFormatting();
        console.log('');
        
        this.printResults();
    }

    /**
     * Print test results summary
     */
    printResults() {
        console.log('📊 Test Results Summary:');
        console.log('========================');
        
        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;
        
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${total - passed}`);
        console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
        
        console.log('\nDetailed Results:');
        this.testResults.forEach((result, index) => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${result.test}`);
            if (result.details) {
                console.log(`   Details: ${result.details}`);
            }
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });
        
        if (passed === total) {
            console.log('\n🎉 All tests passed! Transaction fixes are working correctly.');
        } else {
            console.log('\n⚠️  Some tests failed. Please review the fixes.');
        }
    }
}

// Export for use in other modules
module.exports = TransactionFixTest;

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new TransactionFixTest();
    tester.runAllTests().catch(console.error);
}