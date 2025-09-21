const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const UnifiedSecuritySystem = require('../security/UnifiedSecuritySystem');

class BackupService {
    constructor(database, redis, logger, monitoring) {
        this.database = database;
        this.redis = redis;
        this.logger = logger || console;
        this.monitoring = monitoring;
        
        // Use unified security system instead of duplicate encryption
        this.security = new UnifiedSecuritySystem(redis, database);
        
        // Enhanced backup configuration
        this.config = {
            backupDir: path.join(__dirname, '..', '..', 'backups'),
            retentionDays: 30, // Increased from 7 to 30 days
            compressionEnabled: true,
            encryptionEnabled: true, // NEW: Enable encryption
            schedule: '0 2 * * *', // Daily at 2 AM
            maxBackupSize: 1024 * 1024 * 100, // 100MB limit
            excludePatterns: [
                '*.log',
                'node_modules',
                '.git',
                'temp',
                '*.tmp'
            ]
        };
        
        this.initialized = false;
        this.backupInProgress = false;
    }

    /**
     * Initialize backup service with enhanced security
     */
    async initialize() {
        try {
            // Ensure backup directory exists
            await fs.mkdir(this.config.backupDir, { recursive: true });
            
            // Set secure permissions (readable only by owner)
            if (process.platform !== 'win32') {
                await fs.chmod(this.config.backupDir, 0o700);
            }
            
            // Generate encryption key if not exists
            await this.ensureEncryptionKey();
            
            this.initialized = true;
            
            this.logger.info('Enhanced BackupService initialized successfully');
            
            if (this.monitoring) {
                this.monitoring.logInfo('Enhanced BackupService initialized', {
                    backupDir: this.config.backupDir,
                    encryptionEnabled: this.config.encryptionEnabled,
                    retentionDays: this.config.retentionDays
                });
            }
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize BackupService:', error);
            
            if (this.monitoring) {
                this.monitoring.logError('BackupService initialization failed', { message: error.message });
            }
            
            return false;
        }
    }

    /**
     * Ensure encryption key exists for secure backups
     */
    async ensureEncryptionKey() {
        if (!this.config.encryptionEnabled) return;
        
        const keyPath = path.join(this.config.backupDir, '.backup-key');
        
        try {
            await fs.access(keyPath);
        } catch (error) {
            // Key doesn't exist, generate new one
            const key = crypto.randomBytes(32);
            await fs.writeFile(keyPath, key);
            
            // Set secure permissions
            if (process.platform !== 'win32') {
                await fs.chmod(keyPath, 0o600);
            }
            
            this.logger.info('Generated new backup encryption key');
        }
    }

    /**
     * Perform enhanced manual backup with security features
     */
    async performBackup() {
        if (!this.initialized) {
            throw new Error('BackupService not initialized');
        }
        
        if (this.backupInProgress) {
            throw new Error('Backup already in progress');
        }
        
        this.backupInProgress = true;
        const startTime = Date.now();
        
        try {
            const backupId = `backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            const backupPath = path.join(this.config.backupDir, `${backupId}.tar.gz`);
            
            // Create database backup
            const dbBackupData = await this.createDatabaseBackup();
            
            // Create Redis backup if available
            let redisBackupData = null;
            if (this.redis) {
                redisBackupData = await this.createRedisBackup();
            }
            
            // Create configuration backup
            const configBackupData = await this.createConfigBackup();
            
            // Combine all backup data
            const fullBackupData = {
                timestamp: new Date().toISOString(),
                database: dbBackupData,
                redis: redisBackupData,
                config: configBackupData,
                version: require('../../package.json').version
            };
            
            // Encrypt and compress if enabled
            let finalData = JSON.stringify(fullBackupData, null, 2);
            
            if (this.config.encryptionEnabled) {
                finalData = await this.encryptData(finalData);
            }
            
            // Write backup file
            await fs.writeFile(backupPath, finalData);
            
            // Verify backup integrity
            await this.verifyBackup(backupPath);
            
            // Clean old backups
            await this.cleanOldBackups();
            
            const duration = Date.now() - startTime;
            
            if (this.monitoring) {
                this.monitoring.logInfo('Enhanced backup completed', { 
                    backupId, 
                    duration,
                    encrypted: this.config.encryptionEnabled,
                    size: (await fs.stat(backupPath)).size
                });
            }
            
            return backupId;
            
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Enhanced backup failed', { message: error.message });
            }
            throw error;
        } finally {
            this.backupInProgress = false;
        }
    }

    /**
     * Restore from backup
     */
    async restoreFromBackup(backupId) {
        if (!this.initialized) {
            throw new Error('BackupService not initialized');
        }
        
        try {
            await this.backupSystem.restoreFromBackup(backupId);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Backup restore completed', { backupId });
            }
            
            return true;
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Backup restore failed', error, { backupId });
            }
            throw error;
        }
    }

    /**
     * List available backups
     */
    async listBackups() {
        if (!this.initialized) {
            throw new Error('BackupService not initialized');
        }
        
        return await this.backupSystem.listBackups();
    }

    /**
     * Get backup status
     */
    async getStatus() {
        if (!this.initialized) {
            return { enabled: false, error: 'Service not initialized' };
        }
        
        return await this.backupSystem.getStatus();
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            if (!this.initialized) {
                return false;
            }
            
            const status = await this.getStatus();
            return status.enabled;
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('BackupService health check failed', error);
            }
            return false;
        }
    }
}

module.exports = BackupService;
