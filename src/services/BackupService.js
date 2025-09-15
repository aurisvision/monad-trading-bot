const BackupSystem = require('../../scripts/backup-system');
const path = require('path');

class BackupService {
    constructor(database, redis, logger, monitoring) {
        this.database = database;
        this.redis = redis;
        this.logger = logger || console;
        this.monitoring = monitoring;
        
        // Initialize backup system
        this.backupSystem = new BackupSystem({
            backupDir: path.join(__dirname, '..', '..', 'backups'),
            retentionDays: 7,
            compressionEnabled: true,
            schedule: '0 2 * * *', // Daily at 2 AM
            logger: this.logger,
            monitoring: this.monitoring
        });
        
        this.initialized = false;
    }

    /**
     * Initialize backup service
     */
    async initialize() {
        try {
            await this.backupSystem.initialize();
            this.initialized = true;
            
            this.logger.info('BackupService initialized successfully');
            
            if (this.monitoring) {
                this.monitoring.logInfo('BackupService initialized');
            }
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize BackupService:', error);
            
            if (this.monitoring) {
                this.monitoring.logError('BackupService initialization failed', error);
            }
            
            return false;
        }
    }

    /**
     * Perform manual backup
     */
    async performBackup() {
        if (!this.initialized) {
            throw new Error('BackupService not initialized');
        }
        
        try {
            const backupId = await this.backupSystem.performFullBackup();
            
            if (this.monitoring) {
                this.monitoring.logInfo('Manual backup completed', { backupId });
            }
            
            return backupId;
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Manual backup failed', error);
            }
            throw error;
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
