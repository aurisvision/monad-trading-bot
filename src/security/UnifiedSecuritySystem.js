// 🛡️ Unified Security System - Complete Security Management
// Area51 Bot - Single Source of Truth for All Security Operations

const crypto = require('crypto');
const { secureLogger } = require('../utils/secureLogger');

class UnifiedSecuritySystem {
    constructor(redis, database) {
        this.redis = redis;
        this.database = database;
        
        // Single security configuration
        this.config = {
            // Encryption settings
            encryption: {
                algorithm: 'aes-256-gcm',
                keyDerivationRounds: 100000,
                saltLength: 32,
                ivLength: 12
            },
            
            // Rate limiting for sensitive operations - More user-friendly
            rateLimits: {
                'private_key_access': { limit: 10, window: 3600000 }, // 10/hour - More flexible for users
                'private_key_reveal': { limit: 5, window: 3600000 }, // 5/hour - Reasonable access
                'wallet_export': { limit: 5, window: 3600000 }, // 5/hour
                'wallet_import': { limit: 5, window: 3600000 }, // 5/hour
                'wallet_delete': { limit: 2, window: 86400000 }, // 2/day - Still protected
                'large_transaction': { limit: 20, window: 3600000 } // 20/hour - More trading freedom
            },
            
            // Security monitoring thresholds
            monitoring: {
                failedAttempts: { threshold: 5, window: 900000 }, // 5 in 15 min
                suspiciousActivity: { threshold: 3, window: 1800000 }, // 3 in 30 min
                rapidOperations: { threshold: 10, window: 300000 } // 10 in 5 min
            }
        };
        
        // Security metrics
        this.metrics = {
            blockedOperations: 0,
            suspiciousActivities: 0,
            securityAlerts: 0,
            encryptionOperations: 0
        };
        
        // Initialize master key
        this.masterKey = process.env.ENCRYPTION_KEY || this.generateMasterKey();
        
        // Start security monitoring
        this.startSecurityMonitoring();
    }

    // ==================== ENCRYPTION SYSTEM ====================
    
