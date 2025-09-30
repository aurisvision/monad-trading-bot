/**
 * Handler Manager
 * Manages the gradual migration from old handlers to new enhanced handlers
 * 
 * SAFETY: This system allows safe testing and rollback of new handlers
 * without affecting the existing system
 */

class HandlerManager {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.bot = dependencies.bot;
        this.database = dependencies.database;
        this.monitoring = dependencies.monitoring;
        this.cacheService = dependencies.cacheService;
        
        // Handler instances
        this.handlers = {
            old: {},
            new: {}
        };
        
        // Migration configuration
        this.migrationConfig = {
            enabled: false,
            testUsers: [], // Specific users to test new handlers
            testPercentage: 0, // Percentage of users to use new handlers
            handlers: {
                navigation: { enabled: false, testMode: true },
                wallet: { enabled: false, testMode: true },
                trading: { enabled: false, testMode: true }
            }
        };
        
        // Metrics
        this.metrics = {
            oldHandlerCalls: 0,
            newHandlerCalls: 0,
            errors: 0,
            migrations: 0
        };
        
        this.logInfo('HandlerManager initialized');
    }

    /**
     * Initialize all handlers (old and new)
     */
    async initializeHandlers() {
        try {
            // Initialize old handlers
            await this.initializeOldHandlers();
            
            // Initialize new handlers
            await this.initializeNewHandlers();
            
            // Setup routing
            this.setupHandlerRouting();
            
            this.logInfo('All handlers initialized successfully');
            
        } catch (error) {
            this.logError('Failed to initialize handlers', { error: error.message });
            throw error;
        }
    }

    /**
     * Initialize old handlers (existing system)
     */
    async initializeOldHandlers() {
        try {
            // Import old handlers
            const NavigationHandlers = require('../handlers/navigationHandlers');
            const WalletHandlers = require('../handlers/walletHandlers');
            const TradingInterface = require('../trading/TradingInterface');
            
            // Initialize old handlers
            this.handlers.old.navigation = new NavigationHandlers(this.dependencies);
            this.handlers.old.wallet = new WalletHandlers(this.dependencies);
            this.handlers.old.trading = new TradingInterface(this.dependencies);
            
            // Setup old handlers if they have setup methods
            if (this.handlers.old.navigation.setupHandlers) {
                this.handlers.old.navigation.setupHandlers();
            }
            if (this.handlers.old.wallet.setupHandlers) {
                this.handlers.old.wallet.setupHandlers();
            }
            if (this.handlers.old.trading.setupHandlers) {
                this.handlers.old.trading.setupHandlers();
            }
            
            this.logInfo('Old handlers initialized');
            
        } catch (error) {
            this.logError('Failed to initialize old handlers', { error: error.message });
            // Continue without old handlers if they fail
        }
    }

    /**
     * Initialize new enhanced handlers
     */
    async initializeNewHandlers() {
        try {
            // Import new handlers
            const EnhancedNavigationHandler = require('../handlers/EnhancedNavigationHandler');
            const EnhancedWalletHandler = require('../handlers/EnhancedWalletHandler');
            const EnhancedTradingInterface = require('../trading/EnhancedTradingInterface');
            
            // Initialize new handlers
            this.handlers.new.navigation = new EnhancedNavigationHandler(this.dependencies);
            this.handlers.new.wallet = new EnhancedWalletHandler(this.dependencies);
            this.handlers.new.trading = new EnhancedTradingInterface(this.dependencies);
            
            // Setup new handlers
            this.handlers.new.navigation.setupHandlers();
            this.handlers.new.wallet.setupHandlers();
            this.handlers.new.trading.setupHandlers();
            
            this.logInfo('New enhanced handlers initialized');
            
        } catch (error) {
            this.logError('Failed to initialize new handlers', { error: error.message });
            throw error;
        }
    }

    /**
     * Setup handler routing based on migration configuration
     */
    setupHandlerRouting() {
        // This method sets up the routing logic
        // For now, we'll use the old handlers by default
        // and only route to new handlers when explicitly enabled
        
        this.logInfo('Handler routing setup completed');
    }

    /**
     * Determine which handler to use for a specific user and action
     */
    async getHandlerForUser(userId, handlerType, action) {
        try {
            // Check if migration is enabled
            if (!this.migrationConfig.enabled) {
                this.metrics.oldHandlerCalls++;
                return this.handlers.old[handlerType];
            }

            // Check handler-specific configuration
            const handlerConfig = this.migrationConfig.handlers[handlerType];
            if (!handlerConfig || !handlerConfig.enabled) {
                this.metrics.oldHandlerCalls++;
                return this.handlers.old[handlerType];
            }

            // Check if user is in test users list
            if (this.migrationConfig.testUsers.includes(userId)) {
                this.metrics.newHandlerCalls++;
                return this.handlers.new[handlerType];
            }

            // Check percentage-based testing
            if (this.migrationConfig.testPercentage > 0) {
                const userHash = this.getUserHash(userId);
                const userPercentage = userHash % 100;
                
                if (userPercentage < this.migrationConfig.testPercentage) {
                    this.metrics.newHandlerCalls++;
                    return this.handlers.new[handlerType];
                }
            }

            // Default to old handler
            this.metrics.oldHandlerCalls++;
            return this.handlers.old[handlerType];
            
        } catch (error) {
            this.logError('Failed to determine handler for user', { 
                userId, 
                handlerType, 
                action, 
                error: error.message 
            });
            
            // Fallback to old handler on error
            this.metrics.oldHandlerCalls++;
            return this.handlers.old[handlerType];
        }
    }

    /**
     * Get a consistent hash for user ID (for percentage-based testing)
     */
    getUserHash(userId) {
        let hash = 0;
        const str = userId.toString();
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Enable migration for specific handler type
     */
    async enableHandlerMigration(handlerType, options = {}) {
        try {
            if (!this.handlers.new[handlerType]) {
                throw new Error(`New handler for ${handlerType} not available`);
            }

            this.migrationConfig.enabled = true;
            this.migrationConfig.handlers[handlerType] = {
                enabled: true,
                testMode: options.testMode !== false,
                enabledAt: new Date().toISOString()
            };

            if (options.testUsers) {
                this.migrationConfig.testUsers = [...new Set([
                    ...this.migrationConfig.testUsers,
                    ...options.testUsers
                ])];
            }

            if (options.testPercentage !== undefined) {
                this.migrationConfig.testPercentage = Math.max(0, Math.min(100, options.testPercentage));
            }

            this.metrics.migrations++;
            
            this.logInfo('Handler migration enabled', { 
                handlerType, 
                options,
                config: this.migrationConfig.handlers[handlerType]
            });
            
            return true;
            
        } catch (error) {
            this.logError('Failed to enable handler migration', { 
                handlerType, 
                options, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Disable migration for specific handler type
     */
    async disableHandlerMigration(handlerType) {
        try {
            this.migrationConfig.handlers[handlerType] = {
                enabled: false,
                testMode: false,
                disabledAt: new Date().toISOString()
            };

            // Check if any handlers are still enabled
            const anyEnabled = Object.values(this.migrationConfig.handlers)
                .some(config => config.enabled);
            
            if (!anyEnabled) {
                this.migrationConfig.enabled = false;
                this.migrationConfig.testUsers = [];
                this.migrationConfig.testPercentage = 0;
            }

            this.logInfo('Handler migration disabled', { 
                handlerType,
                globalEnabled: this.migrationConfig.enabled
            });
            
            return true;
            
        } catch (error) {
            this.logError('Failed to disable handler migration', { 
                handlerType, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Emergency rollback - disable all new handlers
     */
    async emergencyRollback(reason = 'Emergency rollback') {
        try {
            this.logWarn('Emergency rollback initiated', { reason });

            // Disable all handler migrations
            Object.keys(this.migrationConfig.handlers).forEach(handlerType => {
                this.migrationConfig.handlers[handlerType] = {
                    enabled: false,
                    testMode: false,
                    rolledBackAt: new Date().toISOString(),
                    rollbackReason: reason
                };
            });

            // Disable global migration
            this.migrationConfig.enabled = false;
            this.migrationConfig.testUsers = [];
            this.migrationConfig.testPercentage = 0;

            this.logInfo('Emergency rollback completed', { reason });
            
            return true;
            
        } catch (error) {
            this.logError('Failed to perform emergency rollback', { 
                reason, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Get migration status and metrics
     */
    getMigrationStatus() {
        return {
            enabled: this.migrationConfig.enabled,
            handlers: { ...this.migrationConfig.handlers },
            testUsers: this.migrationConfig.testUsers.length,
            testPercentage: this.migrationConfig.testPercentage,
            metrics: { ...this.metrics },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Logging helpers
     */
    logInfo(message, data = {}) {
        if (this.monitoring?.logInfo) {
            this.monitoring.logInfo(`[HandlerManager] ${message}`, data);
        } else {
            console.log(`[HandlerManager] ${message}`, data);
        }
    }

    logWarn(message, data = {}) {
        if (this.monitoring?.logWarn) {
            this.monitoring.logWarn(`[HandlerManager] ${message}`, data);
        } else {
            console.warn(`[HandlerManager] ${message}`, data);
        }
    }

    logError(message, data = {}) {
        this.metrics.errors++;
        
        if (this.monitoring?.logError) {
            this.monitoring.logError(`[HandlerManager] ${message}`, data);
        } else {
            console.error(`[HandlerManager] ${message}`, data);
        }
    }
}

module.exports = HandlerManager;