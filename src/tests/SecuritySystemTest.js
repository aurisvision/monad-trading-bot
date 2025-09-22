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
                return null; // Simulate no existing rate limit
            },
            setex: async (key, ttl, value) => {
                `);
                return 'OK';
            },
            set: async (key, value, type, ttl) => {
                `);
                return 'OK';
            }
        };
        this.mockDatabase = {
            getUserByTelegramId: async (userId) => {
                return {
                    id: userId,
                    telegram_id: userId,
                    created_at: new Date(Date.now() - (userId === 12345 ? 35 * 24 * 60 * 60 * 1000 : 5 * 24 * 60 * 60 * 1000)), // VIP vs Regular
                    wallet_address: '0x123...abc'
                };
            },
            getUserTransactionCount: async (userId) => {
                return userId === 12345 ? 150 : 10; // VIP vs Regular
            }
        };
        this.security = new UnifiedSecuritySystem(this.mockRedis, this.mockDatabase);
    }
    async testUserTrustLevels() {
        const testUsers = [
            { id: 11111, expected: 'new' },
            { id: 22222, expected: 'regular' }, 
            { id: 12345, expected: 'vip' }
        ];
        for (const testUser of testUsers) {
            const trustLevel = await this.security.getUserTrustLevel(testUser.id);
            const baseLimit = 10;
            const adjustedLimit = this.security.getAdjustedLimit(baseLimit, trustLevel);
            `);
        }
    }
    async testRateLimiting() {
        const testUserId = 12345; // VIP user
        const operation = 'private_key_access';
        // Test multiple attempts
        for (let i = 1; i <= 12; i++) {
            const result = await this.security.checkRateLimit(testUserId, operation);
            if (!result.allowed) {
                break;
            }
        }
    }
    async testSecurityConfig() {
        Object.entries(this.security.config.rateLimits).forEach(([operation, config]) => {
            }min`);
        });
        const baseLimit = 10;
        ['new', 'regular', 'trusted', 'vip'].forEach(level => {
            const adjusted = this.security.getAdjustedLimit(baseLimit, level);
            `);
        });
    }
    async runAllTests() {
        try {
            await this.testSecurityConfig();
            await this.testUserTrustLevels();
            await this.testRateLimiting();
        } catch (error) {
        }
    }
}
// Run tests if called directly
if (require.main === module) {
    const test = new SecuritySystemTest();
    test.runAllTests();
}
module.exports = SecuritySystemTest;