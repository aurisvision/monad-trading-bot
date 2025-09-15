const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');

class BackupSystem {
    constructor(config = {}) {
        this.config = {
            // Database configuration
            dbHost: process.env.POSTGRES_HOST || 'localhost',
            dbPort: process.env.POSTGRES_PORT || 5432,
            dbName: process.env.POSTGRES_DB_NAME || 'area51_bot',
            dbUser: process.env.POSTGRES_USER || 'postgres',
            dbPassword: process.env.POSTGRES_PASSWORD,
            
            // Redis configuration
            redisHost: process.env.REDIS_HOST || 'localhost',
            redisPort: process.env.REDIS_PORT || 6379,
            redisPassword: process.env.REDIS_PASSWORD,
            
            // Backup configuration
            backupDir: config.backupDir || path.join(__dirname, '..', 'backups'),
            retentionDays: config.retentionDays || 7,
            compressionEnabled: config.compressionEnabled !== false,
            
            // Schedule configuration
            schedule: config.schedule || '0 2 * * *', // Daily at 2 AM
            
            ...config
        };
        
        this.logger = config.logger || console;
        this.monitoring = config.monitoring;
    }

    /**
     * Initialize backup system
     */
    async initialize() {
        try {
            // Create backup directory if it doesn't exist
            await this.ensureBackupDirectory();
            
            // Schedule automatic backups
            this.scheduleBackups();
            
            this.logger.info('Backup system initialized successfully');
            
            if (this.monitoring) {
                this.monitoring.logInfo('Backup system initialized');
            }
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize backup system:', error);
            
            if (this.monitoring) {
                this.monitoring.logError('Backup system initialization failed', error);
            }
            
            return false;
        }
    }

    /**
     * Ensure backup directory exists
     */
    async ensureBackupDirectory() {
        try {
            await fs.access(this.config.backupDir);
        } catch (error) {
            // Directory doesn't exist, create it
            await fs.mkdir(this.config.backupDir, { recursive: true });
            this.logger.info(`Created backup directory: ${this.config.backupDir}`);
        }
    }

    /**
     * Schedule automatic backups
     */
    scheduleBackups() {
        cron.schedule(this.config.schedule, async () => {
            this.logger.info('Starting scheduled backup...');
            await this.performFullBackup();
        });
        
        this.logger.info(`Backup scheduled: ${this.config.schedule}`);
    }

    /**
     * Perform full backup (database + redis)
     */
    async performFullBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `backup_${timestamp}`;
        
        try {
            this.logger.info(`Starting full backup: ${backupId}`);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Full backup started', { backupId });
            }

            // Create backup subdirectory
            const backupPath = path.join(this.config.backupDir, backupId);
            await fs.mkdir(backupPath, { recursive: true });

            // Backup database
            const dbBackupPath = await this.backupDatabase(backupPath);
            
            // Backup Redis
            const redisBackupPath = await this.backupRedis(backupPath);
            
            // Create backup manifest
            await this.createBackupManifest(backupPath, {
                backupId,
                timestamp,
                database: dbBackupPath,
                redis: redisBackupPath
            });
            
            // Compress backup if enabled
            if (this.config.compressionEnabled) {
                await this.compressBackup(backupPath);
            }
            
            // Clean old backups
            await this.cleanOldBackups();
            
