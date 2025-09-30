/**
 * UserService - Centralized User Operations
 * Eliminates database operation duplication across the codebase
 * 
 * SAFETY: This is a NEW service layer that doesn't modify existing functionality
 */

class UserService {
    constructor(database, cacheService = null, monitoring = null) {
        this.database = database;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        
        // Service metrics
        this.metrics = {
            userQueries: 0,
            settingsQueries: 0,
            stateOperations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0
        };
    }

    /**
     * User Management Operations
     */
    async getUser(telegramId) {
        try {
            this.metrics.userQueries++;
            
            // Try cache first
            if (this.cacheService) {
                const cached = await this.cacheService.get('user', telegramId);
                if (cached) {
                    this.metrics.cacheHits++;
                    return cached;
                }
                this.metrics.cacheMisses++;
            }

            // Get from database
            const user = await this.database.getUserByTelegramId(telegramId);
            
            // Cache the result
            if (user && this.cacheService) {
                await this.cacheService.set('user', telegramId, user);
            }

            return user;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to get user', { telegramId, error: error.message });
            throw error;
        }
    }

    async createUser(userData) {
        try {
            this.metrics.userQueries++;
            const user = await this.database.createUser(userData);
            
            // Clear cache to ensure fresh data
            if (this.cacheService && user) {
                await this.cacheService.delete('user', user.telegram_id);
            }

            return user;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to create user', { userData, error: error.message });
            throw error;
        }
    }

    async updateUser(telegramId, updates) {
        try {
            this.metrics.userQueries++;
            const user = await this.database.updateUser(telegramId, updates);
            
            // Update cache with new data
            if (this.cacheService && user) {
                await this.cacheService.set('user', telegramId, user);
            }

            return user;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to update user', { telegramId, updates, error: error.message });
            throw error;
        }
    }

    async deleteUser(telegramId) {
        try {
            this.metrics.userQueries++;
            const result = await this.database.deleteUser(telegramId);
            
            // Clear all user-related cache
            if (this.cacheService) {
                await this.clearUserCache(telegramId);
            }

            return result;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to delete user', { telegramId, error: error.message });
            throw error;
        }
    }

    /**
     * User Settings Operations
     */
    async getUserSettings(telegramId) {
        try {
            this.metrics.settingsQueries++;
            
            // Try cache first
            if (this.cacheService) {
                const cached = await this.cacheService.get('user_settings', telegramId);
                if (cached) {
                    this.metrics.cacheHits++;
                    return cached;
                }
                this.metrics.cacheMisses++;
            }

            // Get from database
            let settings = await this.database.getUserSettings(telegramId);
            
            // Create default settings if none exist
            if (!settings) {
                settings = await this.database.createUserSettings(telegramId);
            }
            
            // Cache the result
            if (settings && this.cacheService) {
                await this.cacheService.set('user_settings', telegramId, settings);
            }

            return settings;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to get user settings', { telegramId, error: error.message });
            throw error;
        }
    }

    async updateUserSettings(telegramId, settings) {
        try {
            this.metrics.settingsQueries++;
            const updated = await this.database.updateUserSettings(telegramId, settings);
            
            // Update cache immediately
            if (this.cacheService && updated) {
                await this.cacheService.set('user_settings', telegramId, updated);
            }

            return updated;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to update user settings', { telegramId, settings, error: error.message });
            throw error;
        }
    }

    /**
     * User State Operations
     */
    async setUserState(telegramId, state, data = null) {
        try {
            this.metrics.stateOperations++;
            const result = await this.database.setUserState(telegramId, state, data);
            
            // Clear state cache to ensure fresh data
            if (this.cacheService) {
                await this.cacheService.delete('user_state', telegramId);
            }

            return result;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to set user state', { telegramId, state, error: error.message });
            throw error;
        }
    }

    async getUserState(telegramId) {
        try {
            this.metrics.stateOperations++;
            
            // Try cache first
            if (this.cacheService) {
                const cached = await this.cacheService.get('user_state', telegramId);
                if (cached) {
                    this.metrics.cacheHits++;
                    return cached;
                }
                this.metrics.cacheMisses++;
            }

            // Get from database
            const state = await this.database.getUserState(telegramId);
            
            // Cache the result (with short TTL since states expire)
            if (state && this.cacheService) {
                await this.cacheService.set('user_state', telegramId, state, 300); // 5 minutes
            }

            return state;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to get user state', { telegramId, error: error.message });
            return null;
        }
    }

    async clearUserState(telegramId) {
        try {
            this.metrics.stateOperations++;
            const result = await this.database.clearUserState(telegramId);
            
            // Clear from cache
            if (this.cacheService) {
                await this.cacheService.delete('user_state', telegramId);
            }

            return result;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to clear user state', { telegramId, error: error.message });
        }
    }

