/**
 * Trading Configuration - إعدادات نظام التداول الموحد
 * يحتوي على جميع الإعدادات والقيم الثابتة للأنواع المختلفة من التداول
 */

class TradingConfig {
    constructor() {
        // إعدادات أنواع التداول المختلفة
        this.tradeTypes = {
            normal: {
                name: 'Normal Trading',
                validations: ['balance', 'token', 'quote'],
                slippage: { 
                    default: 1, 
                    min: 0.1, 
                    max: 50 
                },
                gas: { 
                    default: 50000000000, // 50 Gwei
                    min: 20000000000,     // 20 Gwei
                    max: 200000000000     // 200 Gwei
                },
                timeouts: {
                    validation: 5000,     // 5 seconds
                    execution: 30000      // 30 seconds
                }
            },
            turbo: {
                name: 'Turbo Trading',
                validations: [], // بدون فحوصات للسرعة القصوى
                slippage: { 
                    fixed: 20 // 20% ثابت للسرعة
                },
                gas: { 
                    fixed: 100000000000 // 100 Gwei ثابت
                },
                timeouts: {
                    execution: 10000 // 10 seconds max
                }
            }
        };

        // إعدادات الكاش
        this.cacheConfig = {
            // بيانات دائمة (بدون TTL)
            permanent: {
                user_data: {
                    prefix: 'area51:user:',
                    ttl: null
                },
                user_settings: {
                    prefix: 'area51:user_settings:',
                    ttl: null
                },
                wallet_instance: {
                    prefix: 'area51:wallet_instance:',
                    ttl: null
                }
            },
            // بيانات مؤقتة (مع TTL)
            temporary: {
                mon_balance: {
                    prefix: 'area51:wallet_balance:',
                    ttl: 30 // 30 ثانية
                },
                token_info: {
                    prefix: 'area51:token_info:',
                    ttl: 300 // 5 دقائق
                },
                portfolio: {
                    prefix: 'area51:portfolio:',
                    ttl: 60 // دقيقة واحدة
                },
                gas_prices: {
                    prefix: 'area51:gas:',
                    ttl: 60 // دقيقة واحدة
                },
                quotes: {
                    prefix: 'area51:quote:',
                    ttl: 10 // 10 ثوانِ فقط
                }
            }
        };

        // Unified error messages
        this.errorMessages = {
            USER_NOT_FOUND: 'User not found. Please start with /start',
            INSUFFICIENT_BALANCE: 'Insufficient balance to complete transaction',
            INVALID_TOKEN: 'Invalid token address',
            INVALID_AMOUNT: 'Invalid amount',
            WALLET_ERROR: 'Wallet access error',
            NETWORK_ERROR: 'Network error. Please try again',
            SLIPPAGE_TOO_HIGH: 'Slippage too high',
            AUTO_BUY_DISABLED: 'Auto buy is disabled',
            TURBO_MODE_ERROR: 'Turbo mode error',
            TRANSACTION_FAILED: 'Transaction execution failed'
        };

        // إعدادات الأمان
        this.security = {
            maxTransactionAmount: 1000, // 1000 MON حد أقصى
            gasBuffer: 0.05, // 0.05 MON buffer للـ gas
            minBalance: 0.01, // 0.01 MON حد أدنى للرصيد
            maxSlippage: 50, // 50% حد أقصى للانزلاق
            retryAttempts: 3, // عدد محاولات إعادة التنفيذ
            timeoutBuffer: 5000 // 5 ثوانِ buffer للـ timeout
        };
    }

    /**
     * الحصول على إعدادات نوع التداول
     */
    getTradeConfig(type) {
        return this.tradeTypes[type] || this.tradeTypes.normal;
    }

    /**
     * الحصول على إعدادات الكاش لنوع البيانات
     */
    getCacheConfig(dataType) {
        return this.cacheConfig.permanent[dataType] || 
               this.cacheConfig.temporary[dataType] || 
               { prefix: 'area51:default:', ttl: 300 };
    }

    /**
     * Get error message
     */
    getErrorMessage(errorType) {
        return this.errorMessages[errorType] || 'An unexpected error occurred';
    }

    /**
     * التحقق من صحة نوع التداول
     */
    isValidTradeType(type) {
        return Object.keys(this.tradeTypes).includes(type);
    }

    /**
     * الحصول على إعدادات الأمان
     */
    getSecurityConfig() {
        return this.security;
    }

    /**
     * تحديد ما إذا كان نوع التداول يحتاج فحوصات أمان
     */
    requiresValidation(type, validationType) {
        const config = this.getTradeConfig(type);
        return config.validations.includes(validationType);
    }

    /**
     * الحصول على قيمة الـ slippage لنوع التداول مع استخدام إعدادات المستخدم
     */
    getSlippageValue(type, userSettings = null) {
        const config = this.getTradeConfig(type);
        
        // للتيربو: استخدام 20% ثابت
        if (config.slippage.fixed !== undefined) {
            return config.slippage.fixed;
        }
        
        // للعادي: استخدام إعدادات المستخدم
        if (userSettings) {
            // استخدام slippage_tolerance من إعدادات المستخدم
            return userSettings.slippage_tolerance || config.slippage.default;
        }
        
        return config.slippage.default || 1;
    }

    /**
     * الحصول على قيمة الـ gas لنوع التداول مع استخدام إعدادات المستخدم
     */
    getGasValue(type, userSettings = null) {
        const config = this.getTradeConfig(type);
        
        // للتيربو: استخدام 100 Gwei ثابت
        if (config.gas.fixed !== undefined) {
            return config.gas.fixed;
        }
        
        // للعادي: استخدام إعدادات المستخدم مع منطق الأولوية
        if (userSettings) {
            // فحص إذا كان التيربو مفعل ومحدث مؤخراً
            const turboUpdated = new Date(userSettings.turbo_mode_updated_at || userSettings.created_at);
            const gasUpdated = new Date(userSettings.gas_settings_updated_at || userSettings.created_at);
            
            // إذا كان التيربو مفعل ومحدث أحدث من إعدادات الغاز
            if (userSettings.turbo_mode && turboUpdated >= gasUpdated) {
                return 100000000000; // 100 Gwei للتيربو
            }
            
            // وإلا استخدم إعدادات الغاز المخصصة
            return userSettings.gas_price || config.gas.default;
        }
        
        return config.gas.default || 50000000000;
    }

    /**
     * الحصول على timeout لنوع التداول
     */
    getTimeout(type, operation = 'execution') {
        const config = this.getTradeConfig(type);
        return config.timeouts[operation] || 30000;
    }
}

module.exports = TradingConfig;
