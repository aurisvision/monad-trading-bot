#!/usr/bin/env node
// 🔒 Security Check Script - Area51 Bot
// Validates security configuration before deployment

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityChecker {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
        this.envFile = '.env';
    }

    log(level, message, details = '') {
        const timestamp = new Date().toISOString();
        const emoji = {
            'error': '❌',
            'warning': '⚠️',
            'success': '✅',
            'info': 'ℹ️'
        };
        
        console.log(`${emoji[level]} [${timestamp}] ${message}`);
        if (details) console.log(`   ${details}`);
    }

    async runAllChecks() {
        console.log('🔒 Starting Security Check for Area51 Bot...\n');
        
        // Load environment variables
        if (!this.loadEnvironment()) {
            return false;
        }

        // Run security checks
        this.checkEncryptionKey();
        this.checkDatabaseSecurity();
        this.checkRedisSecurity();
        this.checkTelegramConfig();
        this.checkSSLConfiguration();
        this.checkFilePermissions();
        this.checkDefaultPasswords();
        this.checkEnvironmentSettings();
        this.checkBackupSecurity();
        this.checkLoggingSecurity();

        // Display results
        this.displayResults();
        
        return this.errors.length === 0;
    }

    loadEnvironment() {
        const envPath = path.join(process.cwd(), this.envFile);
        
        if (!fs.existsSync(envPath)) {
            this.log('error', `Environment file not found: ${this.envFile}`);
            this.log('info', 'Copy .env.production.example to .env.production and configure it');
            return false;
        }

        try {
            require('dotenv').config({ path: envPath });
            this.log('success', `Loaded environment from ${this.envFile}`);
            return true;
        } catch (error) {
            this.log('error', 'Failed to load environment file', error.message);
            return false;
        }
    }

    checkEncryptionKey() {
        const key = process.env.ENCRYPTION_KEY;
        
        if (!key) {
            this.errors.push('ENCRYPTION_KEY is not set');
            return;
        }

        if (key.length !== 32) {
            this.errors.push(`ENCRYPTION_KEY must be exactly 32 characters (current: ${key.length})`);
            return;
        }

        if (key === 'CHANGE_THIS_TO_32_CHAR_RANDOM_KEY') {
            this.errors.push('ENCRYPTION_KEY is still using default value');
            return;
        }

        // Check entropy
        const entropy = this.calculateEntropy(key);
        if (entropy < 4.0) {
            this.warnings.push(`ENCRYPTION_KEY has low entropy (${entropy.toFixed(2)}). Consider using a more random key.`);
        }

        this.passed.push('ENCRYPTION_KEY is properly configured');
    }

    checkDatabaseSecurity() {
        const host = process.env.POSTGRES_HOST;
        const password = process.env.POSTGRES_PASSWORD;
        const sslMode = process.env.POSTGRES_SSL_MODE;

        if (!password || password === 'CHANGE_THIS_TO_STRONG_DB_PASSWORD') {
            this.errors.push('POSTGRES_PASSWORD is not set or using default value');
        } else if (password.length < 12) {
            this.warnings.push('POSTGRES_PASSWORD should be at least 12 characters long');
        } else {
            this.passed.push('Database password is configured');
        }

        if (process.env.NODE_ENV === 'production') {
            if (!sslMode || sslMode === 'disable') {
                this.errors.push('SSL is disabled for database in production mode');
            } else if (sslMode === 'require') {
                this.passed.push('Database SSL is properly configured');
            }
        }

        if (host === 'localhost' && process.env.NODE_ENV === 'production') {
            this.warnings.push('Database host is localhost in production mode');
        }
    }

    checkRedisSecurity() {
        const password = process.env.REDIS_PASSWORD;
        const host = process.env.REDIS_HOST;

        if (!password || password === 'CHANGE_THIS_TO_STRONG_REDIS_PASSWORD') {
            this.warnings.push('REDIS_PASSWORD is not set or using default value');
        } else {
            this.passed.push('Redis password is configured');
        }

        if (host === 'localhost' && process.env.NODE_ENV === 'production') {
            this.warnings.push('Redis host is localhost in production mode');
        }
    }

    checkTelegramConfig() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const adminChatId = process.env.ADMIN_CHAT_ID;

        if (!token || token === 'your_telegram_bot_token_here') {
            this.errors.push('TELEGRAM_BOT_TOKEN is not configured');
        } else if (!token.match(/^\d+:[a-zA-Z0-9_-]{35}$/)) {
            this.errors.push('TELEGRAM_BOT_TOKEN format appears invalid');
        } else {
            this.passed.push('Telegram bot token is configured');
        }

        if (!adminChatId || adminChatId === 'your_telegram_admin_chat_id') {
            this.warnings.push('ADMIN_CHAT_ID is not configured (alerts will not work)');
        } else {
            this.passed.push('Admin chat ID is configured');
        }
    }

    checkSSLConfiguration() {
        const sslEnabled = process.env.SSL_ENABLED === 'true';
        const certPath = process.env.SSL_CERT_PATH;
        const keyPath = process.env.SSL_KEY_PATH;

        if (sslEnabled) {
            if (!certPath || !keyPath) {
                this.errors.push('SSL is enabled but certificate paths are not configured');
            } else if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
                this.errors.push('SSL certificate files do not exist');
            } else {
                this.passed.push('SSL configuration is valid');
            }
        }
    }

    checkFilePermissions() {
        const envPath = path.join(process.cwd(), this.envFile);
        
        try {
            const stats = fs.statSync(envPath);
            const mode = stats.mode & parseInt('777', 8);
            
            if (mode > parseInt('600', 8)) {
                this.warnings.push(`Environment file permissions are too open (${mode.toString(8)}). Recommended: 600`);
            } else {
                this.passed.push('Environment file permissions are secure');
            }
        } catch (error) {
            this.warnings.push('Could not check file permissions');
        }
    }

    checkDefaultPasswords() {
        const defaultValues = [
            { key: 'GRAFANA_ADMIN_PASSWORD', default: 'CHANGE_THIS_TO_STRONG_GRAFANA_PASSWORD' },
            { key: 'BACKUP_ENCRYPTION_KEY', default: 'CHANGE_THIS_TO_BACKUP_ENCRYPTION_KEY' },
            { key: 'SMTP_PASSWORD', default: 'your_app_password' }
        ];

        defaultValues.forEach(({ key, default: defaultValue }) => {
            const value = process.env[key];
            if (value === defaultValue) {
                this.warnings.push(`${key} is using default value`);
            }
        });
    }

    checkEnvironmentSettings() {
        const nodeEnv = process.env.NODE_ENV;
        const debugMode = process.env.DEBUG_MODE;
        const testEndpoints = process.env.ENABLE_TEST_ENDPOINTS;

        if (nodeEnv !== 'production' && process.argv.includes('--production-check')) {
            this.errors.push('NODE_ENV is not set to production');
        }

        if (debugMode === 'true' && nodeEnv === 'production') {
            this.warnings.push('DEBUG_MODE is enabled in production');
        }

        if (testEndpoints === 'true' && nodeEnv === 'production') {
            this.errors.push('Test endpoints are enabled in production');
        }
    }

    checkBackupSecurity() {
        const backupEnabled = process.env.BACKUP_ENABLED === 'true';
        const backupKey = process.env.BACKUP_ENCRYPTION_KEY;

        if (backupEnabled && (!backupKey || backupKey === 'CHANGE_THIS_TO_BACKUP_ENCRYPTION_KEY')) {
            this.errors.push('Backup encryption key is not configured');
        }
    }

    checkLoggingSecurity() {
        const logLevel = process.env.LOG_LEVEL;
        const verboseLogging = process.env.VERBOSE_LOGGING;

        if (verboseLogging === 'true' && process.env.NODE_ENV === 'production') {
            this.warnings.push('Verbose logging is enabled in production (may leak sensitive data)');
        }

        if (!logLevel) {
            this.warnings.push('LOG_LEVEL is not set (defaulting to info)');
        }
    }

    calculateEntropy(str) {
        const freq = {};
        for (let char of str) {
            freq[char] = (freq[char] || 0) + 1;
        }
        
        let entropy = 0;
        const len = str.length;
        
        for (let char in freq) {
            const p = freq[char] / len;
            entropy -= p * Math.log2(p);
        }
        
        return entropy;
    }

    displayResults() {
        console.log('\n' + '='.repeat(60));
        console.log('🔒 SECURITY CHECK RESULTS');
        console.log('='.repeat(60));

        if (this.passed.length > 0) {
            console.log('\n✅ PASSED CHECKS:');
            this.passed.forEach(check => console.log(`   ✅ ${check}`));
        }

        if (this.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.warnings.forEach(warning => console.log(`   ⚠️  ${warning}`));
        }

        if (this.errors.length > 0) {
            console.log('\n❌ CRITICAL ERRORS:');
            this.errors.forEach(error => console.log(`   ❌ ${error}`));
        }

        console.log('\n' + '='.repeat(60));
        console.log(`📊 SUMMARY: ${this.passed.length} passed, ${this.warnings.length} warnings, ${this.errors.length} errors`);
        
        if (this.errors.length === 0) {
            console.log('🎉 Security check PASSED! Ready for deployment.');
        } else {
            console.log('🚫 Security check FAILED! Fix errors before deployment.');
        }
        
        console.log('='.repeat(60));
    }
}

// Run security check
if (require.main === module) {
    const checker = new SecurityChecker();
    checker.runAllChecks().then(passed => {
        process.exit(passed ? 0 : 1);
    }).catch(error => {
        console.error('❌ Security check failed:', error);
        process.exit(1);
    });
}

module.exports = SecurityChecker;
