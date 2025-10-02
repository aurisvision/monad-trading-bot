#!/usr/bin/env node

/**
 * Quick Test Script for Group Functionality
 * Usage: node quick-test.js [test-name]
 */

const GroupHandlers = require('./src/handlers/groupHandlers');

// Quick mock setup
const mockSetup = {
    database: {
        getUserSettings: async () => ({ turboMode: false, buySlippage: 5 }),
        getUserState: async () => null,
        getUserByTelegramId: async () => ({ id: 1, wallet_address: '0xtest' })
    },
    monorailAPI: {
        getTokenInfo: async (address) => ({
            success: true,
            token: { symbol: 'TEST', name: 'Test Token', address, price: 1.0 }
        }),
        searchTokens: async (query) => ({
            success: true,
            tokens: [{ symbol: query, name: `${query} Token`, address: '0xtest', price: 1.0 }]
        })
    },
    monitoring: { logInfo: () => {}, logError: () => {} },
    tradingEngine: { executeTrade: async () => ({ success: true, txHash: '0xtest' }) },
    walletManager: { getWallet: async () => ({ address: '0xtest', balance: '1000' }) },
    cacheService: { invalidateUserCache: async () => {} }
};

const tests = {
    contract: {
        name: 'Contract Address Recognition',
        message: '0x1234567890123456789012345678901234567890',
        expected: 'Should recognize and display token info'
    },
    symbol: {
        name: 'Token Symbol Recognition', 
        message: 'Check out USDC token',
        expected: 'Should find and display USDC info'
    },
    buy: {
        name: 'Buy Command',
        message: '@area51bot buy USDC 100',
        expected: 'Should process buy command'
    },
    help: {
        name: 'Help Command',
        message: '@area51bot help',
        expected: 'Should show help message'
    },
    ignore: {
        name: 'Normal Message (Should Ignore)',
        message: 'Hello everyone!',
        expected: 'Should ignore normal messages'
    }
};

async function runQuickTest(testName = 'all') {
    console.log('🚀 Quick Group Functionality Test\n');
    
    const groupHandlers = new GroupHandlers(mockSetup);
    
    const createMockCtx = (message, isGroup = true) => ({
        chat: { type: isGroup ? 'group' : 'private', id: -123 },
        from: { id: 123, username: 'testuser' },
        message: { text: message },
        reply: async (text) => {
            console.log('📤 Response:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
            return true;
        },
        deleteMessage: async () => console.log('🗑️ Message deleted')
    });
    
    if (testName === 'all') {
        console.log('Running all tests...\n');
        for (const [key, test] of Object.entries(tests)) {
            console.log(`🧪 ${test.name}`);
            console.log(`📝 Input: "${test.message}"`);
            console.log(`🎯 Expected: ${test.expected}`);
            
            try {
                const result = await groupHandlers.handleGroupMessage(
                    createMockCtx(test.message), 
                    'area51bot'
                );
                console.log(`✅ Result: ${result ? 'Handled' : 'Ignored'}`);
            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
            }
            console.log('-'.repeat(50));
        }
    } else if (tests[testName]) {
        const test = tests[testName];
        console.log(`🧪 Testing: ${test.name}`);
        console.log(`📝 Input: "${test.message}"`);
        console.log(`🎯 Expected: ${test.expected}\n`);
        
        try {
            const result = await groupHandlers.handleGroupMessage(
                createMockCtx(test.message), 
                'area51bot'
            );
            console.log(`✅ Result: ${result ? 'Handled successfully' : 'Ignored as expected'}`);
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    } else {
        console.log('❌ Unknown test name. Available tests:');
        Object.keys(tests).forEach(key => {
            console.log(`   • ${key}: ${tests[key].name}`);
        });
        console.log('\nUsage: node quick-test.js [test-name]');
        console.log('       node quick-test.js all');
    }
}

// Run the test
const testName = process.argv[2] || 'all';
runQuickTest(testName).catch(console.error);