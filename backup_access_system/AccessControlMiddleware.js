/**
 * Access Control Middleware
 * Safely integrates access code system with existing bot without breaking functionality
 */

class AccessControlMiddleware {
    constructor(accessCodeSystem, welcomeHandler, database, monitoring) {
        this.accessCodeSystem = accessCodeSystem;
        this.welcomeHandler = welcomeHandler;
        this.database = database;
        this.monitoring = monitoring;
        
        // Feature flag to enable/disable access control
        this.accessControlEnabled = process.env.ACCESS_CONTROL_ENABLED === 'true';
        
        // Bypass access control for these commands (safety measure)
        this.bypassCommands = new Set([
            'start',
            'help',
            'admin',
            'status'
        ]);
    }

    /**
     * Main middleware function to check access before processing commands
     */
    async checkAccess(ctx, next) {
        try {
            const userId = ctx.from.id;
            
            // Safety: If access control is disabled, allow all users
            if (!this.accessControlEnabled) {
                this.monitoring?.logInfo('Access control disabled - allowing all users', { userId });
                return next();
            }

            // Admin always has access
            if (this.accessCodeSystem.isAdmin(userId)) {
                return next();
            }

            // Check if this is a bypass command
            const command = this.extractCommand(ctx);
            if (this.bypassCommands.has(command)) {
                // For /start command, show welcome screen if no access
                if (command === 'start') {
                    const hasAccess = await this.welcomeHandler.checkUserAccess(userId);
                    if (!hasAccess) {
                        await this.welcomeHandler.showWelcomeScreen(ctx);
                        return; // Don't continue to next()
                    }
                }
                return next();
            }

            // Check user access
            const accessResult = await this.accessCodeSystem.checkUserAccess(userId);
            
            if (accessResult.hasAccess) {
                // User has access, continue to next handler
                this.monitoring?.logInfo('User access verified', {
                    userId,
                    accessType: accessResult.accessType,
                    source: accessResult.source
                });
                return next();
            } else {
                // User doesn't have access, show access required message
                await this.welcomeHandler.showNoAccessMessage(ctx);
                
                this.monitoring?.logInfo('Access denied - no valid access code', {
                    userId,
                    username: ctx.from.username,
                    command
                });
                
                return; // Don't continue to next()
            }

        } catch (error) {
            this.monitoring?.logError('Access control middleware failed', error, {
                userId: ctx.from.id,
                command: this.extractCommand(ctx)
            });
            
            // Safety: On error, allow access to prevent bot breaking
            console.warn('Access control error - allowing access for safety:', error.message);
            return next();
        }
    }

    /**
     * Extract command from context
     */
    extractCommand(ctx) {
        if (ctx.message && ctx.message.text) {
            const text = ctx.message.text;
            if (text.startsWith('/')) {
                return text.split(' ')[0].substring(1).toLowerCase();
            }
        }
        return null;
    }

    /**
     * Middleware for callback queries (button presses)
     */
    async checkCallbackAccess(ctx, next) {
        try {
            const userId = ctx.from.id;
            
            // Safety: If access control is disabled, allow all users
            if (!this.accessControlEnabled) {
                return next();
            }

            // Admin always has access
            if (this.accessCodeSystem.isAdmin(userId)) {
                return next();
            }

            // Allow access-related callbacks
            const callbackData = ctx.callbackQuery.data;
            if (this.isAccessRelatedCallback(callbackData)) {
                return next();
            }

            // Check user access for other callbacks
            const accessResult = await this.accessCodeSystem.checkUserAccess(userId);
            
            if (accessResult.hasAccess) {
                return next();
            } else {
                await ctx.answerCbQuery('🔐 Access code required to use this feature');
                await this.welcomeHandler.showNoAccessMessage(ctx);
                return;
            }

        } catch (error) {
            this.monitoring?.logError('Callback access control failed', error, {
                userId: ctx.from.id,
                callbackData: ctx.callbackQuery?.data
            });
            
            // Safety: On error, allow access
            return next();
        }
    }

    /**
     * Check if callback is related to access control system
     */
    isAccessRelatedCallback(callbackData) {
        const accessCallbacks = [
            'enter_access_code',
            'retry_code_entry',
            'follow_developer',
            'admin_',
            'generate_',
            'back_to_admin'
        ];
        
        return accessCallbacks.some(prefix => callbackData.startsWith(prefix));
    }

    /**
     * Enable access control (for admin)
     */
    enableAccessControl() {
        this.accessControlEnabled = true;
        this.monitoring?.logInfo('Access control enabled');
    }

    /**
     * Disable access control (for admin)
     */
    disableAccessControl() {
        this.accessControlEnabled = false;
        this.monitoring?.logInfo('Access control disabled');
    }

    /**
     * Get access control status
     */
    getStatus() {
        return {
            enabled: this.accessControlEnabled,
            bypassCommands: Array.from(this.bypassCommands)
        };
    }

    /**
     * Add command to bypass list (for admin)
     */
    addBypassCommand(command) {
        this.bypassCommands.add(command.toLowerCase());
        this.monitoring?.logInfo('Command added to bypass list', { command });
    }

    /**
     * Remove command from bypass list (for admin)
     */
    removeBypassCommand(command) {
        const removed = this.bypassCommands.delete(command.toLowerCase());
        if (removed) {
            this.monitoring?.logInfo('Command removed from bypass list', { command });
        }
        return removed;
    }

    /**
     * Emergency disable - completely bypass all access control
     */
    emergencyDisable() {
        this.accessControlEnabled = false;
        console.warn('🚨 EMERGENCY: Access control disabled');
        this.monitoring?.logWarn('Emergency access control disable activated');
    }

    /**
     * Safe integration check - verify all components are working
     */
    async performSafetyCheck() {
        try {
            const checks = {
                accessCodeSystem: !!this.accessCodeSystem,
                welcomeHandler: !!this.welcomeHandler,
                database: !!this.database,
                adminAccess: this.accessCodeSystem?.isAdmin(6920475855),
                databaseConnection: false
            };

            // Test database connection
            try {
                await this.database.query('SELECT 1');
                checks.databaseConnection = true;
            } catch (dbError) {
                console.error('Database connection check failed:', dbError.message);
            }

            const allChecksPass = Object.values(checks).every(check => check === true);
            
            this.monitoring?.logInfo('Access control safety check completed', {
                checks,
                allChecksPass,
                accessControlEnabled: this.accessControlEnabled
            });

            return {
                success: allChecksPass,
                checks,
                recommendation: allChecksPass ? 
                    'Safe to enable access control' : 
                    'Fix issues before enabling access control'
            };

        } catch (error) {
            this.monitoring?.logError('Safety check failed', error);
            return {
                success: false,
                error: error.message,
                recommendation: 'Emergency disable access control'
            };
        }
    }
}

module.exports = AccessControlMiddleware;
