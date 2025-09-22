/**
 * 🔐 Unified Security System - Unit Tests
 * Comprehensive test suite for security functionality
 */

const UnifiedSecuritySystem = require('../src/security/UnifiedSecuritySystem');

describe('UnifiedSecuritySystem', () => {
    let security;
    let mockRedis;
    let mockDatabase;

    beforeEach(() => {
        // Mock Redis for testing
        mockRedis = {
            get: jest.fn(),
            setex: jest.fn(),
            set: jest.fn(),
            keys: jest.fn().mockResolvedValue([]),
            ping: jest.fn().mockResolvedValue('PONG')
        };

        // Mock Database for testing
        mockDatabase = {
            getUserByTelegramId: jest.fn(),
            getUserTransactionCount: jest.fn()
        };

        security = new UnifiedSecuritySystem(mockRedis, mockDatabase);
    });

    describe('Encryption/Decryption', () => {
        test('should encrypt and decrypt data correctly', () => {
            const testData = 'sensitive information';
            const userId = 12345;

            const encrypted = security.encrypt(testData, userId);
            const decrypted = security.decrypt(encrypted, userId);

            expect(encrypted).not.toBe(testData);
            expect(encrypted).toContain('v3:'); // Version prefix
            expect(decrypted).toBe(testData);
        });

        test('should handle different data types', () => {
            const testCases = [
                'string data',
                { key: 'value' },
                [1, 2, 3],
                null,
                undefined
            ];

            testCases.forEach(testData => {
                if (testData !== null && testData !== undefined) {
                    const encrypted = security.encrypt(testData, 12345);
                    const decrypted = security.decrypt(encrypted, 12345);
                    expect(decrypted).toEqual(testData);
                }
            });
        });

        test('should use different encryption for different users', () => {
            const testData = 'same data';
            const encrypted1 = security.encrypt(testData, 111);
            const encrypted2 = security.encrypt(testData, 222);

            expect(encrypted1).not.toBe(encrypted2);
        });
    });

    describe('Rate Limiting', () => {
        beforeEach(() => {
            mockRedis.get.mockResolvedValue('0'); // No previous attempts
            mockRedis.setex.mockResolvedValue('OK');
        });

        test('should allow operation within limits', async () => {
            mockRedis.get.mockResolvedValue('5'); // 5 attempts used

            const result = await security.checkRateLimit(12345, 'private_key_access');

            expect(result.allowed).toBe(true);
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'security:rate_limit:private_key_access:12345',
                3600,
                '6'
            );
        });

        test('should block operation exceeding limits', async () => {
            mockRedis.get.mockResolvedValue('10'); // At limit

            const result = await security.checkRateLimit(12345, 'private_key_access');

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Rate limit exceeded');
        });

        test('should handle Redis errors gracefully', async () => {
            mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

            const result = await security.checkRateLimit(12345, 'private_key_access');

            expect(result.allowed).toBe(true); // Fail open for availability
        });
    });

    describe('User Trust Levels', () => {
        test('should classify new users correctly', async () => {
            mockDatabase.getUserByTelegramId.mockResolvedValue({
                id: 111,
                created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
            });
            mockDatabase.getUserTransactionCount.mockResolvedValue(3); // Low activity

            const trustLevel = await security.getUserTrustLevel(111);

            expect(trustLevel).toBe('new');
        });

        test('should classify VIP users correctly', async () => {
            mockDatabase.getUserByTelegramId.mockResolvedValue({
                id: 222,
                created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days old
            });
            mockDatabase.getUserTransactionCount.mockResolvedValue(200); // High activity

            const trustLevel = await security.getUserTrustLevel(222);

            expect(trustLevel).toBe('vip');
        });

        test('should handle database errors', async () => {
            mockDatabase.getUserByTelegramId.mockRejectedValue(new Error('DB error'));

            const trustLevel = await security.getUserTrustLevel(333);

            expect(trustLevel).toBe('regular'); // Default fallback
        });
    });

    describe('Sensitive Data Sanitization', () => {
        test('should sanitize private keys', () => {
            const input = 'Error: private key 0x1234567890abcdef1234567890abcdef1234567890abcdef';
            const sanitized = security.sanitize(input);

            expect(sanitized).toContain('[PRIVATE_KEY_REDACTED]');
            expect(sanitized).not.toContain('0x1234567890abcdef');
        });

        test('should sanitize mnemonic phrases', () => {
            const input = 'Recovery phrase: abandon abandon abandon abandon abandon abandon';
            const sanitized = security.sanitize(input);

            expect(sanitized).toContain('[MNEMONIC_PHRASE_REDACTED]');
            expect(sanitized).not.toContain('abandon abandon');
        });

        test('should sanitize sensitive object keys', () => {
            const input = {
                privateKey: '0x123...',
                password: 'secret123',
                normalData: 'visible'
            };
            const sanitized = security.sanitize(input);

            expect(sanitized.privateKey).toBe('[REDACTED]');
            expect(sanitized.password).toBe('[REDACTED]');
            expect(sanitized.normalData).toBe('visible');
        });
    });
});
