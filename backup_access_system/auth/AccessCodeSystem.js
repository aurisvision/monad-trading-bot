/**
 * Access Code System for Area51 Bot
 * Provides exclusive access control through invitation codes
 */

const crypto = require('crypto');

class AccessCodeSystem {
    constructor(database, cacheService, monitoring) {
        this.database = database;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        
        // Admin user ID
        this.adminUserId = 6920475855;
        
        // Cache TTL for access verification
        this.accessCacheTTL = 7200; // 2 hours
        
        // Code generation settings
        this.codeLength = 8;
        this.codePrefix = 'AREA51';
    }

    /**
     * تحقق من صلاحية الوصول للمستخدم
     */
    async checkUserAccess(telegramId) {
        try {
            // Admin always has access
            if (telegramId === this.adminUserId) {
                return {
                    hasAccess: true,
                    source: 'admin',
                    accessType: 'admin'
                };
            }

            // Check cache first for performance
            if (this.cacheService) {
                const cached = await this.cacheService.get('user_access', telegramId);
                if (cached && cached.hasAccess) {
                    return {
                        hasAccess: true,
                        source: 'cache',
                        accessType: cached.accessType,
                        usedCode: cached.usedCode,
                        accessGrantedAt: cached.accessGrantedAt
                    };
                }
            }

            // Check database
            const dbResult = await this.database.getUserAccess(telegramId);
            if (dbResult && dbResult.is_active) {
                // Cache the result for future requests
                if (this.cacheService) {
                    await this.cacheService.set(
                        'user_access', 
                        telegramId, 
                        {
                            hasAccess: true,
                            accessType: 'code',
                            usedCode: dbResult.used_code,
                            accessGrantedAt: dbResult.access_granted_at
                        },
                        this.accessCacheTTL
                    );
                }

                return {
                    hasAccess: true,
                    source: 'database',
                    accessType: 'code',
                    usedCode: dbResult.used_code,
                    accessGrantedAt: dbResult.access_granted_at
                };
            }

            return {
                hasAccess: false,
                source: 'not_found'
            };

        } catch (error) {
            this.monitoring?.logError('Check user access failed', error, { telegramId });
            return {
                hasAccess: false,
                source: 'error'
            };
        }
    }

    /**
     * التحقق من صحة الكود ومنح الوصول
     */
    async verifyAndGrantAccess(telegramId, code, userInfo = {}) {
        try {
            const cleanCode = this.cleanCode(code);
            
            // Check if code exists and is valid
            const codeData = await this.database.getAccessCode(cleanCode);
            
            if (!codeData) {
                return {
                    success: false,
                    reason: 'invalid_code',
                    message: '❌ *Invalid Code*\n\nThe code you entered is not valid. Please check and try again.'
                };
            }

            if (!codeData.is_active) {
                return {
                    success: false,
                    reason: 'code_disabled',
                    message: '❌ *Code Disabled*\n\nThis code has been disabled and can no longer be used.'
                };
            }

            if (codeData.expires_at && new Date() > new Date(codeData.expires_at)) {
                return {
                    success: false,
                    reason: 'code_expired',
                    message: '❌ *Code Expired*\n\nThis code has expired and can no longer be used.'
                };
            }

            if (codeData.max_uses && codeData.used_count >= codeData.max_uses) {
                return {
                    success: false,
                    reason: 'code_exhausted',
                    message: '❌ *Code Limit Reached*\n\nThis code has reached its maximum usage limit.'
                };
            }

            // Check if user already used a code
            const existingAccess = await this.database.getUserAccess(telegramId);
            if (existingAccess && existingAccess.is_active) {
                return {
                    success: false,
                    reason: 'already_has_access',
                    message: `✅ *Already Have Access*\n\nYou already have access to the bot using code: \`${existingAccess.used_code}\``
                };
            }

            // Grant access
            await this.grantUserAccess(telegramId, cleanCode, userInfo);

            // Update code usage count
            await this.database.incrementCodeUsage(cleanCode);

            // Cache the access for performance
            if (this.cacheService) {
                await this.cacheService.set(
                    'user_access', 
                    telegramId, 
                    {
                        hasAccess: true,
                        accessType: 'code',
                        usedCode: cleanCode,
                        accessGrantedAt: new Date().toISOString()
                    },
                    this.accessCacheTTL
                );
            }

            this.monitoring?.logInfo('Access granted successfully', {
                telegramId,
                code: cleanCode,
                codeType: codeData.code_type
            });

            return {
                success: true,
                code: cleanCode,
                codeType: codeData.code_type,
                message: `**Welcome to Area51 Bot!**\n\nAccess granted successfully!\nCode: \`${cleanCode}\`\n\nYou now have full access to all bot features. Enjoy trading!`
            };

        } catch (error) {
            this.monitoring?.logError('Verify and grant access failed', error, {
                telegramId,
                code: code?.substring(0, 4) + '***' // Log partial code for security
            });

            return {
                success: false,
                reason: 'system_error',
                message: '❌ *System Error*\n\nAn error occurred while verifying your code. Please try again later.'
            };
        }
    }

