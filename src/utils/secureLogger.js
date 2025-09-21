// 🔒 Secure Logger - Prevents sensitive data leakage in logs
// Area51 Bot Security Enhancement

class SecureLogger {
    constructor() {
        // Patterns to detect and sanitize sensitive data
        this.sensitivePatterns = [
            // Private keys (Ethereum format)
            /0x[a-fA-F0-9]{64}/g,
            // Mnemonic phrases (12-24 words)
            /\b(?:[a-z]+\s+){11,23}[a-z]+\b/gi,
            // API keys and tokens
            /(?:api[_-]?key|token|secret)["\s:=]+[a-zA-Z0-9_-]{16,}/gi,
            // Database passwords in connection strings
            /postgresql:\/\/[^:]+:([^@]+)@/gi,
            // Redis passwords
            /redis[^:]*:\/\/[^:]*:([^@]+)@/gi,
            // JWT tokens
            /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
            // Credit card numbers
            /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
            // Email addresses (partial masking)
            /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
        ];

        // Replacement patterns
        this.replacements = [
            '0x[PRIVATE_KEY_REDACTED]',
            '[MNEMONIC_PHRASE_REDACTED]',
            '[API_KEY_REDACTED]',
            'postgresql://user:[PASSWORD_REDACTED]@',
            'redis://user:[PASSWORD_REDACTED]@',
            '[JWT_TOKEN_REDACTED]',
            '[CARD_NUMBER_REDACTED]',
            '$1***@$2'
        ];

        // Sensitive object keys to redact
        this.sensitiveKeys = [
            'privateKey',
            'private_key',
            'mnemonic',
            'password',
            'secret',
            'token',
            'apiKey',
            'api_key',
            'encryptedPrivateKey',
            'encrypted_private_key',
            'encryptedMnemonic',
            'encrypted_mnemonic',
            'seed',
            'passphrase'
        ];
    }

    /**
     * Sanitize sensitive data from any input
     * @param {any} data - Data to sanitize
     * @returns {any} - Sanitized data
     */
    sanitize(data) {
        if (data === null || data === undefined) {
            return data;
        }

        // Handle different data types
        if (typeof data === 'string') {
            return this.sanitizeString(data);
        }

        if (typeof data === 'object') {
            if (data instanceof Error) {
                return this.sanitizeError(data);
            }
            
            if (Array.isArray(data)) {
                return data.map(item => this.sanitize(item));
            }
            
            return this.sanitizeObject(data);
        }

        return data;
    }

    /**
     * Sanitize string content
     * @param {string} str - String to sanitize
     * @returns {string} - Sanitized string
     */
    sanitizeString(str) {
        // Handle null, undefined, or non-string values
        if (typeof str !== 'string') {
            return String(str || '');
        }
        
        let sanitized = str;
        
        // Apply all sensitive patterns
        this.sensitivePatterns.forEach((pattern, index) => {
            try {
                sanitized = sanitized.replace(pattern, this.replacements[index]);
            } catch (error) {
                // Skip pattern if it causes error
                console.warn('Pattern replacement error:', error.message);
            }
        });

        return sanitized;
    }

    /**
     * Sanitize object properties
     * @param {object} obj - Object to sanitize
     * @returns {object} - Sanitized object
     */
    sanitizeObject(obj) {
        const sanitized = {};
        
        for (const [key, value] of Object.entries(obj)) {
            // Check if key is sensitive
            if (this.sensitiveKeys.some(sensitiveKey => 
                key.toLowerCase().includes(sensitiveKey.toLowerCase()))) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = this.sanitize(value);
            }
        }
        
        return sanitized;
    }

    /**
     * Sanitize error objects
     * @param {Error} error - Error to sanitize
     * @returns {object} - Sanitized error object
     */
    sanitizeError(error) {
        const sanitized = {
            name: error.name,
            message: this.sanitizeString(error.message),
            code: error.code,
            // Don't include full stack trace in production
            stack: process.env.NODE_ENV === 'development' ? 
                this.sanitizeString(error.stack || '') : '[STACK_TRACE_REDACTED]'
        };

        // Add any additional error properties (sanitized)
        Object.keys(error).forEach(key => {
            if (!['name', 'message', 'code', 'stack'].includes(key)) {
                sanitized[key] = this.sanitize(error[key]);
            }
        });

        return sanitized;
    }

    /**
     * Create secure log entry
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {any} meta - Additional metadata
     * @returns {object} - Secure log entry
     */
    createLogEntry(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const sanitizedMessage = this.sanitizeString(message);
        const sanitizedMeta = this.sanitize(meta);

        return {
            timestamp,
            level: level.toUpperCase(),
            message: sanitizedMessage,
            meta: sanitizedMeta,
            // Add security marker
            security_sanitized: true
        };
    }

    /**
     * Safe console logging methods
     */
    info(message, meta = {}) {
        const logEntry = this.createLogEntry('info', message, meta);
        console.log(JSON.stringify(logEntry));
    }

    warn(message, meta = {}) {
        const logEntry = this.createLogEntry('warn', message, meta);
        console.warn(JSON.stringify(logEntry));
    }

    error(message, error = null, meta = {}) {
        const logEntry = this.createLogEntry('error', message, {
            error: error ? this.sanitizeError(error) : null,
            ...meta
        });
        console.error(JSON.stringify(logEntry));
    }

    debug(message, meta = {}) {
        if (process.env.NODE_ENV === 'development') {
            const logEntry = this.createLogEntry('debug', message, meta);
            console.debug(JSON.stringify(logEntry));
        }
    }

    /**
     * Test the sanitizer with sample sensitive data
     */
    static test() {
        const logger = new SecureLogger();
        
        console.log('🧪 Testing Secure Logger...');
        
        // Test cases
        const testCases = [
            {
                name: 'Private Key',
                input: 'Error with private key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                expected: 'should be redacted'
            },
            {
                name: 'Mnemonic',
                input: 'Mnemonic: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
                expected: 'should be redacted'
            },
            {
                name: 'Object with sensitive keys',
                input: { privateKey: '0x123...', password: 'secret123', normalData: 'visible' },
                expected: 'privateKey and password should be redacted'
            }
        ];

        testCases.forEach(testCase => {
            console.log(`\n📝 Test: ${testCase.name}`);
            console.log('Input:', testCase.input);
            console.log('Sanitized:', logger.sanitize(testCase.input));
        });
    }
}

module.exports = SecureLogger;

// Export singleton instance
module.exports.secureLogger = new SecureLogger();
