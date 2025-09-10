const { expect } = require('chai');
const Database = require('../src/database');
const WalletManager = require('../src/wallet');
const MonorailAPI = require('../src/monorail');
const TradingEngine = require('../src/trading');
const PortfolioManager = require('../src/portfolio');

describe('Area51 Bot Tests', function() {
    this.timeout(10000);
    
    let db, walletManager, monorailAPI, tradingEngine, portfolioManager;
    
    before(async function() {
        // Initialize test environment
        process.env.ENCRYPTION_KEY = 'test_key_32_characters_long_123';
        process.env.DATABASE_PATH = './test_data/test.db';
        
        db = new Database();
        await db.init();
        
        walletManager = new WalletManager();
        monorailAPI = new MonorailAPI();
        tradingEngine = new TradingEngine(monorailAPI, walletManager, db);
        portfolioManager = new PortfolioManager(monorailAPI, db);
    });

    describe('Database Tests', function() {
        it('should create a new user', async function() {
            const result = await db.createUser(12345, '0x1234567890123456789012345678901234567890', 'encrypted_key', 'test mnemonic');
            expect(result.id).to.be.a('number');
        });

        it('should retrieve user by telegram ID', async function() {
            const user = await db.getUser(12345);
            expect(user).to.not.be.null;
            expect(user.telegram_id).to.equal(12345);
        });

        it('should create user settings', async function() {
            const settings = await db.getUserSettings(12345);
            expect(settings).to.not.be.null;
            expect(settings.buy_slippage).to.equal(5.0);
        });
    });

    describe('Wallet Manager Tests', function() {
        it('should generate a new wallet', async function() {
            const wallet = await walletManager.generateWallet();
            expect(wallet.address).to.match(/^0x[a-fA-F0-9]{40}$/);
            expect(wallet.privateKey).to.match(/^0x[a-fA-F0-9]{64}$/);
            expect(wallet.mnemonic.split(' ')).to.have.length(12);
        });

        it('should validate Ethereum addresses', function() {
            expect(walletManager.isValidAddress('0x1234567890123456789012345678901234567890')).to.be.true;
            expect(walletManager.isValidAddress('invalid_address')).to.be.false;
        });

        it('should encrypt and decrypt private keys', function() {
            const testKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
            const encrypted = walletManager.encrypt(testKey);
            const decrypted = walletManager.decrypt(encrypted);
            expect(decrypted).to.equal(testKey);
        });
    });

    describe('Monorail API Tests', function() {
        it('should validate token addresses', function() {
            expect(monorailAPI.isValidTokenAddress('0x1234567890123456789012345678901234567890')).to.be.true;
            expect(monorailAPI.isValidTokenAddress('invalid')).to.be.false;
        });

        it('should format token amounts', function() {
            const formatted = monorailAPI.formatTokenAmount('1000000000000000000', 18);
            expect(formatted).to.equal('1.000000');
        });

        it('should calculate slippage amounts', function() {
            const slippageAmount = monorailAPI.calculateSlippageAmount('100', 5);
            expect(parseFloat(slippageAmount)).to.equal(95);
        });
    });

    describe('Trading Engine Tests', function() {
        it('should validate trading parameters', function() {
            const validation = tradingEngine.validateTradingParams('10', 5);
            expect(validation.isValid).to.be.true;
            expect(validation.errors).to.have.length(0);
        });

        it('should reject invalid trading parameters', function() {
            const validation = tradingEngine.validateTradingParams('-10', 100);
            expect(validation.isValid).to.be.false;
            expect(validation.errors.length).to.be.greaterThan(0);
        });
    });

    describe('Portfolio Manager Tests', function() {
        it('should calculate portfolio diversity', async function() {
            // Mock wallet address for testing
            const mockWalletAddress = '0x1234567890123456789012345678901234567890';
            
            const diversity = await portfolioManager.getPortfolioDiversity(mockWalletAddress);
            expect(diversity).to.have.property('score');
            expect(diversity).to.have.property('rating');
        });
    });

    after(async function() {
        // Cleanup test database
        if (db) {
            db.close();
        }
    });
});

// Mock test for API endpoints (requires actual API to be available)
describe('API Integration Tests', function() {
    this.timeout(30000);
    
    it('should connect to Monorail API (if available)', async function() {
        const monorailAPI = new MonorailAPI();
        
        try {
            // Test with MON to USDC quote
            const quote = await monorailAPI.getQuote(
                '0x0000000000000000000000000000000000000000', // MON
                '0xf817257fed379853cde0fa4f97ab987181b1e5ea', // USDC
                '1'
            );
            
            if (quote.success) {
                expect(quote.outputAmount).to.be.a('string');
                console.log('API Test Success: Got quote for 1 MON =', quote.outputAmount, 'USDC');
            } else {
                console.log('API Test Info: API not available or returned error:', quote.error);
            }
        } catch (error) {
            console.log('API Test Info: API connection failed (expected in test environment)');
        }
    });
});