    /**
     * Enhanced encryption with user-specific salt and integrity protection
     * @param {string} text - Text to encrypt
     * @param {number} userId - User ID for salt generation
     * @returns {string} Encrypted data with integrity protection
     */
    encrypt(text, userId = 'system') {
        try {
            // Validate input
            if (text === null || text === undefined) {
                throw new Error('Cannot encrypt null or undefined data');
            }
            
            // Convert non-string inputs to string
            if (typeof text !== 'string') {
                text = String(text);
            }
            const userSalt = crypto.scryptSync(
                userId.toString(), 
                'area51-security-v3', 
                this.config.encryption.saltLength
            );
            
            const derivedKey = crypto.pbkdf2Sync(
                this.masterKey, 
                userSalt, 
                this.config.encryption.keyDerivationRounds, 
                32, 
                'sha256'
            );
            
            const iv = crypto.randomBytes(this.config.encryption.ivLength);
            const cipher = crypto.createCipheriv(this.config.encryption.algorithm, derivedKey, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            // Create HMAC for additional integrity
            const hmac = crypto.createHmac('sha256', derivedKey);
            hmac.update(userSalt);
            hmac.update(iv);
            hmac.update(Buffer.from(encrypted, 'hex'));
            const hmacDigest = hmac.digest();
            
            // Format: version:salt:iv:authTag:hmac:encrypted
            const result = [
                'v3',
                userSalt.toString('hex'),
                iv.toString('hex'),
                authTag.toString('hex'),
                hmacDigest.toString('hex'),
                encrypted
            ].join(':');
            
            // Secure cleanup
            derivedKey.fill(0);
            this.metrics.encryptionOperations++;
            
            return result;
        } catch (error) {
            secureLogger.error('Encryption failed', { error: error.message, userId });
            throw new Error('Encryption failed');
        }
    }

    /**
     * Enhanced decryption with integrity verification
     * @param {string} encryptedData - Encrypted data
     * @param {number} userId - User ID
     * @returns {string} Decrypted text
     */
    decrypt(encryptedData, userId = 'system') {
        try {
            if (!encryptedData || typeof encryptedData !== 'string') {
                throw new Error('Invalid encrypted data');
            }

            const parts = encryptedData.split(':');
            
            // Handle v3 format with HMAC
            if (parts.length === 6 && parts[0] === 'v3') {
                const [version, saltHex, ivHex, authTagHex, hmacHex, encrypted] = parts;
                
                const salt = Buffer.from(saltHex, 'hex');
                const iv = Buffer.from(ivHex, 'hex');
                const authTag = Buffer.from(authTagHex, 'hex');
                const expectedHmac = Buffer.from(hmacHex, 'hex');
                
                const derivedKey = crypto.pbkdf2Sync(
                    this.masterKey, 
                    salt, 
                    this.config.encryption.keyDerivationRounds, 
                    32, 
                    'sha256'
                );
                
                // Verify HMAC integrity
                const hmac = crypto.createHmac('sha256', derivedKey);
                hmac.update(salt);
                hmac.update(iv);
                hmac.update(Buffer.from(encrypted, 'hex'));
                const computedHmac = hmac.digest();
                
                if (!crypto.timingSafeEqual(expectedHmac, computedHmac)) {
                    secureLogger.error('Data integrity verification failed', { userId });
                    throw new Error('Data integrity verification failed');
                }
                
                const decipher = crypto.createDecipheriv(this.config.encryption.algorithm, derivedKey, iv);
                decipher.setAuthTag(authTag);
                
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                
                // Secure cleanup
                derivedKey.fill(0);
                
                return decrypted;
            }
            // Handle legacy v1 format (backward compatibility)
            else if (parts.length === 2) {
                const iv = Buffer.from(parts[0], 'hex');
                const encrypted = parts[1];
                const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.masterKey), iv);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            }
            
            throw new Error('Unsupported encryption format');
        } catch (error) {
            secureLogger.error('Decryption failed', { error: error.message, userId });
            return 'DECRYPTION_FAILED_PLEASE_REGENERATE_WALLET';
        }
    }

    // ==================== RATE LIMITING SYSTEM ====================
    
    /**
     * Check if operation is allowed based on rate limits
     * @param {number} userId - User ID
     * @param {string} operation - Operation type
     * @returns {Promise<{allowed: boolean, reason?: string}>}
     */
    async checkRateLimit(userId, operation) {
        try {
            const config = this.config.rateLimits[operation];
            if (!config) {
                return { allowed: true };
            }

            // Check if operation is blocked
            if (config.blocked) {
                secureLogger.error('Blocked operation attempted', {
                    userId,
                    operation,
                    severity: 'CRITICAL'
                });
                this.metrics.blockedOperations++;
                return { 
                    allowed: false, 
                    reason: 'This operation is blocked for security reasons' 
                };
            }

            const key = `security:rate_limit:${operation}:${userId}`;
            let attempts = 0;
            
            try {
                if (this.redis && this.redis.get) {
                    const result = await this.redis.get(key);
                    attempts = parseInt(result || '0');
                } else {
                    // If Redis is not available, allow operation but log warning
                    secureLogger.warn('Redis not available for rate limiting', { operation, userId });
                    return { allowed: true };
                }
            } catch (redisError) {
                secureLogger.warn('Redis error in rate limiting', { error: redisError.message });
                return { allowed: true }; // Fail open for availability
            }

            // Smart rate limiting - check user trust level
            const userTrustLevel = await this.getUserTrustLevel(userId);
            const adjustedLimit = this.getAdjustedLimit(config.limit, userTrustLevel);
            
            if (attempts >= adjustedLimit) {
                secureLogger.warn('Rate limit exceeded', {
                    userId,
                    operation,
                    attempts,
                    limit: adjustedLimit,
                    trustLevel: userTrustLevel
                });
                
                this.metrics.blockedOperations++;
                return { 
                    allowed: false, 
                    reason: `Rate limit exceeded. Maximum ${adjustedLimit} attempts per ${Math.floor(config.window / 60000)} minutes` 
                };
            }

            // Increment counter using Redis client
            const ttl = Math.floor(config.window / 1000);
            if (this.redis && this.redis.setex) {
                await this.redis.setex(key, ttl, attempts + 1);
            } else if (this.redis && this.redis.set) {
                // Fallback for different Redis client interfaces
                await this.redis.set(key, attempts + 1, 'EX', ttl);
            } else {
                throw new Error('Redis client not properly configured');
            }

            return { allowed: true };
        } catch (error) {
            secureLogger.error('Rate limit check failed', error);
            return { allowed: false, reason: 'Security check failed' };
        }
    }

    // ==================== ADVANCED USER VERIFICATION ====================
    
    /**
     * Advanced user verification for sensitive operations
     * @param {number} userId - User ID
     * @param {string} operation - Operation type
     * @param {object} context - Additional context (IP, device, etc.)
     * @returns {Promise<object>} Verification result
     */
    async verifyUserForSensitiveOperation(userId, operation, context = {}) {
        try {
            const verificationSteps = [];
            let riskScore = 0;
            
            // Step 1: Rate limiting check
            const rateLimitResult = await this.checkRateLimit(userId, operation);
            if (!rateLimitResult.allowed) {
                return {
                    allowed: false,
                    reason: rateLimitResult.reason,
                    riskScore: 100
                };
            }
            verificationSteps.push('Rate limit passed');
            
            // Step 2: User ownership verification
            if (!context.userTelegramId || context.userTelegramId !== userId) {
                riskScore += 50;
                verificationSteps.push('User ID mismatch detected');
            } else {
                verificationSteps.push('User ownership verified');
            }
            
            // Step 3: Time-based analysis
            const currentHour = new Date().getHours();
            if (currentHour >= 2 && currentHour <= 6) {
                riskScore += 20; // Unusual hours
                verificationSteps.push('Unusual time detected');
            } else {
                verificationSteps.push('Normal time verified');
            }
            
            // Step 4: Operation frequency analysis
            const recentOperations = await this.getRecentSensitiveOperations(userId);
            if (recentOperations > 2) {
                riskScore += 30;
                verificationSteps.push('High frequency operations detected');
            } else {
                verificationSteps.push('Normal operation frequency');
            }
            
            // Step 5: Final risk assessment
            const allowed = riskScore < 70; // Allow if risk score is below 70
            
            // Log the verification attempt
            await this.logSecurityEvent('SENSITIVE_OPERATION_VERIFICATION', userId, {
                operation,
                riskScore,
                allowed,
                verificationSteps,
                context
            }, allowed ? 'MEDIUM' : 'HIGH');
            
            return {
                allowed,
                reason: allowed ? 'Verification passed' : `High risk score: ${riskScore}`,
                riskScore,
                verificationSteps
            };
            
        } catch (error) {
            secureLogger.error('User verification failed', error);
            return {
                allowed: false,
                reason: 'Verification system error',
                riskScore: 100
            };
        }
    }
    
    /**
     * Get recent sensitive operations count
     * @param {number} userId - User ID
     * @returns {Promise<number>} Count of recent operations
     */
    async getRecentSensitiveOperations(userId) {
        try {
            if (!this.redis || !this.redis.get) {
                return 0; // If Redis not available, assume no recent operations
            }
            
            const key = `security:recent_sensitive:${userId}`;
            const count = await this.redis.get(key) || '0';
            return parseInt(count);
        } catch (error) {
            return 0; // Fail safe
        }
    }
    
    /**
     * Record sensitive operation
     * @param {number} userId - User ID
     */
    async recordSensitiveOperation(userId) {
        try {
            if (!this.redis || !this.redis.set) {
                return; // Skip if Redis not available
            }
            
            const key = `security:recent_sensitive:${userId}`;
            const current = parseInt(await this.redis.get(key) || '0');
            
            // Increment counter with 24-hour expiry
            if (this.redis.setex) {
                await this.redis.setex(key, 86400, current + 1);
            } else if (this.redis.set) {
                await this.redis.set(key, current + 1, 'EX', 86400);
            }
        } catch (error) {
            secureLogger.warn('Failed to record sensitive operation', error);
        }
    }

    // ==================== SECURITY MONITORING ====================
    
    /**
     * Log security event
     * @param {string} eventType - Type of security event
     * @param {number} userId - User ID
     * @param {object} metadata - Event metadata
     * @param {string} severity - Event severity (LOW, MEDIUM, HIGH, CRITICAL)
     */
    async logSecurityEvent(eventType, userId, metadata = {}, severity = 'MEDIUM') {
        try {
            const event = {
                eventType,
                userId,
                metadata,
                severity,
                timestamp: new Date().toISOString()
            };
            
            secureLogger.warn(`Security Event: ${eventType}`, event);
            
            // Update metrics
            this.metrics.securityAlerts++;
            
            if (severity === 'CRITICAL') {
                this.metrics.suspiciousActivities++;
            }
            
        } catch (error) {
            secureLogger.error('Failed to log security event', error);
        }
    }
    
    /**
     * Start continuous security monitoring
     */
    startSecurityMonitoring() {
        // Monitor every 60 seconds
        setInterval(async () => {
            await this.performSecurityScan();
        }, 60000);

        console.log('Unified security monitoring started');
    }

    /**
     * Perform security scan
     */
    async performSecurityScan() {
        try {
            // Check for suspicious patterns
            const suspiciousUsers = await this.detectSuspiciousActivity();
            
            // Check system health
            const systemHealth = await this.checkSystemHealth();
            
            // Update metrics
            if (suspiciousUsers.length > 0) {
                this.metrics.suspiciousActivities += suspiciousUsers.length;
                
                secureLogger.warn('Suspicious activity detected', {
                    count: suspiciousUsers.length,
                    users: suspiciousUsers
                });
            }

            // Alert if system is unhealthy
            if (systemHealth !== 'HEALTHY') {
                await this.triggerSecurityAlert('SYSTEM_HEALTH', { status: systemHealth });
            }

        } catch (error) {
            secureLogger.error('Security scan failed', error);
        }
    }

    /**
     * Detect suspicious activity patterns
     * @returns {Promise<Array>} Suspicious users
     */
    async detectSuspiciousActivity() {
        try {
            const suspiciousUsers = [];
            
            // Check for users with multiple failed attempts
            const failedKeys = await this.redis.keys('security:failed_attempts:*');
            
            for (const key of failedKeys) {
                const userId = key.split(':')[2];
                const attempts = parseInt(await this.redis.get(key) || '0');
                
                if (attempts >= this.config.monitoring.failedAttempts.threshold) {
                    suspiciousUsers.push({
                        userId: parseInt(userId),
                        reason: 'multiple_failed_attempts',
                        count: attempts
                    });
                }
            }

            return suspiciousUsers;
        } catch (error) {
            secureLogger.error('Error detecting suspicious activity', error);
            return [];
        }
    }

    /**
     * Check system health
     * @returns {Promise<string>} Health status
     */
    async checkSystemHealth() {
        try {
            // Check Redis connectivity
            await this.redis.ping();

            // Check if emergency mode is active
            const emergencyMode = await this.redis.get('security:emergency_mode');
            if (emergencyMode) {
                return 'EMERGENCY_MODE';
            }

            // Check for high security activity
            const recentAlerts = this.metrics.securityAlerts;
            if (recentAlerts > 10) {
                return 'HIGH_SECURITY_ACTIVITY';
            }

            return 'HEALTHY';
        } catch (error) {
            secureLogger.error('System health check failed', error);
            return 'UNHEALTHY';
        }
    }

    /**
     * Trigger security alert
     * @param {string} alertType - Alert type
     * @param {object} details - Alert details
     */
    async triggerSecurityAlert(alertType, details) {
        try {
            const alert = {
                id: this.generateAlertId(),
                type: alertType,
                timestamp: new Date().toISOString(),
                details,
                severity: this.calculateSeverity(alertType)
            };

            // Store alert
            const alertKey = `security:alerts:${alert.id}`;
            await this.redis.setex(alertKey, 604800, JSON.stringify(alert)); // 7 days

            // Log alert
            secureLogger.error('SECURITY ALERT', alert);
            
            this.metrics.securityAlerts++;

            // Take immediate action for critical alerts
            if (alert.severity === 'CRITICAL') {
                await this.handleCriticalAlert(alert);
            }

        } catch (error) {
            secureLogger.error('Error triggering security alert', error);
        }
    }

    /**
     * Handle critical security alerts
     * @param {object} alert - Security alert
     */
    async handleCriticalAlert(alert) {
        try {
            // Enable emergency mode for critical alerts
            await this.redis.setex('security:emergency_mode', 1800, 'true'); // 30 minutes
            
            secureLogger.error('CRITICAL ALERT - Emergency mode activated', alert);
        } catch (error) {
            secureLogger.error('Error handling critical alert', error);
        }
    }

    // ==================== UTILITY METHODS ====================
    
    /**
     * Record failed operation attempt
     * @param {number} userId - User ID
     * @param {string} operation - Failed operation
     * @param {string} reason - Failure reason
     */
    async recordFailedAttempt(userId, operation, reason) {
        try {
            const key = `security:failed_attempts:${userId}`;
            const failures = parseInt(await this.redis.get(key) || '0') + 1;
            const ttl = Math.floor(this.config.monitoring.failedAttempts.window / 1000);

            await this.redis.setex(key, ttl, failures);

            secureLogger.warn('Failed attempt recorded', {
                userId,
                operation,
                reason,
                totalFailures: failures
            });

        } catch (error) {
            secureLogger.error('Error recording failed attempt', error);
        }
    }

    /**
     * Check if user is locked
     * @param {number} userId - User ID
     * @returns {Promise<{locked: boolean, reason?: string}>}
     */
    async checkUserLock(userId) {
        try {
            const lockKey = `security:user_lock:${userId}`;
            const lockData = await this.redis.get(lockKey);

            if (lockData) {
                const lock = JSON.parse(lockData);
                return {
                    locked: true,
                    reason: lock.reason,
                    until: new Date(Date.now() + (await this.redis.ttl(lockKey)) * 1000)
                };
            }

            return { locked: false };
        } catch (error) {
            secureLogger.error('Error checking user lock', error);
            return { locked: false };
        }
    }

    /**
     * Secure memory wipe
     * @param {string|object} sensitiveData - Data to wipe
     */
    secureWipeMemory(sensitiveData) {
        try {
            if (sensitiveData && typeof sensitiveData === 'string') {
                const length = sensitiveData.length;
                sensitiveData = '\0'.repeat(length);
            }
            if (sensitiveData && typeof sensitiveData === 'object') {
                for (const key in sensitiveData) {
                    if (sensitiveData.hasOwnProperty(key)) {
                        sensitiveData[key] = null;
                    }
                }
            }
        } catch (error) {
            secureLogger.warn('Memory wipe failed', { error: error.message });
        }
    }

    /**
     * Generate master key if not provided
     * @returns {string} Master key
     */
    generateMasterKey() {
        const key = crypto.randomBytes(32).toString('hex');
        secureLogger.warn('Generated temporary master key - Set ENCRYPTION_KEY in production');
        return key;
    }

    /**
     * Generate unique alert ID
     * @returns {string} Alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Calculate alert severity
     * @param {string} alertType - Alert type
     * @returns {string} Severity level
     */
    calculateSeverity(alertType) {
        const criticalTypes = ['SYSTEM_INTRUSION', 'PRIVATE_KEY_ACCESS', 'MASS_ATTACK'];
        const highTypes = ['SUSPICIOUS_ACTIVITY', 'RATE_LIMIT_EXCEEDED'];
        
        if (criticalTypes.includes(alertType)) return 'CRITICAL';
        if (highTypes.includes(alertType)) return 'HIGH';
        return 'MEDIUM';
    }

    /**
     * Get security metrics
     * @returns {object} Security metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString(),
            systemHealth: 'HEALTHY' // Will be updated by monitoring
        };
    }

    /**
     * Get user trust level based on activity and behavior
     * @param {number} userId - User ID
     * @returns {Promise<string>} Trust level: 'new', 'regular', 'trusted', 'vip'
     */
    async getUserTrustLevel(userId) {
        try {
            // Get user data from database
            const user = await this.database.getUserByTelegramId(userId);
            if (!user) return 'new';
            
            const now = new Date();
            const accountAge = now - new Date(user.created_at);
            const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
            
            // Get transaction count
            const transactionCount = await this.database.getUserTransactionCount(userId);
            
            // Calculate trust level
            if (daysSinceCreation >= 30 && transactionCount >= 100) {
                return 'vip'; // VIP users get highest limits
            } else if (daysSinceCreation >= 14 && transactionCount >= 20) {
                return 'trusted'; // Trusted users get increased limits
            } else if (daysSinceCreation >= 3 && transactionCount >= 5) {
                return 'regular'; // Regular users get standard limits
            } else {
                return 'new'; // New users get restricted limits
            }
        } catch (error) {
            secureLogger.warn('Failed to get user trust level', { userId, error: error.message });
            return 'regular'; // Default to regular on error
        }
    }

    /**
     * Adjust rate limit based on user trust level
     * @param {number} baseLimit - Base rate limit
     * @param {string} trustLevel - User trust level
     * @returns {number} Adjusted limit
     */
    getAdjustedLimit(baseLimit, trustLevel) {
        const multipliers = {
            'new': 0.5,      // New users: 50% of base limit
            'regular': 1.0,   // Regular users: 100% of base limit
            'trusted': 1.5,   // Trusted users: 150% of base limit
            'vip': 2.0        // VIP users: 200% of base limit
        };
        
        const multiplier = multipliers[trustLevel] || 1.0;
        return Math.ceil(baseLimit * multiplier);
    }

    /**
     * Check if system is in emergency mode
     * @returns {Promise<boolean>} Emergency mode status
     */
    async isEmergencyMode() {
        try {
            const emergencyMode = await this.redis.get('security:emergency_mode');
            return emergencyMode === 'true';
        } catch (error) {
            return false;
        }
    }
}

module.exports = UnifiedSecuritySystem;
