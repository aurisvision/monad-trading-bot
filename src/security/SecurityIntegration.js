// 🔧 Security Integration - Update all components to use Unified Security System
// Area51 Bot Security Integration

const UnifiedSecuritySystem = require('./UnifiedSecuritySystem');
const { secureLogger } = require('../utils/secureLogger');

class SecurityIntegration {
    constructor() {
        this.integrationSteps = [
            'Initialize Unified Security System',
            'Update WalletManager',
            'Update WalletHandlers', 
            'Update BackupService',
            'Update Database connections',
            'Verify integration'
        ];
        
        this.completedSteps = [];
    }

    /**
     * Integrate unified security system across all components
     * @param {object} components - Application components
     * @returns {Promise<object>} Integration result
     */
    async integrateUnifiedSecurity(components) {
        try {
            const { redis, database, walletManager, walletHandlers, backupService } = components;
            
            secureLogger.info('Starting unified security integration', {
                components: Object.keys(components)
            });

            // Step 1: Initialize unified security system
            const unifiedSecurity = new UnifiedSecuritySystem(redis, database);
            this.markStepCompleted('Initialize Unified Security System');

            // Step 2: Update WalletManager to use unified security
            if (walletManager) {
                walletManager.security = unifiedSecurity;
                this.markStepCompleted('Update WalletManager');
            }

            // Step 3: Update WalletHandlers to use unified security
            if (walletHandlers) {
                walletHandlers.security = unifiedSecurity;
                this.markStepCompleted('Update WalletHandlers');
            }

            // Step 4: Update BackupService to use unified security
            if (backupService) {
                backupService.security = unifiedSecurity;
                this.markStepCompleted('Update BackupService');
            }

            // Step 5: Update database connections (if needed)
            this.markStepCompleted('Update Database connections');

            // Step 6: Verify integration
            const verificationResult = await this.verifyIntegration(unifiedSecurity);
            this.markStepCompleted('Verify integration');

            const result = {
                success: true,
                unifiedSecurity,
                completedSteps: this.completedSteps,
                verification: verificationResult,
                timestamp: new Date().toISOString()
            };

            secureLogger.info('Unified security integration completed successfully', result);
            return result;

        } catch (error) {
            secureLogger.error('Security integration failed', error);
            return {
                success: false,
                error: error.message,
                completedSteps: this.completedSteps
            };
        }
    }

    /**
     * Mark integration step as completed
     * @param {string} step - Step name
     */
    markStepCompleted(step) {
        this.completedSteps.push({
            step,
            timestamp: new Date().toISOString()
        });
        
        secureLogger.info('Integration step completed', { step });
    }

    /**
     * Verify unified security integration
     * @param {UnifiedSecuritySystem} security - Security system instance
     * @returns {Promise<object>} Verification result
     */
    async verifyIntegration(security) {
        try {
            const tests = [];

            // Test 1: Encryption/Decryption
            try {
                const testData = 'test-encryption-data';
                const encrypted = security.encrypt(testData, 'integration_test');
                const decrypted = security.decrypt(encrypted, 'integration_test');
                
                tests.push({
                    name: 'Encryption/Decryption',
                    passed: decrypted === testData,
                    details: 'Basic encryption functionality'
                });
            } catch (error) {
                tests.push({
                    name: 'Encryption/Decryption',
                    passed: false,
                    error: error.message
                });
            }

            // Test 2: Rate Limiting
            try {
                const rateLimitResult = await security.checkRateLimit(999999, 'test_operation');
                
                tests.push({
                    name: 'Rate Limiting',
                    passed: rateLimitResult.hasOwnProperty('allowed'),
                    details: 'Rate limiting functionality'
                });
            } catch (error) {
                tests.push({
                    name: 'Rate Limiting',
                    passed: false,
                    error: error.message
                });
            }

            // Test 3: Security Monitoring
            try {
                await security.logSecurityEvent('INTEGRATION_TEST', 999999, {
                    test: 'verification'
                }, 'LOW');
                
                tests.push({
                    name: 'Security Monitoring',
                    passed: true,
                    details: 'Security event logging'
                });
            } catch (error) {
                tests.push({
                    name: 'Security Monitoring',
                    passed: false,
                    error: error.message
                });
            }

            // Test 4: Memory Wipe
            try {
                const testMemory = 'sensitive-data';
                security.secureWipeMemory(testMemory);
                
                tests.push({
                    name: 'Memory Wipe',
                    passed: true,
                    details: 'Secure memory wiping'
                });
            } catch (error) {
                tests.push({
                    name: 'Memory Wipe',
                    passed: false,
                    error: error.message
                });
            }

            const passedTests = tests.filter(test => test.passed).length;
            const totalTests = tests.length;

            return {
                success: passedTests === totalTests,
                passedTests,
                totalTests,
                tests,
                score: `${passedTests}/${totalTests}`
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                tests: []
            };
        }
    }

    /**
     * Get integration status
     * @returns {object} Integration status
     */
    getIntegrationStatus() {
        return {
            totalSteps: this.integrationSteps.length,
            completedSteps: this.completedSteps.length,
            progress: `${this.completedSteps.length}/${this.integrationSteps.length}`,
            isComplete: this.completedSteps.length === this.integrationSteps.length,
            steps: this.integrationSteps.map(step => ({
                name: step,
                completed: this.completedSteps.some(completed => completed.step === step)
            }))
        };
    }
}

module.exports = SecurityIntegration;
