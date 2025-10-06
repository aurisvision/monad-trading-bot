const { ethers } = require('ethers');
const { secureLogger } = require('./secureLogger');

class RPCManager {
    constructor() {
        // RPC endpoints بالترتيب حسب الأولوية
        this.rpcEndpoints = [
            process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
            'https://lb.drpc.live/monad-testnet/AuKJ2niSbUfnkBV_Go7QZm7JL68eouQR8IE-wg8TMB_n',
            'https://rpc.ankr.com/monad_testnet',
            'https://rpc-testnet.monad.xyz',
            'https://testnet.monad.network',
            'https://monad-testnet.drpc.org'
        ];
        
        // تتبع حالة كل RPC
        this.rpcStatus = {};
        this.currentRpcIndex = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        
        // إعدادات الشبكة
        this.networkConfig = {
            chainId: parseInt(process.env.CHAIN_ID) || 10143,
            name: 'monad-testnet'
        };
        
        // تهيئة حالة RPC endpoints
        this.initializeRpcStatus();
        
        secureLogger.info('RPCManager initialized', {
            endpoints: this.rpcEndpoints.length,
            primaryRpc: this.rpcEndpoints[0]
        });
    }
    
    /**
     * تهيئة حالة RPC endpoints
     */
    initializeRpcStatus() {
        this.rpcEndpoints.forEach((endpoint, index) => {
            this.rpcStatus[endpoint] = {
                isHealthy: true,
                lastError: null,
                errorCount: 0,
                lastChecked: Date.now(),
                responseTime: 0
            };
        });
    }
    
    /**
     * الحصول على provider مع fallback
     */
    async getProvider() {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            const rpcUrl = this.getCurrentRpc();
            
            try {
                const provider = new ethers.JsonRpcProvider(rpcUrl, this.networkConfig);
                
                // اختبار الاتصال
                const startTime = Date.now();
                await provider.getNetwork();
                const responseTime = Date.now() - startTime;
                
                // تحديث حالة RPC
                this.updateRpcStatus(rpcUrl, true, null, responseTime);
                
                secureLogger.debug('RPC connection successful', {
                    rpcUrl: this.maskRpcUrl(rpcUrl),
                    responseTime,
                    attempt: attempt + 1
                });
                
                return provider;
                
            } catch (error) {
                secureLogger.warn('RPC connection failed', {
                    rpcUrl: this.maskRpcUrl(rpcUrl),
                    error: error.message,
                    attempt: attempt + 1
                });
                
                // تحديث حالة RPC
                this.updateRpcStatus(rpcUrl, false, error.message);
                
                // التبديل إلى RPC التالي
                this.switchToNextRpc();
                
                // انتظار قبل المحاولة التالية
                if (attempt < this.maxRetries - 1) {
                    await this.delay(this.retryDelay * (attempt + 1));
                }
            }
        }
        
