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

            return;
        }

        this.isWarming = true;

        try {
            // الحصول على المستخدمين النشطين (آخر 24 ساعة)
            const activeUsers = await this.getActiveUsers();

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

                }
            }

            if (this.monitoring) {
                this.monitoring.logInfo('Cache warming completed', {
                    activeUsers: activeUsers.length,
                    warmedUsers,
                    warmedSettings
                });
            }

        } catch (error) {

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

            return [];
        }
    }

    /**
     * تسخين كاش مستخدم واحد فوري (عند تسجيل الدخول)
     */
    async warmUserCache(telegramId) {
        try {

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

        } catch (error) {

        }
    }

    /**
     * جدولة تسخين الكاش كل ساعة
     */
    startScheduledWarming() {
        console.log('🔥 Starting scheduled cache warming...');

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

            return null;
        }
    }
}

module.exports = CacheWarmer;
