/**
 * Simple Access Code System
 * Professional, lightweight, and integrated with existing system
 */

class SimpleAccessCode {
    constructor(database, cacheService) {
        this.database = database;
        this.cache = cacheService;
        this.adminId = parseInt(process.env.ADMIN_USER_ID || '6920475855');
        
        console.log('[SimpleAccessCode] System initialized');
        console.log(`[SimpleAccessCode] Admin ID: ${this.adminId}`);
    }

    /**
     * Check if user has access
     */
    async checkAccess(userId) {
        const logPrefix = `[checkAccess:${userId}]`;
        
        // Admin always has access
        if (userId === this.adminId) {
            console.log(`${logPrefix} Admin access granted`);
            return { hasAccess: true, isAdmin: true };
        }

        // Check cache first
        const cacheKey = `access:${userId}`;
        const cached = await this.cache?.get('user', userId);
        if (cached) {
            console.log(`${logPrefix} Access found in cache`);
            return { hasAccess: true, fromCache: true };
        }

        // Check database
        try {
            const query = `
                SELECT code, used_at 
                FROM access_codes 
                WHERE used_by = $1
                LIMIT 1
            `;
            const result = await this.database.query(query, [userId]);
            
            if (result.rows.length > 0) {
                console.log(`${logPrefix} Access found in database`);
                // Cache for future
                await this.cache?.set('user', userId, { hasAccess: true }, 3600);
                return { 
                    hasAccess: true, 
                    code: result.rows[0].code,
                    usedAt: result.rows[0].used_at 
                };
            }
            
            console.log(`${logPrefix} No access found`);
            return { hasAccess: false };
            
        } catch (error) {
            console.error(`${logPrefix} Database error:`, error.message);
            return { hasAccess: false, error: true };
        }
    }

    /**
     * Verify code and grant access
     */
    async verifyCode(userId, code, userInfo = {}) {
        const logPrefix = `[verifyCode:${userId}]`;
        const cleanCode = code.trim().toUpperCase();
        
        console.log(`${logPrefix} Attempting to verify code: ${cleanCode}`);

        try {
            // Check if user already has access
            const existingAccess = await this.checkAccess(userId);
            if (existingAccess.hasAccess) {
                console.log(`${logPrefix} User already has access`);
                return {
                    success: true,
                    alreadyHasAccess: true,
                    message: `*Welcome Back*\n\nYou already have access to the bot.`
                };
            }

            // Check if code exists and is unused
            const checkQuery = `
                SELECT id, used_by 
                FROM access_codes 
                WHERE code = $1
            `;
            const checkResult = await this.database.query(checkQuery, [cleanCode]);
            
            if (checkResult.rows.length === 0) {
                console.log(`${logPrefix} Invalid code: ${cleanCode}`);
                return {
                    success: false,
                    message: `*Invalid Code*\n\nThe code you entered does not exist.`
                };
            }

            const codeData = checkResult.rows[0];
            
            if (codeData.used_by) {
                console.log(`${logPrefix} Code already used by: ${codeData.used_by}`);
                return {
                    success: false,
                    message: `*Code Already Used*\n\nThis code has already been used.`
                };
            }

            // Use the code
            const updateQuery = `
                UPDATE access_codes 
                SET used_by = $1, used_at = CURRENT_TIMESTAMP 
                WHERE id = $2
                RETURNING code
            `;
            await this.database.query(updateQuery, [userId, codeData.id]);
            
            // Save user to main users table if needed
            try {
                await this.database.createUser(
                    userId,
                    userInfo.username || null,
                    userInfo.first_name || 'User',
                    userInfo.last_name || null
                );
                console.log(`[verifyCode:${userId}] User saved to database with username: ${userInfo.username || 'none'}`);
            } catch (userError) {
                console.log(`[verifyCode:${userId}] User already exists or error saving: ${userError.message}`);
            }
            
            // Clear any cache
            await this.cache?.set('user', userId, { hasAccess: true }, 3600);
            
            console.log(`${logPrefix} Access granted with code: ${cleanCode}`);
            
            return {
                success: true,
                message: `*Access Granted*\n\nWelcome to Area51 Bot!\nYour access code has been activated successfully.`
            };
            
        } catch (error) {
            console.error(`${logPrefix} Error:`, error);
            return {
                success: false,
                message: `*System Error*\n\nPlease try again later.`
            };
        }
    }

