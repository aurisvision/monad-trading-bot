/**
 * Access Code System Integration
 * Safe integration with existing Area51 Bot
 */

const AccessCodeSystem = require('./auth/AccessCodeSystem');
const AdminHandler = require('./handlers/AdminHandler');
const WelcomeHandler = require('./handlers/WelcomeHandler');
const AccessControlMiddleware = require('./middleware/AccessControlMiddleware');

class AccessCodeIntegration {
    constructor(bot, database, cacheService, monitoring) {
        this.bot = bot;
        this.database = database;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        
        // Initialize components
        this.accessCodeSystem = null;
        this.adminHandler = null;
        this.welcomeHandler = null;
        this.accessControl = null;
        
        // Integration status
        this.isInitialized = false;
        this.isEnabled = process.env.ACCESS_CONTROL_ENABLED === 'true';
    }

    /**
     * Initialize the access code system
     */
    async initialize() {
        try {
            console.log('🔐 Initializing Access Code System...');

            // Initialize core system
            this.accessCodeSystem = new AccessCodeSystem(
                this.database,
                this.cacheService,
                this.monitoring
            );

            // Initialize handlers
            this.welcomeHandler = new WelcomeHandler(
                this.bot,
                this.accessCodeSystem,
                this.database,
                this.monitoring
            );

            this.adminHandler = new AdminHandler(
                this.bot,
                this.accessCodeSystem,
                this.database,
                this.monitoring
            );

            // Initialize middleware
            this.accessControl = new AccessControlMiddleware(
                this.accessCodeSystem,
                this.welcomeHandler,
                this.database,
                this.monitoring
            );

            // Perform safety check
            const safetyCheck = await this.accessControl.performSafetyCheck();
            
            if (!safetyCheck.success) {
                console.warn('⚠️ Access Code System safety check failed:', safetyCheck);
                console.warn('🚨 Access control will be disabled for safety');
                this.isEnabled = false;
            }

            // Apply middleware if enabled
            if (this.isEnabled) {
                this.applyMiddleware();
                console.log('✅ Access Code System enabled and active');
            } else {
                console.log('ℹ️ Access Code System initialized but disabled');
            }

            this.isInitialized = true;
            
            // Log initialization
            this.monitoring?.logInfo('Access Code System initialized', {
                enabled: this.isEnabled,
                safetyCheck: safetyCheck.success,
                adminId: this.accessCodeSystem.adminUserId
            });

            return {
                success: true,
                enabled: this.isEnabled,
                safetyCheck
            };

        } catch (error) {
            console.error('❌ Failed to initialize Access Code System:', error);
            this.monitoring?.logError('Access Code System initialization failed', error);
            
            // Ensure system is disabled on error
            this.isEnabled = false;
            
            return {
                success: false,
                error: error.message,
                enabled: false
            };
        }
    }

    /**
     * Apply middleware to bot
     */
    applyMiddleware() {
        console.log('🔧 Applying Access Control Middleware...');

        // Apply to all messages (before existing handlers)
        this.bot.use(async (ctx, next) => {
            if (ctx.message && this.isEnabled) {
                return await this.accessControl.checkAccess(ctx, next);
            }
            return next();
        });

        // Apply to callback queries (before existing handlers)
        this.bot.use(async (ctx, next) => {
            if (ctx.callbackQuery && this.isEnabled) {
                return await this.accessControl.checkCallbackAccess(ctx, next);
            }
            return next();
        });

        console.log('✅ Access Control Middleware applied');
    }

    /**
     * Enable access control (admin only)
     */
    async enable() {
        try {
            if (!this.isInitialized) {
                throw new Error('Access Code System not initialized');
            }

            // Perform safety check before enabling
            const safetyCheck = await this.accessControl.performSafetyCheck();
            if (!safetyCheck.success) {
                throw new Error(`Safety check failed: ${safetyCheck.recommendation}`);
            }

            this.isEnabled = true;
            this.accessControl.enableAccessControl();
            
            console.log('✅ Access Control enabled');
            this.monitoring?.logInfo('Access Control enabled by admin');
            
            return { success: true, message: 'Access control enabled successfully' };

        } catch (error) {
            console.error('❌ Failed to enable access control:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Disable access control (admin only)
     */
    async disable() {
        try {
            this.isEnabled = false;
            if (this.accessControl) {
                this.accessControl.disableAccessControl();
            }
            
            console.log('⚠️ Access Control disabled');
            this.monitoring?.logInfo('Access Control disabled by admin');
            
            return { success: true, message: 'Access control disabled successfully' };

        } catch (error) {
            console.error('❌ Failed to disable access control:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Emergency disable (for critical issues)
     */
    emergencyDisable() {
        console.warn('🚨 EMERGENCY: Disabling Access Control');
        
        this.isEnabled = false;
        if (this.accessControl) {
            this.accessControl.emergencyDisable();
        }
        
        this.monitoring?.logWarn('Emergency access control disable activated');
        
        return { success: true, message: 'Emergency disable activated' };
    }

    /**
     * Get system status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            enabled: this.isEnabled,
            adminId: this.accessCodeSystem?.adminUserId,
            components: {
                accessCodeSystem: !!this.accessCodeSystem,
                adminHandler: !!this.adminHandler,
                welcomeHandler: !!this.welcomeHandler,
                accessControl: !!this.accessControl
            }
        };
    }

    /**
     * Generate admin status report
     */
    async getAdminReport() {
        try {
            if (!this.accessCodeSystem) {
                return { error: 'Access Code System not initialized' };
            }

            const stats = await this.accessCodeSystem.getCodeStats();
            const status = this.getStatus();
            const safetyCheck = await this.accessControl.performSafetyCheck();

            return {
                status,
                stats,
                safetyCheck,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Test the system (admin only)
     */
    async runSystemTest() {
        try {
            console.log('🧪 Running Access Code System test...');

            const tests = {
                initialization: this.isInitialized,
                components: {
                    accessCodeSystem: !!this.accessCodeSystem,
                    adminHandler: !!this.adminHandler,
                    welcomeHandler: !!this.welcomeHandler,
                    accessControl: !!this.accessControl
                },
                database: false,
                adminAccess: false,
                codeGeneration: false
            };

            // Test database connection
            try {
                await this.database.query('SELECT 1');
                tests.database = true;
            } catch (dbError) {
                console.error('Database test failed:', dbError.message);
            }

            // Test admin access
            if (this.accessCodeSystem) {
                tests.adminAccess = this.accessCodeSystem.isAdmin(6920475855);
            }

            // Test code generation
            if (this.accessCodeSystem) {
                try {
                    const testCode = await this.accessCodeSystem.generateCode('test', 1, 1, 'System test code');
                    tests.codeGeneration = testCode.success;
                    
                    // Clean up test code
                    if (testCode.success) {
                        await this.accessCodeSystem.disableCode(testCode.code);
                    }
                } catch (codeError) {
                    console.error('Code generation test failed:', codeError.message);
                }
            }

            const allTestsPass = Object.values(tests).every(test => 
                typeof test === 'boolean' ? test : Object.values(test).every(subTest => subTest)
            );

            console.log('🧪 System test completed:', allTestsPass ? '✅ PASS' : '❌ FAIL');
            
            return {
                success: allTestsPass,
                tests,
                recommendation: allTestsPass ? 
                    'System is ready for production' : 
                    'Fix failing tests before enabling'
            };

        } catch (error) {
            console.error('❌ System test failed:', error);
            return {
                success: false,
                error: error.message,
                recommendation: 'Emergency disable recommended'
            };
        }
    }
}

module.exports = AccessCodeIntegration;
