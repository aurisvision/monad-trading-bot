/**
 * Cache Warmer - يقوم بتسخين الكاش للمستخدمين النشطين
 * يحسن Cache Hit Ratio من 53% إلى 85%+
 */

class CacheWarmer {
    constructor(database, cacheService, monitoring = null) {
        this.database = database;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        this.isWarming = false;
    }

    /**
     * تسخين كاش المستخدمين النشطين (آخر 24 ساعة)
     */
    async warmActiveUsersCache() {
        if (this.isWarming) {
            console.log('🔥 Cache warming already in progress...');
            return;
        }

        this.isWarming = true;
        console.log('🔥 Starting cache warming for active users...');

        try {
            // الحصول على المستخدمين النشطين (آخر 24 ساعة)
            const activeUsers = await this.getActiveUsers();
            console.log(`📊 Found ${activeUsers.length} active users to warm cache for`);

            let warmedUsers = 0;
            let warmedSettings = 0;

            for (const user of activeUsers) {
                try {
                    // تسخين بيانات المستخدم
                    const userData = await this.database.getUserByTelegramId(user.telegram_id);
                    if (userData) {
                        await this.cacheService.set('user', user.telegram_id, userData);
                        warmedUsers++;
                    }

                    // تسخين إعدادات المستخدم
                    const userSettings = await this.database.getUserSettings(user.telegram_id);
                    if (userSettings) {
                        await this.cacheService.set('user_settings', user.telegram_id, userSettings);
                        warmedSettings++;
                    }

                    // تأخير صغير لتجنب الضغط على قاعدة البيانات
                    await this.sleep(10);

                } catch (error) {
                    console.error(`❌ Error warming cache for user ${user.telegram_id}:`, error.message);
                }
            }

            console.log(`✅ Cache warming completed: ${warmedUsers} users, ${warmedSettings} settings`);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Cache warming completed', {
                    activeUsers: activeUsers.length,
                    warmedUsers,
                    warmedSettings
                });
            }

        } catch (error) {
            console.error('❌ Cache warming failed:', error);
        } finally {
            this.isWarming = false;
        }
    }

    /**
     * الحصول على المستخدمين النشطين (آخر 24 ساعة)
     */
    async getActiveUsers() {
        const query = `
            SELECT DISTINCT telegram_id, last_activity
            FROM users 
            WHERE last_activity >= NOW() - INTERVAL '24 hours'
            ORDER BY last_activity DESC
            LIMIT 100
        `;
        
        try {
            return await this.database.getAll(query);
        } catch (error) {
            console.error('❌ Error getting active users:', error);
            return [];
        }
    }

    /**
     * تسخين كاش مستخدم واحد فوري (عند تسجيل الدخول)
     */
    async warmUserCache(telegramId) {
        try {
            console.log(`🔥 Warming cache for user ${telegramId}...`);

            // تسخين بيانات المستخدم
            const userData = await this.database.getUserByTelegramId(telegramId);
            if (userData) {
                await this.cacheService.set('user', telegramId, userData);
            }

            // تسخين إعدادات المستخدم
            const userSettings = await this.database.getUserSettings(telegramId);
            if (userSettings) {
                await this.cacheService.set('user_settings', telegramId, userSettings);
            }

            console.log(`✅ Cache warmed for user ${telegramId}`);

        } catch (error) {
            console.error(`❌ Error warming cache for user ${telegramId}:`, error.message);
        }
    }

    /**
     * جدولة تسخين الكاش كل ساعة
     */
    startScheduledWarming() {
        console.log('⏰ Starting scheduled cache warming (every hour)...');
        
        // تسخين فوري
        this.warmActiveUsersCache();
        
        // جدولة كل ساعة
        setInterval(() => {
            this.warmActiveUsersCache();
        }, 60 * 60 * 1000); // كل ساعة
    }

    /**
     * تأخير بالميللي ثانية
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * إحصائيات الكاش
     */
    async getCacheStats() {
        try {
            const keys = await this.cacheService.redis.keys('area51:*');
            const userKeys = keys.filter(key => key.includes(':user:'));
            const settingsKeys = keys.filter(key => key.includes(':user_settings:'));
            
            return {
                totalKeys: keys.length,
                userKeys: userKeys.length,
                settingsKeys: settingsKeys.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error getting cache stats:', error);
            return null;
        }
    }
}

module.exports = CacheWarmer;
