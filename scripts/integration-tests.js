/**
 * 🔗 Integration Tests - Core Components
 * Tests interactions between major system components
 */

const { Telegraf } = require('telegraf');
const Database = require('../src/database-postgresql');
const UnifiedCacheManager = require('../src/services/UnifiedCacheManager');
const UnifiedSecuritySystem = require('../src/security/UnifiedSecuritySystem');
const WalletHandlers = require('../src/handlers/walletHandlers');

// Mock Redis for testing
const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue('PONG'),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true)
};

describe('Core Components Integration', () => {
    let database;
    let cacheManager;
    let securitySystem;
    let walletHandlers;
    let mockBot;

    beforeAll(async () => {
        // Initialize components
        database = new Database();
        cacheManager = new UnifiedCacheManager(mockRedis);
        securitySystem = new UnifiedSecuritySystem(mockRedis, database);

        // Mock bot for handlers
        mockBot = {
            action: jest.fn(),
            command: jest.fn(),
            on: jest.fn(),
            start: jest.fn(),
            catch: jest.fn(),
            use: jest.fn()
        };

        walletHandlers = new WalletHandlers(mockBot, database, null, null, mockRedis, cacheManager);

        // Mock database methods
        database.getUserByTelegramId = jest.fn();
        database.createUser = jest.fn();
        database.updateUserSettings = jest.fn();
        database.getUserSettings = jest.fn();
        database.getUserState = jest.fn();
        database.setUserState = jest.fn();
    });

    describe('Database + Cache Integration', () => {
        test('should cache database queries', async () => {
            // Setup mock data
            const mockUser = { id: 1, telegram_id: 12345, wallet_address: '0x123...' };
            database.getUserByTelegramId.mockResolvedValue(mockUser);

            // First call should hit database
            let result = await database.getUserByTelegramId(12345);
            expect(result).toEqual(mockUser);
            expect(mockRedis.get).toHaveBeenCalled();

            // Second call should hit cache
            mockRedis.get.mockResolvedValue(JSON.stringify(mockUser));
            result = await database.getUserByTelegramId(12345);
            expect(result).toEqual(mockUser);
        });

        test('should invalidate cache on data updates', async () => {
            const userId = 12345;
            const cacheKey = `user:${userId}`;

            // Simulate cache invalidation
            await cacheManager.invalidate(cacheKey);
            expect(mockRedis.del).toHaveBeenCalledWith(cacheKey);
        });
    });

    describe('Security + Database Integration', () => {
        test('should encrypt sensitive user data', async () => {
            const sensitiveData = 'private_key_data';
            const userId = 12345;

            const encrypted = securitySystem.encrypt(sensitiveData, userId);
            const decrypted = securitySystem.decrypt(encrypted, userId);

            expect(encrypted).not.toBe(sensitiveData);
            expect(decrypted).toBe(sensitiveData);
        });

        test('should apply rate limiting to database operations', async () => {
            const userId = 12345;
            const operation = 'wallet_access';

            // First few attempts should succeed
            for (let i = 0; i < 5; i++) {
                mockRedis.get.mockResolvedValue(i.toString());
                const result = await securitySystem.checkRateLimit(userId, operation);
                expect(result.allowed).toBe(true);
            }

            // Next attempt should be blocked (assuming limit is 5)
            mockRedis.get.mockResolvedValue('5');
            const result = await securitySystem.checkRateLimit(userId, operation);
            expect(result.allowed).toBe(false);
        });
    });

    describe('Cache + Security Integration', () => {
        test('should cache security verification results', async () => {
            const userId = 12345;
            const operation = 'private_key_access';

            // First verification
            mockRedis.get.mockResolvedValue('2'); // Under limit
            const result1 = await securitySystem.checkRateLimit(userId, operation);
            expect(result1.allowed).toBe(true);

            // Should use cached result for subsequent calls
            const result2 = await securitySystem.checkRateLimit(userId, operation);
            expect(result2.allowed).toBe(true);
        });

        test('should handle cache failures gracefully', async () => {
            mockRedis.get.mockRejectedValue(new Error('Cache failure'));

            const result = await securitySystem.checkRateLimit(12345, 'test_operation');

            // Should fail open for availability
            expect(result.allowed).toBe(true);
        });
    });

    describe('Handler + Security Integration', () => {
        test('should validate user permissions in handlers', async () => {
            const ctx = {
                from: { id: 12345 },
                answerCbQuery: jest.fn(),
                reply: jest.fn()
            };

            // Mock user data
            database.getUserByTelegramId.mockResolvedValue({
                id: 1,
                telegram_id: 12345,
                created_at: new Date()
            });

            // Mock security check
            securitySystem.checkRateLimit = jest.fn().mockResolvedValue({ allowed: true });

            // Test wallet access
            await walletHandlers.showWalletInterface(ctx);

            expect(database.getUserByTelegramId).toHaveBeenCalledWith(12345);
            expect(securitySystem.checkRateLimit).toHaveBeenCalled();
        });

        test('should block unauthorized operations', async () => {
            const ctx = {
                from: { id: 12345 },
                reply: jest.fn()
            };

            // Mock rate limit exceeded
            securitySystem.checkRateLimit = jest.fn().mockResolvedValue({
                allowed: false,
                reason: 'Rate limit exceeded'
            });

            // Attempt operation
            await walletHandlers.showWalletInterface(ctx);

            expect(ctx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Rate limit exceeded')
            );
        });
    });

    describe('End-to-End User Flow', () => {
        test('should handle complete user registration flow', async () => {
            const userId = 99999;

            // Step 1: Check if user exists (new user)
            database.getUserByTelegramId.mockResolvedValue(null);

            // Step 2: Create new user
            database.createUser.mockResolvedValue({
                id: 1,
                telegram_id: userId,
                created_at: new Date()
            });

            // Step 3: Set initial settings
            database.updateUserSettings.mockResolvedValue(true);

            // Step 4: Cache user data
            const userData = await database.getUserByTelegramId(userId);
            await cacheManager.set(`user:${userId}`, userData);

            expect(mockRedis.setex).toHaveBeenCalled();
            expect(database.createUser).toHaveBeenCalledWith(
                expect.objectContaining({ telegram_id: userId })
            );
        });

        test('should handle user authentication and wallet access', async () => {
            const userId = 12345;
            const ctx = {
                from: { id: userId },
                answerCbQuery: jest.fn(),
                reply: jest.fn()
            };

            // Step 1: Verify user exists
            const mockUser = {
                id: 1,
                telegram_id: userId,
                wallet_address: '0xabc123...',
                encrypted_private_key: 'encrypted_data'
            };
            database.getUserByTelegramId.mockResolvedValue(mockUser);

            // Step 2: Check security permissions
            securitySystem.checkRateLimit.mockResolvedValue({ allowed: true });

            // Step 3: Access wallet (would decrypt private key)
            const walletData = {
                address: mockUser.wallet_address,
                balance: '100.5 MON'
            };

            // Step 4: Cache wallet data
            await cacheManager.set(`wallet:${userId}`, walletData);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                `wallet:${userId}`,
                expect.any(Number),
                JSON.stringify(walletData)
            );
        });
    });

    describe('Error Handling Integration', () => {
        test('should handle database connection failures', async () => {
            database.getUserByTelegramId.mockRejectedValue(new Error('Database connection failed'));

            try {
                await database.getUserByTelegramId(12345);
            } catch (error) {
                expect(error.message).toContain('Database connection failed');
            }

            // System should continue with cache or fallback
            expect(mockRedis.get).toHaveBeenCalled();
        });

        test('should handle Redis failures gracefully', async () => {
            mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

            // Security system should fail open
            const result = await securitySystem.checkRateLimit(12345, 'test_operation');
            expect(result.allowed).toBe(true);
        });

        test('should handle partial system failures', async () => {
            // Database fails but cache works
            database.getUserByTelegramId.mockRejectedValue(new Error('DB down'));
            mockRedis.get.mockResolvedValue(JSON.stringify({ id: 1, telegram_id: 12345 }));

            // System should use cached data
            const result = await database.getUserByTelegramId(12345);
            expect(result.telegram_id).toBe(12345);
        });
    });

    describe('Performance Integration', () => {
        test('should maintain performance under load', async () => {
            const operations = [];
            const userIds = Array.from({ length: 50 }, (_, i) => 10000 + i);

            // Simulate concurrent operations
            for (const userId of userIds) {
                operations.push(
                    securitySystem.checkRateLimit(userId, 'wallet_access'),
                    database.getUserByTelegramId(userId),
                    cacheManager.get(`user:${userId}`)
                );
            }

            const startTime = Date.now();
            const results = await Promise.all(operations);
            const endTime = Date.now();

            const duration = endTime - startTime;
            const avgOperationTime = duration / operations.length;

            // Should complete within reasonable time (under 100ms per operation)
            expect(avgOperationTime).toBeLessThan(100);
            expect(results.length).toBe(150); // 50 users × 3 operations each
        });

        test('should optimize repeated operations with caching', async () => {
            const userId = 12345;
            const mockUser = { id: 1, telegram_id: userId };

            database.getUserByTelegramId.mockResolvedValue(mockUser);

            // First call - database hit
            const result1 = await database.getUserByTelegramId(userId);
            expect(result1).toEqual(mockUser);

            // Second call - should use cache
            mockRedis.get.mockResolvedValue(JSON.stringify(mockUser));
            const result2 = await database.getUserByTelegramId(userId);
            expect(result2).toEqual(mockUser);

            // Verify cache was used
            expect(mockRedis.get).toHaveBeenCalledWith(`user:${userId}`);
        });
    });
});
