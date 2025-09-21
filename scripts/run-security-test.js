// 🧪 Run Security Tests - Validate all security measures
// Area51 Bot Security Testing Script

require('dotenv').config();
const SecurityTest = require('../src/security/SecurityTest');

async function runSecurityTests() {
    console.log('🛡️  Area51 Bot - Security Test Suite');
    console.log('=====================================\n');
    
    try {
        // Mock Redis and Database for testing
        const mockRedis = {
            get: async (key) => null,
            set: async (key, value, ...args) => 'OK',
            setex: async (key, ttl, value) => 'OK'
        };
        
        const mockDatabase = {
            query: async (sql, params) => ({ rows: [] })
        };
        
        // Initialize security test
        const securityTest = new SecurityTest(mockRedis, mockDatabase);
        
        // Run all security tests
        const results = await securityTest.runSecurityTests();
        
        // Exit with appropriate code
        if (results.critical > 0) {
            console.log('❌ CRITICAL SECURITY ISSUES DETECTED!');
            process.exit(1);
        } else if (results.failed > 0) {
            console.log('⚠️  Some security tests failed.');
            process.exit(1);
        } else {
            console.log('✅ All security tests passed!');
            process.exit(0);
        }
        
    } catch (error) {
        console.error('💥 Security test suite failed:', error);
        process.exit(1);
    }
}

// Run tests if called directly
if (require.main === module) {
    runSecurityTests();
}

module.exports = runSecurityTests;
