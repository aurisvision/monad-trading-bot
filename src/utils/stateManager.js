// 🔄 State Manager - Automatic cleanup of expired user states

class StateManager {
    constructor(database, cacheService = null, monitoring = null) {
        this.database = database;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        this.cleanupInterval = null;
    }

    /**
     * Start automatic cleanup of expired states
     */
    startAutoCleanup(intervalMinutes = 5) {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = setInterval(async () => {
            await this.cleanupExpiredStates();
        }, intervalMinutes * 60 * 1000);

        console.log(`🧹 State cleanup started (every ${intervalMinutes} minutes)`);
    }

    /**
     * Stop automatic cleanup
     */
    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('🛑 State cleanup stopped');
        }
    }

    /**
     * Clean up expired user states
     */
    async cleanupExpiredStates() {
        try {
            const result = await this.database.query(`
                DELETE FROM user_states 
                WHERE expires_at < NOW()
            `);

            if (result.rowCount > 0) {
                console.log(`🧹 Cleaned up ${result.rowCount} expired user states`);
                
                if (this.monitoring) {
                    this.monitoring.logInfo('Expired user states cleaned', { 
                        count: result.rowCount 
                    });
                }
            }

        } catch (error) {
            console.error('❌ Error cleaning expired states:', error.message);
            
            if (this.monitoring) {
                this.monitoring.logError('State cleanup failed', error);
            }
        }
    }

    /**
     * Clear user state safely with cache invalidation
     */
    async clearUserState(userId) {
        try {
            // Clear from database
            await this.database.clearUserState(userId);
            
            // Clear from cache if available
            if (this.cacheService) {
                await this.cacheService.delete('user_state', userId);
            }
            
            console.log(`✅ Cleared state for user: ${userId}`);
            
        } catch (error) {
            console.error(`❌ Error clearing state for user ${userId}:`, error.message);
            throw error;
        }
    }

    /**
     * Set user state with automatic expiration
     */
    async setUserState(userId, state, data = {}, expirationMinutes = 10) {
        try {
            await this.database.setUserState(userId, state, data, expirationMinutes);
            
            // Invalidate cache to force refresh
            if (this.cacheService) {
                await this.cacheService.delete('user_state', userId);
            }
            
            console.log(`✅ Set state for user ${userId}: ${state} (expires in ${expirationMinutes}m)`);
            
        } catch (error) {
            console.error(`❌ Error setting state for user ${userId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get user state with automatic cleanup if expired
     */
    async getUserState(userId) {
        try {
            let userState;
            
            // Try cache first
            if (this.cacheService) {
                userState = await this.cacheService.get('user_state', userId, async () => {
                    return await this.database.getUserState(userId);
                });
            } else {
                userState = await this.database.getUserState(userId);
            }
            
            // Check if state is expired
            if (userState && userState.expires_at && new Date(userState.expires_at) < new Date()) {
                console.log(`⏰ State expired for user ${userId}, clearing...`);
                await this.clearUserState(userId);
                return null;
            }
            
            return userState;
            
        } catch (error) {
            console.error(`❌ Error getting state for user ${userId}:`, error.message);
            return null;
        }
    }

    /**
     * Check if user has active state
     */
    async hasActiveState(userId, expectedState = null) {
        const userState = await this.getUserState(userId);
        
        if (!userState) return false;
        
        if (expectedState) {
            return userState.state === expectedState;
        }
        
        return true;
    }

    /**
     * Force cleanup all states (for debugging)
     */
    async clearAllStates() {
        try {
            const result = await this.database.query('DELETE FROM user_states');
            console.log(`🧹 Cleared all user states (${result.rowCount} total)`);
            
            // Clear cache
            if (this.cacheService && typeof this.cacheService.clearPattern === 'function') {
                await this.cacheService.clearPattern('user_state:*');
            }
            
            return result.rowCount;
            
        } catch (error) {
            console.error('❌ Error clearing all states:', error.message);
            throw error;
        }
    }
}

module.exports = StateManager;