    /**
     */
    async generateCode() {
        const logPrefix = '[generateCode]';
        
        try {
            // Generate unique code with underscore instead of dash
            const code = `A51_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
            
            const insertQuery = `
                INSERT INTO access_codes (code, created_at)
                VALUES ($1, CURRENT_TIMESTAMP)
                RETURNING code, created_at
            `;
            const result = await this.database.query(insertQuery, [code]);
            
            console.log(`${logPrefix} Generated new code: ${code}`);
            
            return {
                success: true,
                code: result.rows[0].code,
                createdAt: result.rows[0].created_at
            };
            
        } catch (error) {
            console.error(`${logPrefix} Error:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all registered users (Admin only)
     */
    async getRegisteredUsers() {
        const logPrefix = '[getRegisteredUsers]';
        
        try {
            const query = `
                SELECT 
                    ac.code,
                    ac.used_by as user_id,
                    ac.used_at,
                    u.username
                FROM access_codes ac
                LEFT JOIN users u ON u.telegram_id = ac.used_by
                WHERE ac.used_by IS NOT NULL
                ORDER BY ac.used_at DESC
            `;
            const result = await this.database.query(query);
            
            console.log(`${logPrefix} Found ${result.rows.length} registered users`);
            
            return result.rows;
            
        } catch (error) {
            console.error(`${logPrefix} Error:`, error);
            return [];
        }
    }

    /**
     * Get unused codes (Admin only)
     */
    async getUnusedCodes() {
        const logPrefix = '[getUnusedCodes]';
        
        try {
            const query = `
                SELECT code, created_at
                FROM access_codes
                WHERE used_by IS NULL
                ORDER BY created_at DESC
            `;
            const result = await this.database.query(query);
            
            console.log(`${logPrefix} Found ${result.rows.length} unused codes`);
            
            return result.rows;
            
        } catch (error) {
            console.error(`${logPrefix} Error:`, error);
            return [];
        }
    }

    /**
     * Delete unused code (Admin only)
     */
    async deleteCode(code) {
        const logPrefix = '[deleteCode]';
        
        console.log(`${logPrefix} Attempting to delete code: ${code}`);
        
        try {
            const query = `
                DELETE FROM access_codes 
                WHERE code = $1 AND used_by IS NULL
                RETURNING code
            `;
            console.log(`${logPrefix} Executing query with code: ${code}`);
            const result = await this.database.query(query, [code]);
            
            if (result.rows.length > 0) {
                console.log(`${logPrefix} Deleted code: ${code}`);
                return { success: true, message: `Code ${code} deleted successfully` };
            } else {
                console.log(`${logPrefix} Code not found or already used: ${code}`);
                return { success: false, message: 'Code not found or already used' };
            }
            
        } catch (error) {
            console.error(`${logPrefix} Error:`, error);
            return { success: false, message: 'Error deleting code' };
        }
    }

    /**
     * Get statistics for admin
     */
    async getStats() {
        const logPrefix = '[getStats]';
        
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_codes,
                    COUNT(CASE WHEN used_by IS NOT NULL THEN 1 END) as used_codes,
                    COUNT(CASE WHEN used_by IS NULL THEN 1 END) as unused_codes,
                    COUNT(DISTINCT used_by) as total_users
                FROM access_codes
            `;
            const result = await this.database.query(query);
            
            console.log(`${logPrefix} Generated stats`);
            
            return result.rows[0];
            
        } catch (error) {
            console.error(`${logPrefix} Error:`, error);
            return { total_codes: 0, used_codes: 0, unused_codes: 0, total_users: 0 };
        }
    }
}

module.exports = SimpleAccessCode;