            this.logger.info(`Full backup completed: ${backupId}`);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Full backup completed', { backupId });
            }
            
            return backupId;
            
        } catch (error) {
            this.logger.error(`Full backup failed: ${backupId}`, error);
            
            if (this.monitoring) {
                this.monitoring.logError('Full backup failed', error, { backupId });
            }
            
            throw error;
        }
    }

    /**
     * Backup PostgreSQL database
     */
    async backupDatabase(backupPath) {
        return new Promise((resolve, reject) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `database_${timestamp}.sql`;
            const filepath = path.join(backupPath, filename);
            
            const pgDumpArgs = [
                '-h', this.config.dbHost,
                '-p', this.config.dbPort.toString(),
                '-U', this.config.dbUser,
                '-d', this.config.dbName,
                '--no-password',
                '--verbose',
                '--clean',
                '--if-exists',
                '--create',
                '-f', filepath
            ];
            
            const env = {
                ...process.env,
                PGPASSWORD: this.config.dbPassword
            };
            
            const pgDump = spawn('pg_dump', pgDumpArgs, { env });
            
            let stderr = '';
            
            pgDump.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pgDump.on('close', (code) => {
                if (code === 0) {
                    this.logger.info(`Database backup completed: ${filename}`);
                    resolve(filepath);
                } else {
                    this.logger.error(`Database backup failed with code ${code}: ${stderr}`);
                    reject(new Error(`pg_dump failed with code ${code}: ${stderr}`));
                }
            });
            
            pgDump.on('error', (error) => {
                this.logger.error('Database backup process error:', error);
                reject(error);
            });
        });
    }

    /**
     * Backup Redis data
     */
    async backupRedis(backupPath) {
        return new Promise((resolve, reject) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `redis_${timestamp}.rdb`;
            const filepath = path.join(backupPath, filename);
            
            // Use redis-cli to create backup
            const redisCliArgs = [
                '-h', this.config.redisHost,
                '-p', this.config.redisPort.toString()
            ];
            
            if (this.config.redisPassword) {
                redisCliArgs.push('-a', this.config.redisPassword);
            }
            
            redisCliArgs.push('--rdb', filepath);
            
            const redisCli = spawn('redis-cli', redisCliArgs);
            
            let stderr = '';
            
            redisCli.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            redisCli.on('close', (code) => {
                if (code === 0) {
                    this.logger.info(`Redis backup completed: ${filename}`);
                    resolve(filepath);
                } else {
                    this.logger.error(`Redis backup failed with code ${code}: ${stderr}`);
                    reject(new Error(`redis-cli failed with code ${code}: ${stderr}`));
                }
            });
            
            redisCli.on('error', (error) => {
                this.logger.error('Redis backup process error:', error);
                reject(error);
            });
        });
    }

    /**
     * Create backup manifest file
     */
    async createBackupManifest(backupPath, metadata) {
        const manifestPath = path.join(backupPath, 'manifest.json');
        
        const manifest = {
            ...metadata,
            version: '1.0',
            created_at: new Date().toISOString(),
            system: {
                node_version: process.version,
                platform: process.platform,
                arch: process.arch
            },
            config: {
                retention_days: this.config.retentionDays,
                compression_enabled: this.config.compressionEnabled
            }
        };
        
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        this.logger.info('Backup manifest created');
    }

    /**
     * Compress backup directory
     */
    async compressBackup(backupPath) {
        return new Promise((resolve, reject) => {
            const archivePath = `${backupPath}.tar.gz`;
            const tar = spawn('tar', ['-czf', archivePath, '-C', path.dirname(backupPath), path.basename(backupPath)]);
            
            tar.on('close', async (code) => {
                if (code === 0) {
                    // Remove uncompressed directory
                    await fs.rm(backupPath, { recursive: true, force: true });
                    this.logger.info(`Backup compressed: ${archivePath}`);
                    resolve(archivePath);
                } else {
                    reject(new Error(`tar failed with code ${code}`));
                }
            });
            
            tar.on('error', reject);
        });
    }

    /**
     * Clean old backups based on retention policy
     */
    async cleanOldBackups() {
        try {
            const files = await fs.readdir(this.config.backupDir);
            const now = Date.now();
            const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
            
            for (const file of files) {
                const filePath = path.join(this.config.backupDir, file);
                const stats = await fs.stat(filePath);
                
                if (now - stats.mtime.getTime() > retentionMs) {
                    if (stats.isDirectory()) {
                        await fs.rm(filePath, { recursive: true, force: true });
                    } else {
                        await fs.unlink(filePath);
                    }
                    
                    this.logger.info(`Removed old backup: ${file}`);
                }
            }
            
        } catch (error) {
            this.logger.error('Failed to clean old backups:', error);
        }
    }

    /**
     * Restore from backup
     */
    async restoreFromBackup(backupId) {
        try {
            this.logger.info(`Starting restore from backup: ${backupId}`);
            
            const backupPath = path.join(this.config.backupDir, backupId);
            
            // Check if backup exists
            try {
                await fs.access(backupPath);
            } catch (error) {
                // Try compressed version
                const compressedPath = `${backupPath}.tar.gz`;
                await fs.access(compressedPath);
                
                // Extract compressed backup
                await this.extractBackup(compressedPath);
            }
            
            // Read manifest
            const manifestPath = path.join(backupPath, 'manifest.json');
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            
            // Restore database
            if (manifest.database) {
                await this.restoreDatabase(manifest.database);
            }
            
            // Restore Redis
            if (manifest.redis) {
                await this.restoreRedis(manifest.redis);
            }
            
            this.logger.info(`Restore completed from backup: ${backupId}`);
            
            if (this.monitoring) {
                this.monitoring.logInfo('Backup restore completed', { backupId });
            }
            
            return true;
            
        } catch (error) {
            this.logger.error(`Restore failed from backup: ${backupId}`, error);
            
            if (this.monitoring) {
                this.monitoring.logError('Backup restore failed', error, { backupId });
            }
            
            throw error;
        }
    }

    /**
     * Extract compressed backup
     */
    async extractBackup(compressedPath) {
        return new Promise((resolve, reject) => {
            const tar = spawn('tar', ['-xzf', compressedPath, '-C', path.dirname(compressedPath)]);
            
            tar.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`tar extraction failed with code ${code}`));
                }
            });
            
            tar.on('error', reject);
        });
    }

    /**
     * Restore PostgreSQL database
     */
    async restoreDatabase(sqlFilePath) {
        return new Promise((resolve, reject) => {
            const psqlArgs = [
                '-h', this.config.dbHost,
                '-p', this.config.dbPort.toString(),
                '-U', this.config.dbUser,
                '-d', this.config.dbName,
                '-f', sqlFilePath
            ];
            
            const env = {
                ...process.env,
                PGPASSWORD: this.config.dbPassword
            };
            
            const psql = spawn('psql', psqlArgs, { env });
            
            let stderr = '';
            
            psql.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            psql.on('close', (code) => {
                if (code === 0) {
                    this.logger.info('Database restore completed');
                    resolve();
                } else {
                    reject(new Error(`psql failed with code ${code}: ${stderr}`));
                }
            });
            
            psql.on('error', reject);
        });
    }

    /**
     * Restore Redis data
     */
    async restoreRedis(rdbFilePath) {
        // Note: Redis restore typically requires stopping Redis, 
        // copying the RDB file, and restarting Redis
        this.logger.warn('Redis restore requires manual intervention - RDB file available at:', rdbFilePath);
        
        // For automated restore, you would need to:
        // 1. Stop Redis service
        // 2. Copy RDB file to Redis data directory
        // 3. Start Redis service
        
        return true;
    }

    /**
     * List available backups
     */
    async listBackups() {
        try {
            const files = await fs.readdir(this.config.backupDir);
            const backups = [];
            
            for (const file of files) {
                const filePath = path.join(this.config.backupDir, file);
                const stats = await fs.stat(filePath);
                
                if (file.startsWith('backup_') && (stats.isDirectory() || file.endsWith('.tar.gz'))) {
                    const manifestPath = stats.isDirectory() 
                        ? path.join(filePath, 'manifest.json')
                        : null;
                    
                    let manifest = null;
                    if (manifestPath) {
                        try {
                            manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
                        } catch (error) {
                            // Manifest not readable
                        }
                    }
                    
                    backups.push({
                        id: file.replace('.tar.gz', ''),
                        path: filePath,
                        size: stats.size,
                        created: stats.mtime,
                        compressed: file.endsWith('.tar.gz'),
                        manifest
                    });
                }
            }
            
            return backups.sort((a, b) => b.created - a.created);
            
        } catch (error) {
            this.logger.error('Failed to list backups:', error);
            return [];
        }
    }

    /**
     * Get backup system status
     */
    async getStatus() {
        try {
            const backups = await this.listBackups();
            const latestBackup = backups[0];
            
            return {
                enabled: true,
                schedule: this.config.schedule,
                backup_directory: this.config.backupDir,
                retention_days: this.config.retentionDays,
                compression_enabled: this.config.compressionEnabled,
                total_backups: backups.length,
                latest_backup: latestBackup ? {
                    id: latestBackup.id,
                    created: latestBackup.created,
                    size: latestBackup.size
                } : null
            };
            
        } catch (error) {
            return {
                enabled: false,
                error: error.message
            };
        }
    }
}

module.exports = BackupSystem;
