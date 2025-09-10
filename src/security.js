const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

class SecurityManager {
    constructor() {
        this.rateLimiters = new Map();
        this.suspiciousActivities = new Map();
        this.maxFailedAttempts = 5;
        this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
    }

    // Rate limiting for user actions
    checkRateLimit(userId, action, maxRequests = 10, windowMs = 60000) {
        const key = `${userId}_${action}`;
        const now = Date.now();
        
        if (!this.rateLimiters.has(key)) {
            this.rateLimiters.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return { allowed: true, remaining: maxRequests - 1 };
        }
        
        const limiter = this.rateLimiters.get(key);
        
        if (now > limiter.resetTime) {
            // Reset the counter
            limiter.count = 1;
            limiter.resetTime = now + windowMs;
            return { allowed: true, remaining: maxRequests - 1 };
        }
        
        if (limiter.count >= maxRequests) {
            return { 
                allowed: false, 
                remaining: 0,
                resetTime: limiter.resetTime
            };
        }
        
        limiter.count++;
        return { 
            allowed: true, 
            remaining: maxRequests - limiter.count 
        };
    }

    // Track failed authentication attempts
    trackFailedAttempt(userId, attemptType) {
        const key = `${userId}_${attemptType}`;
        const now = Date.now();
        
        if (!this.suspiciousActivities.has(key)) {
            this.suspiciousActivities.set(key, {
                count: 1,
                firstAttempt: now,
                lastAttempt: now,
                locked: false,
                lockExpiry: null
            });
            return { locked: false };
        }
        
        const activity = this.suspiciousActivities.get(key);
        
        // Check if lockout has expired
        if (activity.locked && now > activity.lockExpiry) {
            activity.locked = false;
            activity.count = 1;
            activity.firstAttempt = now;
        }
        
        if (activity.locked) {
            return { 
                locked: true, 
                lockExpiry: activity.lockExpiry,
                remaining: Math.ceil((activity.lockExpiry - now) / 60000)
            };
        }
        
        activity.count++;
        activity.lastAttempt = now;
        
        if (activity.count >= this.maxFailedAttempts) {
            activity.locked = true;
            activity.lockExpiry = now + this.lockoutDuration;
            
            return { 
                locked: true, 
                lockExpiry: activity.lockExpiry,
                remaining: Math.ceil(this.lockoutDuration / 60000)
            };
        }
        
        return { 
            locked: false, 
            attemptsRemaining: this.maxFailedAttempts - activity.count 
        };
    }

    // Clear failed attempts after successful authentication
    clearFailedAttempts(userId, attemptType) {
        const key = `${userId}_${attemptType}`;
        this.suspiciousActivities.delete(key);
    }

    // Validate transaction parameters for suspicious activity
    validateTransaction(userId, tokenAddress, amount, type) {
        const issues = [];
        
        // Check for unusually large amounts
        if (parseFloat(amount) > 1000) {
            issues.push('Large transaction amount detected');
        }
        
        // Check for rapid successive transactions
        const rateCheck = this.checkRateLimit(userId, `${type}_transaction`, 5, 60000);
        if (!rateCheck.allowed) {
            issues.push('Too many transactions in short period');
        }
        
        // Check for known malicious token addresses (would be populated from a blacklist)
        const blacklistedTokens = [
            // Add known malicious token addresses here
        ];
        
        if (blacklistedTokens.includes(tokenAddress.toLowerCase())) {
            issues.push('Potentially malicious token address');
        }
        
        return {
            valid: issues.length === 0,
            issues: issues,
            riskLevel: this.calculateRiskLevel(issues.length, amount)
        };
    }

    // Calculate risk level based on various factors
    calculateRiskLevel(issueCount, amount) {
        let risk = 'low';
        
        if (issueCount > 0) {
            risk = 'medium';
        }
        
        if (issueCount > 2 || parseFloat(amount) > 500) {
            risk = 'high';
        }
        
        return risk;
    }

    // Sanitize user input to prevent injection attacks
    sanitizeInput(input) {
        if (typeof input !== 'string') {
            return input;
        }
        
        // Remove potentially dangerous characters
        return input
            .replace(/[<>]/g, '') // Remove HTML tags
            .replace(/['"]/g, '') // Remove quotes
            .replace(/[;]/g, '') // Remove semicolons
            .trim()
            .substring(0, 1000); // Limit length
    }

    // Validate Ethereum address format
    validateEthereumAddress(address) {
        if (!address || typeof address !== 'string') {
            return { valid: false, error: 'Invalid address format' };
        }
        
        // Basic format check
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return { valid: false, error: 'Invalid Ethereum address format' };
        }
        
        // Check for common test addresses that should be blocked
        const blockedAddresses = [
            '0x0000000000000000000000000000000000000000',
            '0x000000000000000000000000000000000000dead'
        ];
        
        if (blockedAddresses.includes(address.toLowerCase())) {
            return { valid: false, error: 'Blocked address' };
        }
        
        return { valid: true };
    }

    // Generate secure random string for temporary tokens
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Hash sensitive data
    hashData(data, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(16).toString('hex');
        }
        
        const hash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
        return {
            hash: hash.toString('hex'),
            salt: salt
        };
    }

    // Verify hashed data
    verifyHash(data, hash, salt) {
        const computed = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
        return computed.toString('hex') === hash;
    }

    // Check if user is temporarily locked out
    isUserLocked(userId, action = 'general') {
        const key = `${userId}_${action}`;
        const activity = this.suspiciousActivities.get(key);
        
        if (!activity || !activity.locked) {
            return { locked: false };
        }
        
        const now = Date.now();
        if (now > activity.lockExpiry) {
            // Lockout expired
            activity.locked = false;
            return { locked: false };
        }
        
        return {
            locked: true,
            remaining: Math.ceil((activity.lockExpiry - now) / 60000)
        };
    }

    // Log security events
    logSecurityEvent(userId, event, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            userId: userId,
            event: event,
            details: details,
            ip: details.ip || 'unknown'
        };
        
        console.log('SECURITY EVENT:', JSON.stringify(logEntry));
        
        // In production, you would want to send this to a proper logging service
        // or security monitoring system
    }

    // Clean up old rate limit and security data
    cleanup() {
        const now = Date.now();
        
        // Clean up expired rate limiters
        for (const [key, limiter] of this.rateLimiters.entries()) {
            if (now > limiter.resetTime) {
                this.rateLimiters.delete(key);
            }
        }
        
        // Clean up expired security activities
        for (const [key, activity] of this.suspiciousActivities.entries()) {
            if (activity.locked && now > activity.lockExpiry) {
                this.suspiciousActivities.delete(key);
            }
        }
    }
}

module.exports = SecurityManager;
