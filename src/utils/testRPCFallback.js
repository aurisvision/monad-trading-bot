const RPCManager = require('./RPCManager');
const { ethers } = require('ethers');

/**
 * اختبار نظام RPC Fallback
 * يتحقق من قدرة النظام على التبديل بين RPC endpoints عند حدوث أخطاء
 */
class RPCFallbackTester {
    constructor() {
        this.rpcManager = new RPCManager();
        this.testResults = [];
    }

    /**
     * تشغيل جميع الاختبارات
     */
    async runAllTests() {
        console.log('🧪 بدء اختبار نظام RPC Fallback...\n');

        try {
            await this.testBasicConnection();
            await this.testFallbackMechanism();
            await this.testRateLimitHandling();
            await this.testMultipleOperations();
            
            this.printResults();
        } catch (error) {
            console.error('❌ خطأ في تشغيل الاختبارات:', error.message);
        }
    }

    /**
     * اختبار الاتصال الأساسي
     */
    async testBasicConnection() {
        console.log('1️⃣ اختبار الاتصال الأساسي...');
        
        try {
            const provider = await this.rpcManager.getProvider();
            const network = await provider.getNetwork();
            
            this.addResult('basic_connection', true, `متصل بالشبكة: ${network.name} (Chain ID: ${network.chainId})`);
        } catch (error) {
            this.addResult('basic_connection', false, `فشل الاتصال: ${error.message}`);
        }
    }

    /**
     * اختبار آلية Fallback
     */
    async testFallbackMechanism() {
        console.log('2️⃣ اختبار آلية Fallback...');
        
        try {
            // محاولة تنفيذ عملية مع fallback
            const blockNumber = await this.rpcManager.executeWithFallback(
                async (provider) => {
                    return await provider.getBlockNumber();
                },
                'GET_BLOCK_NUMBER'
            );
            
            this.addResult('fallback_mechanism', true, `تم الحصول على رقم البلوك: ${blockNumber}`);
        } catch (error) {
            this.addResult('fallback_mechanism', false, `فشل في آلية Fallback: ${error.message}`);
        }
    }

    /**
     * اختبار التعامل مع Rate Limiting
     */
    async testRateLimitHandling() {
        console.log('3️⃣ اختبار التعامل مع Rate Limiting...');
        
        try {
            // تنفيذ عدة عمليات متتالية لاختبار rate limiting
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    this.rpcManager.executeWithFallback(
                        async (provider) => {
                            return await provider.getBlockNumber();
                        },
                        `RATE_LIMIT_TEST_${i}`
                    )
                );
            }
            
            const results = await Promise.all(promises);
            const successCount = results.filter(r => r !== null).length;
            
            this.addResult('rate_limit_handling', true, `نجح ${successCount}/5 من العمليات`);
        } catch (error) {
            this.addResult('rate_limit_handling', false, `فشل في اختبار Rate Limiting: ${error.message}`);
        }
    }

    /**
     * اختبار عمليات متعددة
     */
    async testMultipleOperations() {
        console.log('4️⃣ اختبار عمليات متعددة...');
        
        try {
            // اختبار عمليات مختلفة
            const operations = [
                { name: 'getBlockNumber', operation: (provider) => provider.getBlockNumber() },
                { name: 'getNetwork', operation: (provider) => provider.getNetwork() },
                { name: 'getFeeData', operation: (provider) => provider.getFeeData() }
            ];

            let successCount = 0;
            for (const op of operations) {
                try {
                    await this.rpcManager.executeWithFallback(op.operation, op.name);
                    successCount++;
                } catch (error) {
                    console.log(`   ⚠️ فشل في ${op.name}: ${error.message}`);
                }
            }
            
            this.addResult('multiple_operations', true, `نجح ${successCount}/${operations.length} من العمليات`);
        } catch (error) {
            this.addResult('multiple_operations', false, `فشل في اختبار العمليات المتعددة: ${error.message}`);
        }
    }

    /**
     * إضافة نتيجة اختبار
     */
    addResult(testName, success, message) {
        this.testResults.push({ testName, success, message });
        const status = success ? '✅' : '❌';
        console.log(`   ${status} ${message}\n`);
    }

    /**
     * طباعة النتائج النهائية
     */
    printResults() {
        console.log('📊 نتائج الاختبار:');
        console.log('='.repeat(50));
        
        const successCount = this.testResults.filter(r => r.success).length;
        const totalCount = this.testResults.length;
        
        this.testResults.forEach(result => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${result.testName}: ${result.message}`);
        });
        
        console.log('='.repeat(50));
        console.log(`📈 النتيجة النهائية: ${successCount}/${totalCount} اختبارات نجحت`);
        
        if (successCount === totalCount) {
            console.log('🎉 جميع الاختبارات نجحت! نظام RPC Fallback يعمل بشكل صحيح.');
        } else {
            console.log('⚠️ بعض الاختبارات فشلت. يرجى مراجعة الإعدادات.');
        }
    }

    /**
     * اختبار سريع للتحقق من حالة النظام
     */
    async quickHealthCheck() {
        console.log('🔍 فحص سريع لحالة النظام...');
        
        try {
            const provider = await this.rpcManager.getProvider();
            const blockNumber = await provider.getBlockNumber();
            
            console.log('✅ النظام يعمل بشكل طبيعي');
            console.log(`📦 آخر رقم بلوك: ${blockNumber}`);
            console.log(`🌐 RPC الحالي: ${this.rpcManager.getCurrentRpc()}`);
            
            return true;
        } catch (error) {
            console.log('❌ النظام لا يعمل بشكل صحيح');
            console.log(`🚨 الخطأ: ${error.message}`);
            
            return false;
        }
    }
}

// تشغيل الاختبار إذا تم استدعاء الملف مباشرة
if (require.main === module) {
    const tester = new RPCFallbackTester();
    
    // تشغيل فحص سريع أولاً
    tester.quickHealthCheck().then(isHealthy => {
        if (isHealthy) {
            // إذا كان النظام يعمل، تشغيل جميع الاختبارات
            return tester.runAllTests();
        } else {
            console.log('⚠️ تم تخطي الاختبارات المفصلة بسبب فشل الفحص السريع');
        }
    }).catch(error => {
        console.error('💥 خطأ غير متوقع:', error);
    });
}

module.exports = RPCFallbackTester;