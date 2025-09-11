// Utility functions for Area51 Bot
const crypto = require('crypto');
const { ethers } = require('ethers');

// Parse custom amounts from settings string
function parseCustomAmounts(customAmountsStr) {
    if (!customAmountsStr) {
        return [0.1, 0.5, 1, 5]; // Default amounts
    }
    
    try {
        const amounts = customAmountsStr.split(',').map(amount => parseFloat(amount.trim()));
        return amounts.filter(amount => !isNaN(amount) && amount > 0);
    } catch (error) {
        return [0.1, 0.5, 1, 5]; // Default amounts on error
    }
}

class BotUtils {
    constructor(monitoring) {
        this.monitoring = monitoring;
    }

    // Format numbers for display
    formatNumber(num, decimals = 6) {
        if (typeof num !== 'number' || isNaN(num)) {
            return '0';
        }
        
        if (num === 0) return '0';
        
        // For very small numbers, use scientific notation
        if (num < 0.000001 && num > 0) {
            return num.toExponential(2);
        }
        
        // For large numbers, use compact notation
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M';
        }
        
        if (num >= 1000) {
            return (num / 1000).toFixed(2) + 'K';
        }
        
        return num.toFixed(decimals);
    }

    // Format currency values
    formatCurrency(amount, currency = 'USD', decimals = 2) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return '$0.00';
        }

        if (currency === 'USD') {
            return `$${this.formatNumber(amount, decimals)}`;
        }
        
        return `${this.formatNumber(amount, decimals)} ${currency}`;
    }

    // Format MON amounts
    formatMON(amount, decimals = 6) {
        return `${this.formatNumber(amount, decimals)} MON`;
    }

    // Validate Ethereum address
    isValidAddress(address) {
        try {
            return ethers.utils.isAddress(address);
        } catch (error) {
            return false;
        }
    }

    // Validate private key
    isValidPrivateKey(privateKey) {
        try {
            // Remove 0x prefix if present
            const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
            
            // Check if it's 64 hex characters
            if (!/^[a-fA-F0-9]{64}$/.test(cleanKey)) {
                return false;
            }
            
            // Try to create wallet from private key
            new ethers.Wallet(privateKey);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Validate mnemonic phrase
    isValidMnemonic(mnemonic) {
        try {
            return ethers.utils.isValidMnemonic(mnemonic);
        } catch (error) {
            return false;
        }
    }

    // Generate secure random string
    generateSecureRandom(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Encrypt sensitive data
    encryptData(data, key) {
        try {
            const algorithm = 'aes-256-gcm';
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(algorithm, key);
            
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            this.monitoring.logError('Encryption failed', error);
            throw new Error('Encryption failed');
        }
    }

    // Decrypt sensitive data
    decryptData(encryptedData, key) {
        try {
            const algorithm = 'aes-256-gcm';
            const decipher = crypto.createDecipher(algorithm, key);
            
            if (encryptedData.authTag) {
                decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            }
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            this.monitoring.logError('Decryption failed', error);
            throw new Error('Decryption failed');
        }
    }

    // Sanitize user input
    sanitizeInput(input) {
        if (typeof input !== 'string') {
            return '';
        }
        
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .substring(0, 1000); // Limit length
    }

    // Parse amount from user input
    parseAmount(input) {
        if (typeof input !== 'string') {
            return null;
        }
        
        // Remove whitespace and common currency symbols
        const cleaned = input.trim().replace(/[$,\s]/g, '');
        
        // Check for percentage
        if (cleaned.endsWith('%')) {
            const percentage = parseFloat(cleaned.slice(0, -1));
            if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                return null;
            }
            return { type: 'percentage', value: percentage };
        }
        
        // Parse as regular number
        const amount = parseFloat(cleaned);
        if (isNaN(amount) || amount < 0) {
            return null;
        }
        
        return { type: 'amount', value: amount };
    }

    // Calculate percentage of amount
    calculatePercentage(total, percentage) {
        if (typeof total !== 'number' || typeof percentage !== 'number') {
            return 0;
        }
        
        return (total * percentage) / 100;
    }

    // Calculate price impact
    calculatePriceImpact(inputAmount, outputAmount, inputPrice, outputPrice) {
        try {
            const expectedOutput = inputAmount * (inputPrice / outputPrice);
            const impact = ((expectedOutput - outputAmount) / expectedOutput) * 100;
            return Math.max(0, impact);
        } catch (error) {
            return 0;
        }
    }

    // Format time duration
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        }
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    // Generate transaction hash (for display purposes)
    generateTxHash() {
        return '0x' + crypto.randomBytes(32).toString('hex');
    }

    // Validate slippage value
    isValidSlippage(slippage) {
        const num = parseFloat(slippage);
        return !isNaN(num) && num >= 0.1 && num <= 50; // 0.1% to 50%
    }

    // Convert slippage to basis points
    slippageToBasisPoints(slippage) {
        return Math.round(parseFloat(slippage) * 100);
    }

    // Format slippage for display
    formatSlippage(basisPoints) {
        return (basisPoints / 100).toFixed(1) + '%';
    }

    // Retry function with exponential backoff
    async retry(fn, maxAttempts = 3, baseDelay = 1000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                const delay = baseDelay * Math.pow(2, attempt - 1);
                this.monitoring.logWarning(`Retry attempt ${attempt} failed, retrying in ${delay}ms`, { error: error.message });
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Deep clone object
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        
        if (obj instanceof Array) {
            return obj.map(item => this.deepClone(item));
        }
        
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    // Check if object is empty
    isEmpty(obj) {
        if (obj == null) return true;
        if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
        return Object.keys(obj).length === 0;
    }

    // Generate user-friendly error messages
    getUserFriendlyError(error) {
        const message = error.message || error.toString();
        
        if (message.includes('insufficient funds')) {
            return '❌ Insufficient balance for this transaction.';
        }
        
        if (message.includes('slippage')) {
            return '❌ Price moved too much. Try increasing slippage tolerance.';
        }
        
        if (message.includes('network')) {
            return '❌ Network error. Please try again in a moment.';
        }
        
        if (message.includes('timeout')) {
            return '❌ Request timed out. Please try again.';
        }
        
        if (message.includes('rate limit')) {
            return '❌ Too many requests. Please wait a moment.';
        }
        
        return '❌ An error occurred. Please try again or contact support.';
    }

    // Validate and format token symbol
    formatTokenSymbol(symbol) {
        if (typeof symbol !== 'string') {
            return '';
        }
        
        return symbol.trim().toUpperCase().substring(0, 20);
    }

    // Generate cache key
    generateCacheKey(prefix, ...parts) {
        return `${prefix}:${parts.join(':')}`;
    }

    // Check if value is numeric
    isNumeric(value) {
        return !isNaN(parseFloat(value)) && isFinite(value);
    }
}

module.exports = { BotUtils, parseCustomAmounts };
