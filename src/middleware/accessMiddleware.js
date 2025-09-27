/**
 * Simple Access Middleware
 * Checks access for all users except on specific commands
 */

class AccessMiddleware {
    constructor(accessSystem) {
        this.accessSystem = accessSystem;
        this.enabled = process.env.ACCESS_CONTROL_ENABLED === 'true';
        
        // Commands that don't require access
        this.publicCommands = ['/start', '/help'];
        
        console.log(`[AccessMiddleware] Initialized - Enabled: ${this.enabled}`);
    }

    /**
     * Main middleware function
     */
    async checkAccess(ctx, next) {
        // Skip if disabled
        if (!this.enabled) {
            return next();
        }

        const userId = ctx.from?.id;
        if (!userId) {
            return next();
        }

        // Get command or callback
        const text = ctx.message?.text || '';
        const callback = ctx.callbackQuery?.data || '';
        
        // Check if it's a public command
        const isPublicCommand = this.publicCommands.some(cmd => text.startsWith(cmd));
        
        // Special handling for /start
        if (text === '/start' || callback === 'start') {
            const access = await this.accessSystem.checkAccess(userId);
            
            if (!access.hasAccess) {
                console.log(`[AccessMiddleware] User ${userId} needs access code`);
                // Store state that user needs code
                ctx.needsAccessCode = true;
            }
            
            return next();
        }

        // For all other commands, check access
        if (!isPublicCommand) {
            const access = await this.accessSystem.checkAccess(userId);
            
            if (!access.hasAccess) {
                console.log(`[AccessMiddleware] Access denied for user ${userId}`);
                await ctx.reply(
                    `🔐 *Access Required*\n\n` +
                    `You need an access code to use this bot.\n` +
                    `Please use /start to enter your code.`,
                    { parse_mode: 'Markdown' }
                );
                return; // Don't continue
            }
        }

        return next();
    }
}

module.exports = AccessMiddleware;
