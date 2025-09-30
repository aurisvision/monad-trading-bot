/**
 * Migration Configuration
 * Controls the gradual rollout of new enhanced handlers
 * 
 * SAFETY: This configuration ensures safe migration with rollback capabilities
 */

class MigrationConfig {
    constructor() {
        this.config = {
            // Global migration settings
            enabled: false, // Master switch for migration
            testMode: true, // Start in test mode
            rollbackOnError: true, // Auto-rollback on errors
            maxErrorRate: 0.05, // 5% max error rate before rollback
            
            // Migration phases
            phases: {
                phase1: {
                    name: 'Test Users Only',
                    enabled: false,
                    testUsers: ['test_user_123', 'admin_user_456'],
                    percentage: 0,
                    handlers: ['navigation', 'wallet', 'trading']
                },
                phase2: {
                    name: 'Limited Rollout',
                    enabled: false,
                    testUsers: [],
                    percentage: 5, // 5% of users
                    handlers: ['navigation', 'wallet', 'trading']
                },
                phase3: {
                    name: 'Gradual Expansion',
                    enabled: false,
                    testUsers: [],
                    percentage: 25, // 25% of users
                    handlers: ['navigation', 'wallet', 'trading']
                },
                phase4: {
                    name: 'Majority Rollout',
                    enabled: false,
                    testUsers: [],
                    percentage: 75, // 75% of users
                    handlers: ['navigation', 'wallet', 'trading']
                },
                phase5: {
                    name: 'Full Migration',
                    enabled: false,
                    testUsers: [],
                    percentage: 100, // All users
                    handlers: ['navigation', 'wallet', 'trading']
                }
            },
            
            // Handler-specific settings
            handlers: {
                navigation: {
                    enabled: false,
                    priority: 'high',
                    fallbackEnabled: true,
                    maxResponseTime: 3000,
                    actions: ['start', 'back_to_main', 'token_categories', 'refresh', 'transfer']
                },
                wallet: {
                    enabled: false,
                    priority: 'high',
                    fallbackEnabled: true,
                    maxResponseTime: 5000,
                    actions: ['wallet', 'generate_wallet', 'import_wallet', 'export_private_key', 'delete_wallet']
                },
                trading: {
                    enabled: false,
                    priority: 'critical',
                    fallbackEnabled: true,
                    maxResponseTime: 5000,
                    actions: ['buy', 'sell', 'portfolio', 'cancel']
                }
            },
            
            // Performance monitoring
            monitoring: {
                enabled: true,
                logLevel: 'info',
                metricsInterval: 60000, // 1 minute
                alertThresholds: {
                    errorRate: 0.05, // 5%
                    responseTime: 5000, // 5 seconds
                    memoryUsage: 500 * 1024 * 1024 // 500MB
                }
            },
            
            // Rollback settings
            rollback: {
                enabled: true,
                autoTrigger: true,
                conditions: {
                    errorRate: 0.1, // 10% error rate
                    responseTime: 10000, // 10 seconds
                    consecutiveErrors: 5
                },
                cooldownPeriod: 300000 // 5 minutes before retry
            }
        };
    }

    /**
     * Get current migration configuration
     */
    getConfig() {
        return this.config;
    }

    /**
     * Update migration configuration
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        return this.config;
    }

    /**
     * Enable migration for specific phase
     */
    enablePhase(phaseName) {
        if (this.config.phases[phaseName]) {
            this.config.phases[phaseName].enabled = true;
            this.config.enabled = true;
            return true;
        }
        return false;
    }

    /**
     * Disable migration for specific phase
     */
    disablePhase(phaseName) {
        if (this.config.phases[phaseName]) {
            this.config.phases[phaseName].enabled = false;
            return true;
        }
        return false;
    }

    /**
     * Enable handler migration
     */
    enableHandler(handlerName) {
        if (this.config.handlers[handlerName]) {
            this.config.handlers[handlerName].enabled = true;
            return true;
        }
        return false;
    }

    /**
     * Disable handler migration
     */
    disableHandler(handlerName) {
        if (this.config.handlers[handlerName]) {
            this.config.handlers[handlerName].enabled = false;
            return true;
        }
        return false;
    }

    /**
     * Get current active phase
     */
    getCurrentPhase() {
        for (const [phaseName, phase] of Object.entries(this.config.phases)) {
            if (phase.enabled) {
                return { name: phaseName, ...phase };
            }
        }
        return null;
    }

    /**
     * Check if user should use new handlers
     */
    shouldUseNewHandler(userId, handlerType) {
        // Check if migration is enabled
        if (!this.config.enabled) {
            return false;
        }

        // Check if handler is enabled
        if (!this.config.handlers[handlerType]?.enabled) {
            return false;
        }

        // Get current phase
        const currentPhase = this.getCurrentPhase();
        if (!currentPhase) {
            return false;
        }

        // Check if handler is included in current phase
        if (!currentPhase.handlers.includes(handlerType)) {
            return false;
        }

        // Check if user is in test users list
        if (currentPhase.testUsers.includes(userId)) {
            return true;
        }

        // Check percentage-based rollout
        if (currentPhase.percentage > 0) {
            const userHash = this.hashUserId(userId);
            const userPercentile = userHash % 100;
            return userPercentile < currentPhase.percentage;
        }

        return false;
    }

    /**
     * Hash user ID for consistent percentage-based rollout
     */
    hashUserId(userId) {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            const char = userId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Get migration statistics
     */
    getStats() {
        const currentPhase = this.getCurrentPhase();
        const enabledHandlers = Object.entries(this.config.handlers)
            .filter(([_, handler]) => handler.enabled)
            .map(([name, _]) => name);

        return {
            enabled: this.config.enabled,
            testMode: this.config.testMode,
            currentPhase: currentPhase?.name || 'none',
            enabledHandlers: enabledHandlers,
            rollbackEnabled: this.config.rollback.enabled,
            monitoringEnabled: this.config.monitoring.enabled
        };
    }

    /**
     * Export configuration for backup
     */
    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration from backup
     */
    importConfig(configJson) {
        try {
            const importedConfig = JSON.parse(configJson);
            this.config = { ...this.config, ...importedConfig };
            return true;
        } catch (error) {
            console.error('Failed to import configuration:', error);
            return false;
        }
    }

    /**
     * Reset to safe defaults
     */
    resetToDefaults() {
        this.config.enabled = false;
        this.config.testMode = true;
        
        // Disable all phases
        Object.keys(this.config.phases).forEach(phase => {
            this.config.phases[phase].enabled = false;
        });
        
        // Disable all handlers
        Object.keys(this.config.handlers).forEach(handler => {
            this.config.handlers[handler].enabled = false;
        });
        
        return this.config;
    }
}

module.exports = MigrationConfig;