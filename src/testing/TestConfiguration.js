/**
 * TestConfiguration - Configuration for comprehensive handler testing
 * Defines test scenarios, mock data, and validation criteria
 */

class TestConfiguration {
    constructor() {
        this.testUsers = this.createTestUsers();
        this.mockData = this.createMockData();
        this.testScenarios = this.createTestScenarios();
        this.validationRules = this.createValidationRules();
    }

    /**
     * Create test users with different profiles
     */
    createTestUsers() {
        return {
            newUser: {
                telegramId: 'test_new_123',
                username: 'test_new_user',
                hasWallet: false,
                isActive: false,
                settings: null
            },
            existingUser: {
                telegramId: 'test_existing_456',
                username: 'test_existing_user',
                hasWallet: true,
                isActive: true,
                settings: {
                    language: 'en',
                    notifications: true,
                    autoRefresh: false
                }
            },
            premiumUser: {
                telegramId: 'test_premium_789',
                username: 'test_premium_user',
                hasWallet: true,
                isActive: true,
                isPremium: true,
                settings: {
                    language: 'en',
                    notifications: true,
                    autoRefresh: true,
                    turboMode: true
                }
            }
        };
    }

    /**
     * Create mock data for testing
     */
    createMockData() {
        return {
            tokens: [
                {
                    address: '0x1234567890abcdef',
                    symbol: 'TEST1',
                    name: 'Test Token 1',
                    price: 1.50,
                    change24h: 5.2,
                    category: 'defi'
                },
                {
                    address: '0xabcdef1234567890',
                    symbol: 'TEST2',
                    name: 'Test Token 2',
                    price: 0.75,
                    change24h: -2.1,
                    category: 'gaming'
                }
            ],
            wallets: [
                {
                    address: '0xtest1234567890abcdef',
                    privateKey: 'test_private_key_encrypted',
                    balance: '1.5',
                    tokens: [
                        { symbol: 'TEST1', balance: '100.0', value: '150.0' },
                        { symbol: 'TEST2', balance: '200.0', value: '150.0' }
                    ]
                }
            ],
            transactions: [
                {
                    hash: '0xtesthash123',
                    type: 'buy',
                    token: 'TEST1',
                    amount: '50.0',
                    price: '1.45',
                    status: 'completed',
                    timestamp: Date.now() - 3600000
                }
            ]
        };
    }

    /**
     * Create test scenarios for different handler actions
     */
    createTestScenarios() {
        return {
            navigation: {
                start: [
                    { user: 'newUser', expectedResult: 'welcome_message' },
                    { user: 'existingUser', expectedResult: 'main_menu' },
                    { user: 'premiumUser', expectedResult: 'premium_main_menu' }
                ],
                back_to_main: [
                    { user: 'existingUser', expectedResult: 'main_menu' }
                ],
                token_categories: [
                    { user: 'existingUser', expectedResult: 'categories_list' }
                ],
                refresh: [
                    { user: 'existingUser', expectedResult: 'refreshed_data' }
                ]
            },
            wallet: {
                wallet: [
                    { user: 'newUser', expectedResult: 'no_wallet_message' },
                    { user: 'existingUser', expectedResult: 'wallet_info' }
                ],
                generate_wallet: [
                    { user: 'newUser', expectedResult: 'wallet_generated' },
                    { user: 'existingUser', expectedResult: 'wallet_exists_error' }
                ],
                import_wallet: [
                    { user: 'newUser', expectedResult: 'import_prompt' }
                ],
                export_private_key: [
                    { user: 'existingUser', expectedResult: 'security_prompt' },
                    { user: 'newUser', expectedResult: 'no_wallet_error' }
                ]
            },
            trading: {
                buy: [
                    { user: 'existingUser', expectedResult: 'buy_interface' },
                    { user: 'newUser', expectedResult: 'no_wallet_error' }
                ],
                portfolio: [
                    { user: 'existingUser', expectedResult: 'portfolio_data' },
                    { user: 'newUser', expectedResult: 'no_wallet_error' }
                ],
                sell: [
                    { user: 'existingUser', expectedResult: 'sell_interface' },
                    { user: 'newUser', expectedResult: 'no_wallet_error' }
                ]
            }
        };
    }

