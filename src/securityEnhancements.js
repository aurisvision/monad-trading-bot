// Enhanced security utilities for Area51 Bot
const crypto = require('crypto');

class SecurityEnhancements {
    constructor() {
        this.suspiciousPatterns = [
            /script/i,
            /javascript/i,
            /eval/i,
            /exec/i,
            /<script/i,
            /on\w+=/i,
            /data:/i,
            /vbscript/i
        ];
    }

    // Enhanced input validation
    validateInput(input, type = 'general') {
        if (typeof input !== 'string') return false;
        
        // Length validation
        const maxLengths = {
            general: 1000,
            address: 42,
            amount: 50,
            mnemonic: 500
        };
        
        if (input.length > (maxLengths[type] || maxLengths.general)) {
            return false;
        }
        
        // Check for suspicious patterns
        for (const pattern of this.suspiciousPatterns) {
            if (pattern.test(input)) {
                return false;
            }
        }
        
        // Type-specific validation
        switch (type) {
            case 'address':
                return /^0x[a-fA-F0-9]{40}$/.test(input);
            case 'amount':
                const num = parseFloat(input);
                return !isNaN(num) && num > 0 && num < 1e18;
            case 'mnemonic':
                const words = input.trim().split(' ');
                return words.length === 12 || words.length === 24;
            default:
                return true;
        }
    }

    // Secure message formatting
    formatSecureMessage(message, sensitiveData = {}) {
        let secureMessage = message;
        
        // Mask sensitive data
        Object.keys(sensitiveData).forEach(key => {
            const value = sensitiveData[key];
            if (typeof value === 'string' && value.length > 10) {
                const masked = value.substring(0, 6) + '...' + value.substring(value.length - 4);
                secureMessage = secureMessage.replace(new RegExp(value, 'g'), masked);
            }
        });
        
        return secureMessage;
    }

    // Generate secure temporary token
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Rate limiting check with Redis
    async checkRateLimit(userId, action, redis, limits = {}) {
        const defaultLimits = {
            requests: { window: 60000, max: 60 }, // 60 requests per minute
            transactions: { window: 3600000, max: 100 }, // 100 transactions per hour
            exports: { window: 3600000, max: 5 } // 5 exports per hour
        };
        
        const limit = limits[action] || defaultLimits[action] || defaultLimits.requests;
        const key = `rate_limit:${userId}:${action}`;
        
        try {
            if (!redis) return true; // Fallback if Redis not available
            
            const current = await redis.get(key);
            const count = current ? parseInt(current) : 0;
            
            if (count >= limit.max) {
                return false; // Rate limit exceeded
            }
            
            // Increment counter
            const newCount = count + 1;
            await redis.setex(key, Math.ceil(limit.window / 1000), newCount);
            
            return true;
        } catch (error) {
            console.error('Rate limiting error:', error);
            return true; // Allow on error to prevent blocking users
        }
    }

    // Sanitize log data
    sanitizeLogData(data) {
        const sanitized = { ...data };
        
        // Remove or mask sensitive fields
        const sensitiveFields = ['privateKey', 'private_key', 'mnemonic', 'password', 'secret'];
        
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                if (typeof sanitized[field] === 'string' && sanitized[field].length > 6) {
                    sanitized[field] = sanitized[field].substring(0, 3) + '***';
                } else {
                    sanitized[field] = '***';
                }
            }
        });
        
        return sanitized;
    }

    // Validate transaction data
    validateTransactionData(txData) {
        if (!txData || typeof txData !== 'object') {
            return { valid: false, error: 'Invalid transaction data' };
        }
        
        // Check required fields
        const requiredFields = ['to', 'data'];
        for (const field of requiredFields) {
            if (!txData[field] || txData[field] === '') {
                return { valid: false, error: `Missing or empty ${field} field` };
            }
        }
        
        // Validate 'to' address
        if (!this.validateInput(txData.to, 'address')) {
            return { valid: false, error: 'Invalid recipient address' };
        }
        
        // Validate data field
        if (typeof txData.data !== 'string' || !txData.data.startsWith('0x')) {
            return { valid: false, error: 'Invalid transaction data format' };
        }
        
        return { valid: true };
    }

    // Check for suspicious activity patterns
    detectSuspiciousActivity(userId, action, metadata = {}) {
        const suspiciousIndicators = [];
        
        // Check for rapid successive actions
        if (metadata.timeSinceLastAction && metadata.timeSinceLastAction < 1000) {
            suspiciousIndicators.push('Rapid successive actions');
        }
        
        // Check for unusual amounts
        if (metadata.amount && parseFloat(metadata.amount) > 1000000) {
            suspiciousIndicators.push('Unusually large amount');
        }
        
        // Check for multiple wallet operations
        if (action === 'wallet_export' && metadata.exportCount > 3) {
            suspiciousIndicators.push('Multiple wallet exports');
        }
        
        return {
            suspicious: suspiciousIndicators.length > 0,
            indicators: suspiciousIndicators,
            riskLevel: suspiciousIndicators.length > 2 ? 'high' : 
                      suspiciousIndicators.length > 0 ? 'medium' : 'low'
        };
    }

    // Secure error handling
    handleSecureError(error, context = {}) {
        // Log the full error securely
        const sanitizedContext = this.sanitizeLogData(context);
        console.error('Secure error:', {
            message: error.message,
            context: sanitizedContext,
            timestamp: new Date().toISOString()
        });
        
        // Return user-safe error message
        const userSafeMessages = {
            'Decryption failed': 'Unable to access wallet. Please check your credentials.',
            'Invalid private key': 'Invalid wallet credentials provided.',
            'Network error': 'Network connection issue. Please try again.',
            'Insufficient balance': 'Insufficient balance for this transaction.'
        };
        
        return userSafeMessages[error.message] || 'An error occurred. Please try again.';
    }
}

module.exports = SecurityEnhancements;
