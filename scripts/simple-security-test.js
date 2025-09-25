#!/usr/bin/env node

/**
 * 🧪 Simple Security System Test
 * Basic functionality test without external dependencies
 * Area51 Bot - Production Readiness Verification
 */

const UnifiedSecuritySystem = require('../src/security/UnifiedSecuritySystem');

class SimpleSecurityTest {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };

        // Mock Redis for testing
        this.mockRedis = {
            get: async (key) => {
                console.log(`📥 Redis GET: ${key}`);
                return null; // Simulate no existing data
            },
            setex: async (key, ttl, value) => {
                console.log(`📤 Redis SETEX: ${key} = ${value} (TTL: ${ttl}s)`);
                return 'OK';
            },
            set: async (key, value, type, ttl) => {
                console.log(`📤 Redis SET: ${key} = ${value} (${type}: ${ttl}s)`);
                return 'OK';
            },
            keys: async (pattern) => {
                console.log(`🔍 Redis KEYS: ${pattern}`);
                return [];
            },
            ping: async () => 'PONG'
        };

        // Mock Database for testing
        this.mockDatabase = {
            getUserByTelegramId: async (userId) => {
                console.log(`🔍 Database: Getting user ${userId}`);
                return {
                    id: userId,
                    telegram_id: userId,
                    created_at: new Date(Date.now() - (userId === 12345 ? 35 * 24 * 60 * 60 * 1000 : 5 * 24 * 60 * 60 * 1000)),
                    wallet_address: '0x123...abc'
                };
            },
            getUserTransactionCount: async (userId) => {
                console.log(`📊 Database: Getting transaction count for ${userId}`);
                return userId === 12345 ? 150 : 10;
            }
        };

        this.security = new UnifiedSecuritySystem(this.mockRedis, this.mockDatabase);
    }

    /**
     * Test assertion helper
     */
    assert(condition, testName, expected, actual) {
        this.testResults.total++;
        
        if (condition) {
            this.testResults.passed++;
            console.log(`✅ ${testName}`);
            this.testResults.details.push({
                name: testName,
                status: 'PASSED',
                expected,
                actual
            });
        } else {
            this.testResults.failed++;
            console.log(`❌ ${testName}`);
            console.log(`   Expected: ${expected}`);
            console.log(`   Actual: ${actual}`);
            this.testResults.details.push({
                name: testName,
                status: 'FAILED',
                expected,
                actual
            });
        }
    }

    /**
     * Test encryption and decryption
     */
    testEncryptionDecryption() {
        console.log('\n🔐 Testing Encryption/Decryption...\n');

        try {
            const testData = 'sensitive information';
            const userId = 12345;

            const encrypted = this.security.encrypt(testData, userId);
            const decrypted = this.security.decrypt(encrypted, userId);

            this.assert(
                encrypted !== testData,
                'Data should be encrypted (different from original)',
                'encrypted data',
                encrypted.substring(0, 20) + '...'
            );

            this.assert(
                encrypted.includes('v3:'),
                'Encrypted data should have version prefix',
                'v3: prefix',
                encrypted.substring(0, 10)
            );

            this.assert(
                decrypted === testData,
                'Decrypted data should match original',
                testData,
                decrypted
            );

            // Test different users get different encryption
            const encrypted2 = this.security.encrypt(testData, 54321);
            this.assert(
                encrypted !== encrypted2,
                'Different users should get different encryption',
                'different encrypted values',
                `${encrypted.substring(0, 10)} vs ${encrypted2.substring(0, 10)}`
            );

        } catch (error) {
            this.assert(false, 'Encryption/Decryption should not throw errors', 'no errors', error.message);
        }
    }

    /**
     * Test rate limiting
     */
    async testRateLimiting() {
        console.log('\n⏰ Testing Rate Limiting...\n');

        try {
            const userId = 12345;
            const operation = 'private_key_access';

            // Mock Redis to return different values
            let callCount = 0;
            this.mockRedis.get = async (key) => {
                callCount++;
                console.log(`📥 Redis GET: ${key} (call ${callCount})`);
                return callCount <= 5 ? (callCount - 1).toString() : '10'; // Simulate increasing count
            };

            // Test within limits
            const result1 = await this.security.checkRateLimit(userId, operation);
            this.assert(
                result1.allowed === true,
                'Rate limit should allow operation within limits',
                'allowed: true',
                `allowed: ${result1.allowed}`
            );

            // Test at limit
            const result2 = await this.security.checkRateLimit(userId, operation);
            this.assert(
                result2.allowed === false,
                'Rate limit should block operation at limit',
                'allowed: false',
                `allowed: ${result2.allowed}`
            );

            this.assert(
                result2.reason && result2.reason.includes('Rate limit'),
                'Blocked operation should have rate limit reason',
                'Rate limit reason',
                result2.reason || 'no reason'
            );

        } catch (error) {
            this.assert(false, 'Rate limiting should not throw errors', 'no errors', error.message);
        }
    }

    /**
     * Test user trust levels
     */
    async testUserTrustLevels() {
        console.log('\n⭐ Testing User Trust Levels...\n');

        try {
            // Test new user
            const newUserTrust = await this.security.getUserTrustLevel(99999);
            this.assert(
                newUserTrust === 'new',
                'New user should have "new" trust level',
                'new',
                newUserTrust
            );

            // Test VIP user (mocked as 12345)
            const vipUserTrust = await this.security.getUserTrustLevel(12345);
            this.assert(
                vipUserTrust === 'vip',
                'VIP user should have "vip" trust level',
                'vip',
                vipUserTrust
            );

        } catch (error) {
            this.assert(false, 'Trust level calculation should not throw errors', 'no errors', error.message);
        }
    }

    /**
     * Test data sanitization
     */
    testDataSanitization() {
        console.log('\n🧹 Testing Data Sanitization...\n');

        try {
            // Test private key sanitization
            const privateKeyInput = 'Error: private key 0x1234567890abcdef1234567890abcdef1234567890abcdef';
            const sanitizedPrivateKey = this.security.sanitize(privateKeyInput);
            
            this.assert(
                sanitizedPrivateKey.includes('[PRIVATE_KEY_REDACTED]'),
                'Private key should be redacted',
                '[PRIVATE_KEY_REDACTED]',
                sanitizedPrivateKey
            );

            this.assert(
                !sanitizedPrivateKey.includes('0x1234567890abcdef'),
                'Original private key should not be visible',
                'no original key',
                sanitizedPrivateKey.includes('0x1234567890abcdef') ? 'contains original' : 'properly redacted'
            );

            // Test mnemonic sanitization
            const mnemonicInput = 'Recovery phrase: abandon abandon abandon abandon abandon abandon';
            const sanitizedMnemonic = this.security.sanitize(mnemonicInput);
            
            this.assert(
                sanitizedMnemonic.includes('[MNEMONIC_PHRASE_REDACTED]'),
                'Mnemonic phrase should be redacted',
                '[MNEMONIC_PHRASE_REDACTED]',
                sanitizedMnemonic
            );

            // Test object sanitization
            const objectInput = {
                privateKey: '0x123...',
                password: 'secret123',
                normalData: 'visible'
            };
            const sanitizedObject = this.security.sanitize(objectInput);
            
            this.assert(
                sanitizedObject.privateKey === '[REDACTED]',
                'Object private key should be redacted',
                '[REDACTED]',
                sanitizedObject.privateKey
            );

            this.assert(
                sanitizedObject.normalData === 'visible',
                'Normal data should remain visible',
                'visible',
                sanitizedObject.normalData
            );

        } catch (error) {
            this.assert(false, 'Data sanitization should not throw errors', 'no errors', error.message);
        }
    }

    /**
     * Test security metrics
     */
    testSecurityMetrics() {
        console.log('\n📊 Testing Security Metrics...\n');

        try {
            const initialMetrics = this.security.getMetrics();
            
            this.assert(
                typeof initialMetrics === 'object',
                'Metrics should return an object',
                'object',
                typeof initialMetrics
            );

            this.assert(
                initialMetrics.hasOwnProperty('timestamp'),
                'Metrics should have timestamp',
                'timestamp property',
                initialMetrics.hasOwnProperty('timestamp') ? 'present' : 'missing'
            );

            // Test metrics update
            this.security.metrics.encryptionOperations = 10;
            const updatedMetrics = this.security.getMetrics();
            
            this.assert(
                updatedMetrics.encryptionOperations === 10,
                'Metrics should be updatable',
                '10',
                updatedMetrics.encryptionOperations
            );

        } catch (error) {
            this.assert(false, 'Security metrics should not throw errors', 'no errors', error.message);
        }
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        console.log('🚀 Starting Security System Tests...\n');
        console.log('=' .repeat(60));

        const startTime = Date.now();

        // Run all test suites
        this.testEncryptionDecryption();
        await this.testRateLimiting();
        await this.testUserTrustLevels();
        this.testDataSanitization();
        this.testSecurityMetrics();

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Generate report
        this.generateReport(duration);
    }

    /**
     * Generate test report
     */
    generateReport(duration) {
        console.log('\n' + '=' .repeat(60));
        console.log('📋 Security System Test Report');
        console.log('=' .repeat(60));

        console.log(`\n📊 Test Summary:`);
        console.log(`   Total Tests: ${this.testResults.total}`);
        console.log(`   Passed: ${this.testResults.passed} ✅`);
        console.log(`   Failed: ${this.testResults.failed} ❌`);
        console.log(`   Success Rate: ${Math.round((this.testResults.passed / this.testResults.total) * 100)}%`);
        console.log(`   Duration: ${duration}ms`);

        if (this.testResults.failed > 0) {
            console.log(`\n❌ Failed Tests:`);
            this.testResults.details
                .filter(test => test.status === 'FAILED')
                .forEach(test => {
                    console.log(`   • ${test.name}`);
                    console.log(`     Expected: ${test.expected}`);
                    console.log(`     Actual: ${test.actual}`);
                });
        }

        console.log(`\n🎯 Security System Status:`);
        if (this.testResults.failed === 0) {
            console.log('   ✅ All security features working correctly');
            console.log('   ✅ Encryption/Decryption: PASS');
            console.log('   ✅ Rate Limiting: PASS');
            console.log('   ✅ Trust Levels: PASS');
            console.log('   ✅ Data Sanitization: PASS');
            console.log('   ✅ Security Metrics: PASS');
            console.log('\n🏆 Security System: PRODUCTION READY');
        } else {
            console.log('   ⚠️  Some security features need attention');
            console.log('\n🔧 Security System: NEEDS REVIEW');
        }

        console.log('\n' + '=' .repeat(60));
    }
}

// Run the tests
const tester = new SimpleSecurityTest();
tester.runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});
