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
            },
            auto: {
                name: 'Auto Buy',
                validations: ['enabled', 'balance'],
                slippage: { 
                    source: 'auto_buy_slippage' // من إعدادات المستخدم
                },
                gas: { 
                    source: 'auto_buy_gas' // من إعدادات المستخدم
                },
                timeouts: {
                    validation: 2000,     // 2 seconds
                    execution: 15000      // 15 seconds
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

        // رسائل الأخطاء الموحدة
        this.errorMessages = {
            USER_NOT_FOUND: 'المستخدم غير موجود. يرجى البدء بـ /start',
            INSUFFICIENT_BALANCE: 'الرصيد غير كافي لإتمام العملية',
            INVALID_TOKEN: 'عنوان العملة غير صحيح',
            INVALID_AMOUNT: 'الكمية غير صحيحة',
            WALLET_ERROR: 'خطأ في الوصول للمحفظة',
            NETWORK_ERROR: 'خطأ في الشبكة. يرجى المحاولة مرة أخرى',
            SLIPPAGE_TOO_HIGH: 'انزلاق السعر عالي جداً',
            AUTO_BUY_DISABLED: 'الشراء التلقائي غير مفعل',
            TURBO_MODE_ERROR: 'خطأ في وضع التيربو',
            TRANSACTION_FAILED: 'فشل في تنفيذ المعاملة'
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
     * الحصول على رسالة خطأ
     */
    getErrorMessage(errorType) {
        return this.errorMessages[errorType] || 'حدث خطأ غير متوقع';
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
     * الحصول على قيمة الـ slippage لنوع التداول
     */
    getSlippageValue(type, userSettings = null) {
        const config = this.getTradeConfig(type);
        
        if (config.slippage.fixed !== undefined) {
            return config.slippage.fixed;
        }
        
        if (config.slippage.source && userSettings) {
            return userSettings[config.slippage.source] || config.slippage.default;
        }
        
        return config.slippage.default || 1;
    }

    /**
     * الحصول على قيمة الـ gas لنوع التداول
     */
    getGasValue(type, userSettings = null) {
        const config = this.getTradeConfig(type);
        
        if (config.gas.fixed !== undefined) {
            return config.gas.fixed;
        }
        
        if (config.gas.source && userSettings) {
            return userSettings[config.gas.source] || config.gas.default;
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
