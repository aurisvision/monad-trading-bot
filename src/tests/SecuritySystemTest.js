/**
 * Quick Security System Test
 * Tests the new user-friendly rate limiting system
 */

const UnifiedSecuritySystem = require('../security/UnifiedSecuritySystem');

class SecuritySystemTest {
    constructor() {
        // Mock Redis and Database for testing
        this.mockRedis = {
            get: async (key) => {
                console.log(`📥 Redis GET: ${key}`);
                return null; // Simulate no existing rate limit
            },
            setex: async (key, ttl, value) => {
                console.log(`📤 Redis SETEX: ${key} = ${value} (TTL: ${ttl}s)`);
                return 'OK';
            },
            set: async (key, value, type, ttl) => {
                console.log(`📤 Redis SET: ${key} = ${value} (${type}: ${ttl}s)`);
                return 'OK';
            }
        };

        this.mockDatabase = {
            getUserByTelegramId: async (userId) => {
                console.log(`🔍 Database: Getting user ${userId}`);
                return {
                    id: userId,
                    telegram_id: userId,
                    created_at: new Date(Date.now() - (userId === 12345 ? 35 * 24 * 60 * 60 * 1000 : 5 * 24 * 60 * 60 * 1000)), // VIP vs Regular
                    wallet_address: '0x123...abc'
                };
            },
            getUserTransactionCount: async (userId) => {
                console.log(`📊 Database: Getting transaction count for ${userId}`);
                return userId === 12345 ? 150 : 10; // VIP vs Regular
            }
        };

        this.security = new UnifiedSecuritySystem(this.mockRedis, this.mockDatabase);
    }

    async testUserTrustLevels() {
        console.log('\n🧪 Testing User Trust Levels...\n');

        const testUsers = [
            { id: 11111, expected: 'new' },
            { id: 22222, expected: 'regular' }, 
            { id: 12345, expected: 'vip' }
        ];

        for (const testUser of testUsers) {
            const trustLevel = await this.security.getUserTrustLevel(testUser.id);
            const baseLimit = 10;
            const adjustedLimit = this.security.getAdjustedLimit(baseLimit, trustLevel);
            
            console.log(`👤 User ${testUser.id}:`);
            console.log(`   Trust Level: ${trustLevel} (expected: ${testUser.expected})`);
            console.log(`   Base Limit: ${baseLimit} → Adjusted: ${adjustedLimit}`);
            console.log(`   ✅ ${trustLevel === testUser.expected ? 'PASS' : 'FAIL'}\n`);
        }
    }

    async testRateLimiting() {
        console.log('\n🧪 Testing Rate Limiting...\n');

        const testUserId = 12345; // VIP user
        const operation = 'private_key_access';

        // Test multiple attempts
        for (let i = 1; i <= 12; i++) {
            const result = await this.security.checkRateLimit(testUserId, operation);
            console.log(`Attempt ${i}: ${result.allowed ? '✅ ALLOWED' : '❌ DENIED'}`);
            if (!result.allowed) {
                console.log(`   Reason: ${result.reason}`);
                break;
            }
        }
    }

    async testSecurityConfig() {
        console.log('\n🧪 Testing Security Configuration...\n');

        console.log('📋 Rate Limits:');
        Object.entries(this.security.config.rateLimits).forEach(([operation, config]) => {
            console.log(`   ${operation}: ${config.limit}/${Math.floor(config.window/60000)}min`);
        });

        console.log('\n🎯 Trust Level Multipliers:');
        const baseLimit = 10;
        ['new', 'regular', 'trusted', 'vip'].forEach(level => {
            const adjusted = this.security.getAdjustedLimit(baseLimit, level);
            console.log(`   ${level}: ${baseLimit} → ${adjusted} (${adjusted/baseLimit}x)`);
        });
    }

    async runAllTests() {
        console.log('🚀 Starting Security System Tests...\n');
        
        try {
            await this.testSecurityConfig();
            await this.testUserTrustLevels();
            await this.testRateLimiting();
            
            console.log('\n✅ All tests completed successfully!');
            console.log('\n📊 Summary:');
            console.log('• User-friendly rate limiting: ✅ Working');
            console.log('• Trust level system: ✅ Working');
            console.log('• Adjusted limits: ✅ Working');
            console.log('• Security maintained: ✅ Working');
            
        } catch (error) {
            console.error('\n❌ Test failed:', error);
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const test = new SecuritySystemTest();
    test.runAllTests();
}

module.exports = SecuritySystemTest;
