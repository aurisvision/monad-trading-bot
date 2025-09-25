/**
 * Legacy System Bridge - جسر النظام القديم
 * يوفر توافق مؤقت مع النظام القديم أثناء الانتقال الكامل للنظام الجديد
 * سيتم حذف هذا الملف بعد اكتمال الترحيل
 */
const UnifiedTradingEngine = require('../trading/UnifiedTradingEngine');
const TradingInterface = require('../trading/TradingInterface');
class LegacySystemBridge {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.unifiedEngine = new UnifiedTradingEngine(dependencies);
        this.tradingInterface = new TradingInterface(null, dependencies);
    }
    /**
     * 🔄 Bridge old TradingHandlers calls to new UnifiedTradingEngine
     */
    async bridgeTradeExecution(type, action, userId, tokenAddress, amount, ctx) {
        try {
            const result = await this.unifiedEngine.executeTrade({
                type,
                action,
                userId,
                tokenAddress,
                amount,
                ctx
            });
            return result;
        } catch (error) {
            throw error;
        }
    }
    /**
     * 🔄 Bridge old AutoBuyEngine calls to new system
     */
    async bridgeAutoBuy(userId, tokenAddress, amount, userSettings) {
        try {
            const result = await this.tradingInterface.executeAutoBuy(
                userId, 
                tokenAddress, 
                amount, 
                null, // user will be loaded by system
                userSettings
            );
            return result;
        } catch (error) {
            throw error;
        }
    }
    /**
     * 🔄 Bridge old portfolio calls to new system
     */
    async bridgePortfolioData(userId, walletAddress) {
        try {
            // Use unified data manager for portfolio
            const portfolioData = await this.unifiedEngine.dataManager.getCachedTokenInfo(walletAddress);
            return portfolioData;
        } catch (error) {
            throw error;
        }
    }
    /**
     * 📊 Get bridge statistics
     */
    getBridgeStats() {
        return {
            status: 'active',
            purpose: 'temporary compatibility during migration',
            unifiedEngineStats: this.unifiedEngine.getDetailedStats(),
            recommendation: 'Complete migration to remove this bridge'
        };
    }
    /**
     * 🔧 Health check for bridge
     */
    async healthCheck() {
        try {
            const unifiedHealth = await this.unifiedEngine.healthCheck();
            return {
                bridge: 'healthy',
                unifiedSystem: unifiedHealth.status,
                redis: unifiedHealth.redis,
                database: unifiedHealth.database,
                recommendation: unifiedHealth.status === 'healthy' ? 
                    'Ready to remove legacy bridge' : 
                    'Fix unified system issues first'
            };
        } catch (error) {
            return {
                bridge: 'error',
                error: error.message
            };
        }
    }
}
module.exports = LegacySystemBridge;