    /**
     * منح الوصول للمستخدم
     */
    async grantUserAccess(telegramId, code, userInfo = {}) {
        const query = `
            INSERT INTO user_access (telegram_id, used_code, access_granted_at, user_info, is_active)
            VALUES ($1, $2, NOW(), $3, true)
            ON CONFLICT (telegram_id) 
            DO UPDATE SET 
                used_code = $2,
                access_granted_at = NOW(),
                user_info = $3,
                is_active = true
        `;

        return await this.database.query(query, [
            telegramId, 
            code, 
            JSON.stringify(userInfo)
        ]);
    }

    /**
     * توليد كود جديد (للأدمن)
     */
    async generateCode(codeType = 'general', maxUses = null, expiresInHours = null, description = '') {
        try {
            const code = this.generateUniqueCode();
            const expiresAt = expiresInHours ? 
                new Date(Date.now() + (expiresInHours * 60 * 60 * 1000)) : null;

            const query = `
                INSERT INTO access_codes (
                    code, code_type, max_uses, expires_at, description, 
                    created_by, created_at, is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), true)
                RETURNING *
            `;

            const result = await this.database.getOne(query, [
                code, codeType, maxUses, expiresAt, description, this.adminUserId
            ]);

            this.monitoring?.logInfo('Access code generated', {
                code,
                codeType,
                maxUses,
                expiresAt,
                createdBy: this.adminUserId
            });

            return {
                success: true,
                code,
                codeData: result
            };

        } catch (error) {
            this.monitoring?.logError('Generate code failed', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * توليد كود فريد
     */
    generateUniqueCode() {
        const randomBytes = crypto.randomBytes(4);
        const randomString = randomBytes.toString('hex').toUpperCase();
        return `${this.codePrefix}-${randomString}`;
    }

    /**
     * تنظيف الكود
     */
    cleanCode(code) {
        if (!code) return '';
        return code.trim().toUpperCase().replace(/\s+/g, '');
    }

    /**
     * الحصول على إحصائيات الأكواد (للأدمن)
     */
    async getCodeStats() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_codes,
                    COUNT(CASE WHEN is_active = true THEN 1 END) as active_codes,
                    COUNT(CASE WHEN expires_at > NOW() OR expires_at IS NULL THEN 1 END) as valid_codes,
                    SUM(used_count) as total_uses,
                    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as codes_today,
                    COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as codes_this_week
                FROM access_codes
            `;

            const codeStats = await this.database.getOne(query);

            const userQuery = `
                SELECT 
                    COUNT(*) as total_users_with_access,
                    COUNT(CASE WHEN access_granted_at > NOW() - INTERVAL '24 hours' THEN 1 END) as new_users_today,
                    COUNT(CASE WHEN access_granted_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_users_this_week
                FROM user_access
                WHERE is_active = true
            `;

            const userStats = await this.database.getOne(query);

            return {
                codes: {
                    total: parseInt(codeStats.total_codes) || 0,
                    active: parseInt(codeStats.active_codes) || 0,
                    valid: parseInt(codeStats.valid_codes) || 0,
                    total_uses: parseInt(codeStats.total_uses) || 0,
                    created_today: parseInt(codeStats.codes_today) || 0,
                    created_this_week: parseInt(codeStats.codes_this_week) || 0
                },
                users: {
                    total_with_access: parseInt(userStats.total_users_with_access) || 0,
                    new_today: parseInt(userStats.new_users_today) || 0,
                    new_this_week: parseInt(userStats.new_users_this_week) || 0
                }
            };

        } catch (error) {
            this.monitoring?.logError('Get code stats failed', error);
            return {
                codes: { total: 0, active: 0, valid: 0, total_uses: 0, created_today: 0, created_this_week: 0 },
                users: { total_with_access: 0, new_today: 0, new_this_week: 0 }
            };
        }
    }

    /**
     * الحصول على قائمة الأكواد (للأدمن)
     */
    async getCodes(limit = 20, offset = 0, activeOnly = true) {
        try {
            const whereClause = activeOnly ? 'WHERE is_active = true' : '';
            const query = `
                SELECT code, code_type, max_uses, used_count, expires_at, 
                       description, created_at, is_active
                FROM access_codes
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
            `;

            return await this.database.getMany(query, [limit, offset]);

        } catch (error) {
            this.monitoring?.logError('Get codes failed', error);
            return [];
        }
    }

    /**
     * تعطيل كود (للأدمن)
     */
    async disableCode(code) {
        try {
            const query = `
                UPDATE access_codes 
                SET is_active = false, disabled_at = NOW()
                WHERE code = $1
            `;

            await this.database.query(query, [code]);

            this.monitoring?.logInfo('Access code disabled', { code });
            return true;

        } catch (error) {
            this.monitoring?.logError('Disable code failed', error, { code });
            return false;
        }
    }

    /**
     * إلغاء وصول مستخدم (للأدمن)
     */
    async revokeUserAccess(telegramId) {
        try {
            const query = `
                UPDATE user_access 
                SET is_active = false, revoked_at = NOW()
                WHERE telegram_id = $1
            `;

            await this.database.query(query, [telegramId]);

            // Clear cache
            if (this.cacheService) {
                await this.cacheService.delete('user_access', telegramId);
            }

            this.monitoring?.logInfo('User access revoked', { telegramId });
            return true;

        } catch (error) {
            this.monitoring?.logError('Revoke user access failed', error, { telegramId });
            return false;
        }
    }

    /**
     * تحقق من كون المستخدم أدمن
     */
    isAdmin(telegramId) {
        return telegramId === this.adminUserId;
    }
}

module.exports = AccessCodeSystem;