        throw new Error('All RPC endpoints failed after maximum retries');
    }
    
    /**
     * تنفيذ طلب مع fallback
     */
    async executeWithFallback(operation, operationName = 'RPC_OPERATION') {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const provider = await this.getProvider();
                const startTime = Date.now();
                
                const result = await operation(provider);
                
                const responseTime = Date.now() - startTime;
                secureLogger.debug(`${operationName} successful`, {
                    rpcUrl: this.maskRpcUrl(this.getCurrentRpc()),
                    responseTime,
                    attempt: attempt + 1
                });
                
                return result;
                
            } catch (error) {
                const isRateLimitError = this.isRateLimitError(error);
                const isNetworkError = this.isNetworkError(error);
                
                secureLogger.warn(`${operationName} failed`, {
                    rpcUrl: this.maskRpcUrl(this.getCurrentRpc()),
                    error: error.message,
                    isRateLimitError,
                    isNetworkError,
                    attempt: attempt + 1
                });
                
                // إذا كان rate limiting، انتقل فوراً إلى RPC التالي
                if (isRateLimitError) {
                    this.markRpcAsRateLimited(this.getCurrentRpc());
                    this.switchToNextRpc();
                    
                    // انتظار أقصر للـ rate limiting
                    if (attempt < this.maxRetries - 1) {
                        await this.delay(500);
                    }
                    continue;
                }
                
                // للأخطاء الأخرى، جرب RPC التالي
                if (isNetworkError && attempt < this.maxRetries - 1) {
                    this.switchToNextRpc();
                    await this.delay(this.retryDelay * (attempt + 1));
                    continue;
                }
                
                // إذا كانت المحاولة الأخيرة، ارمي الخطأ
                if (attempt === this.maxRetries - 1) {
                    throw error;
                }
            }
        }
    }
    
    /**
     * فحص إذا كان الخطأ rate limiting
     */
    isRateLimitError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return errorMessage.includes('rate limit') || 
               errorMessage.includes('too many requests') ||
               errorMessage.includes('request limit reached') ||
               error.code === -32007;
    }
    
    /**
     * فحص إذا كان الخطأ network error
     */
    isNetworkError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return errorMessage.includes('network') ||
               errorMessage.includes('timeout') ||
               errorMessage.includes('connection') ||
               errorMessage.includes('fetch');
    }
    
    /**
     * تحديد RPC كـ rate limited
     */
    markRpcAsRateLimited(rpcUrl) {
        if (this.rpcStatus[rpcUrl]) {
            this.rpcStatus[rpcUrl].isHealthy = false;
            this.rpcStatus[rpcUrl].lastError = 'Rate limited';
            this.rpcStatus[rpcUrl].errorCount++;
            
            // إعادة تفعيل RPC بعد 60 ثانية
            setTimeout(() => {
                if (this.rpcStatus[rpcUrl]) {
                    this.rpcStatus[rpcUrl].isHealthy = true;
                    this.rpcStatus[rpcUrl].lastError = null;
                    secureLogger.info('RPC re-enabled after rate limit cooldown', {
                        rpcUrl: this.maskRpcUrl(rpcUrl)
                    });
                }
            }, 60000); // 60 seconds
        }
    }
    
    /**
     * تحديث حالة RPC
     */
    updateRpcStatus(rpcUrl, isHealthy, error = null, responseTime = 0) {
        if (this.rpcStatus[rpcUrl]) {
            this.rpcStatus[rpcUrl].isHealthy = isHealthy;
            this.rpcStatus[rpcUrl].lastError = error;
            this.rpcStatus[rpcUrl].lastChecked = Date.now();
            this.rpcStatus[rpcUrl].responseTime = responseTime;
            
            if (!isHealthy) {
                this.rpcStatus[rpcUrl].errorCount++;
            } else {
                this.rpcStatus[rpcUrl].errorCount = 0;
            }
        }
    }
    
    /**
     * الحصول على RPC الحالي
     */
    getCurrentRpc() {
        return this.rpcEndpoints[this.currentRpcIndex];
    }
    
    /**
     * التبديل إلى RPC التالي
     */
    switchToNextRpc() {
        const previousRpc = this.getCurrentRpc();
        this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcEndpoints.length;
        const newRpc = this.getCurrentRpc();
        
        secureLogger.info('Switching RPC endpoint', {
            from: this.maskRpcUrl(previousRpc),
            to: this.maskRpcUrl(newRpc)
        });
    }
    
    /**
     * إخفاء URL للأمان في اللوجز
     */
    maskRpcUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}`;
        } catch {
            return 'unknown';
        }
    }
    
    /**
     * انتظار لفترة محددة
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * الحصول على حالة جميع RPC endpoints
     */
    getRpcStatus() {
        return Object.entries(this.rpcStatus).map(([url, status]) => ({
            url: this.maskRpcUrl(url),
            isHealthy: status.isHealthy,
            lastError: status.lastError,
            errorCount: status.errorCount,
            responseTime: status.responseTime,
            lastChecked: new Date(status.lastChecked).toISOString()
        }));
    }
    
    /**
     * إعادة تعيين حالة جميع RPC endpoints
     */
    resetAllRpcStatus() {
        this.initializeRpcStatus();
        this.currentRpcIndex = 0;
        secureLogger.info('All RPC status reset');
    }
}

module.exports = RPCManager;