    async hasActiveState(telegramId, expectedState = null) {
        try {
            const state = await this.getUserState(telegramId);
            if (!state) return false;
            
            if (expectedState) {
                return state.state === expectedState;
            }
            
            return true;
        } catch (error) {
            this.logError('Failed to check active state', { telegramId, expectedState, error: error.message });
            return false;
        }
    }

    /**
     * User Access Operations
     */
    async getUserAccess(telegramId) {
        try {
            return await this.database.getUserAccess(telegramId);
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to get user access', { telegramId, error: error.message });
            return null;
        }
    }

    async grantUserAccess(telegramId, code, userInfo = {}) {
        try {
            const result = await this.database.grantUserAccess(telegramId, code, userInfo);
            
            // Clear access cache
            if (this.cacheService) {
                await this.cacheService.delete('user_access', telegramId);
            }

            return result;
        } catch (error) {
            this.metrics.errors++;
            this.logError('Failed to grant user access', { telegramId, code, error: error.message });
            throw error;
        }
    }

    /**
     * User Activity Tracking
     */
    async trackUserActivity(telegramId) {
        try {
            await this.database.trackUserActivity(telegramId);
            
            // Update user cache with fresh activity data
            if (this.cacheService) {
                await this.cacheService.delete('user', telegramId);
            }
        } catch (error) {
            // Don't throw for activity tracking failures
            this.logError('Failed to track user activity', { telegramId, error: error.message });
        }
    }

    async getUserTransactionCount(telegramId) {
        try {
            return await this.database.getUserTransactionCount(telegramId);
        } catch (error) {
            this.logError('Failed to get user transaction count', { telegramId, error: error.message });
            return 0;
        }
    }

    /**
     * Cache Management
     */
    async clearUserCache(telegramId) {
        if (!this.cacheService) return;

        try {
            await Promise.all([
                this.cacheService.delete('user', telegramId),
                this.cacheService.delete('user_settings', telegramId),
                this.cacheService.delete('user_state', telegramId),
                this.cacheService.delete('user_access', telegramId),
                this.cacheService.delete('session', telegramId),
                this.cacheService.delete('main_menu', telegramId)
            ]);

            this.logInfo('User cache cleared successfully', { telegramId });
        } catch (error) {
            this.logError('Failed to clear user cache', { telegramId, error: error.message });
        }
    }

    async refreshUserCache(telegramId) {
        try {
            // Clear existing cache
            await this.clearUserCache(telegramId);
            
            // Pre-load fresh data
            await Promise.all([
                this.getUser(telegramId),
                this.getUserSettings(telegramId)
            ]);

            this.logInfo('User cache refreshed successfully', { telegramId });
        } catch (error) {
            this.logError('Failed to refresh user cache', { telegramId, error: error.message });
        }
    }

    /**
     * Batch Operations
     */
    async getMultipleUsers(telegramIds) {
        try {
            const users = await Promise.all(
                telegramIds.map(id => this.getUser(id))
            );
            return users.filter(user => user !== null);
        } catch (error) {
            this.logError('Failed to get multiple users', { telegramIds, error: error.message });
            return [];
        }
    }

    async getActiveUsers(limit = 100) {
        try {
            return await this.database.getActiveUsers(limit);
        } catch (error) {
            this.logError('Failed to get active users', { limit, error: error.message });
            return [];
        }
    }

    /**
     * Utility Methods
     */
    logError(message, context = {}) {
        if (this.monitoring?.logError) {
            this.monitoring.logError(`[UserService] ${message}`, context);
        } else {
            console.error(`[UserService] ${message}:`, context);
        }
    }

    logInfo(message, context = {}) {
        if (this.monitoring?.logInfo) {
            this.monitoring.logInfo(`[UserService] ${message}`, context);
        } else {
            console.log(`[UserService] ${message}:`, context);
        }
    }

    logWarn(message, context = {}) {
        if (this.monitoring?.logWarn) {
            this.monitoring.logWarn(`[UserService] ${message}`, context);
        } else {
            console.warn(`[UserService] ${message}:`, context);
        }
    }

    /**
     * Service Health and Metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
            errorRate: this.metrics.errors / (this.metrics.userQueries + this.metrics.settingsQueries + this.metrics.stateOperations) || 0,
            timestamp: new Date().toISOString()
        };
    }

    async healthCheck() {
        try {
            // Test basic operations
            const testUserId = 'health_check_test';
            await this.database.getUserByTelegramId(testUserId);
            
            return {
                status: 'healthy',
                metrics: this.getMetrics(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = UserService;