    /**
     * Create validation rules for test results
     */
    createValidationRules() {
        return {
            response: {
                required_fields: ['success', 'message'],
                optional_fields: ['data', 'keyboard', 'error'],
                message_max_length: 4096,
                keyboard_max_buttons: 100
            },
            performance: {
                max_response_time: 5000, // 5 seconds
                max_memory_usage: 100 * 1024 * 1024, // 100MB
                max_database_queries: 10
            },
            security: {
                no_sensitive_data_in_logs: true,
                require_user_validation: true,
                rate_limit_compliance: true
            }
        };
    }

    /**
     * Get test user by type
     */
    getTestUser(userType) {
        return this.testUsers[userType] || this.testUsers.existingUser;
    }

    /**
     * Get mock data by type
     */
    getMockData(dataType) {
        return this.mockData[dataType] || [];
    }

    /**
     * Get test scenarios for handler
     */
    getTestScenarios(handlerType) {
        return this.testScenarios[handlerType] || {};
    }

    /**
     * Get validation rules
     */
    getValidationRules() {
        return this.validationRules;
    }

    /**
     * Create mock context for testing
     */
    createMockContext(userId, action, data = {}) {
        return {
            from: {
                id: userId,
                username: `user_${userId}`,
                first_name: 'Test',
                last_name: 'User'
            },
            chat: {
                id: userId,
                type: 'private'
            },
            message: {
                message_id: Math.floor(Math.random() * 1000),
                text: action,
                date: Math.floor(Date.now() / 1000)
            },
            callbackQuery: {
                id: `callback_${Date.now()}`,
                data: action,
                message: {
                    message_id: Math.floor(Math.random() * 1000),
                    chat: { id: userId }
                }
            },
            match: data.match || null,
            session: data.session || {},
            reply: jest.fn(),
            editMessageText: jest.fn(),
            answerCbQuery: jest.fn(),
            deleteMessage: jest.fn()
        };
    }

    /**
     * Create mock dependencies for handlers
     */
    createMockDependencies() {
        return {
            bot: {
                telegram: {
                    sendMessage: jest.fn(),
                    editMessageText: jest.fn(),
                    deleteMessage: jest.fn()
                }
            },
            database: {
                getUser: jest.fn(),
                getUserSettings: jest.fn(),
                setUserState: jest.fn(),
                getUserState: jest.fn(),
                clearUserState: jest.fn(),
                updateUserSettings: jest.fn(),
                trackUserActivity: jest.fn()
            },
            userService: {
                getUser: jest.fn(),
                getUserSettings: jest.fn(),
                setUserState: jest.fn(),
                getUserState: jest.fn(),
                clearUserState: jest.fn(),
                updateUserSettings: jest.fn(),
                trackActivity: jest.fn()
            },
            monitoring: {
                logError: jest.fn(),
                logInfo: jest.fn(),
                logWarn: jest.fn(),
                recordMetric: jest.fn()
            },
            cacheService: {
                get: jest.fn(),
                set: jest.fn(),
                del: jest.fn(),
                clear: jest.fn()
            },
            walletManager: {
                getWallet: jest.fn(),
                generateWallet: jest.fn(),
                importWallet: jest.fn(),
                exportPrivateKey: jest.fn(),
                deleteWallet: jest.fn()
            },
            monorailAPI: {
                getTokens: jest.fn(),
                getTokenPrice: jest.fn(),
                getWalletBalance: jest.fn()
            },
            redis: {
                get: jest.fn(),
                set: jest.fn(),
                del: jest.fn(),
                exists: jest.fn()
            }
        };
    }
}

module.exports = TestConfiguration;