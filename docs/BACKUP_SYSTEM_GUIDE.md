# Area51 Bot Backup System Guide

## Overview

The Area51 Telegram Bot includes a comprehensive automated backup system that creates regular backups of both PostgreSQL database and Redis cache data. This ensures data protection and enables disaster recovery.

## Features

- **Automated Daily Backups**: Scheduled at 2 AM daily
- **Full Database Backup**: Complete PostgreSQL dump with schema and data
- **Redis Data Backup**: RDB file backup for cache data
- **Compression**: Automatic tar.gz compression to save space
- **Retention Policy**: Configurable retention (default 7 days)
- **Manual Backup**: On-demand backup creation
- **Restore Functionality**: Complete restore from any backup
- **Monitoring Integration**: Full logging and alerting

## Components

### 1. BackupSystem (`scripts/backup-system.js`)
Core backup engine that handles:
- Database dumps using `pg_dump`
- Redis backups using `redis-cli --rdb`
- File compression and cleanup
- Backup manifests and metadata
- Restore operations

### 2. BackupService (`src/services/BackupService.js`)
Service wrapper that integrates with the bot:
- Monitoring integration
- Health checks
- Error handling
- API for manual operations

## Configuration

### Environment Variables
```bash
# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_NAME=area51_bot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### Backup Settings
```javascript
{
    backupDir: './backups',          // Backup directory
    retentionDays: 7,                // Keep backups for 7 days
    compressionEnabled: true,        // Enable compression
    schedule: '0 2 * * *'           // Daily at 2 AM
}
```

## Usage

### NPM Scripts

#### Manual Backup
```bash
npm run backup:manual
```
Creates an immediate backup and returns the backup ID.

#### List Backups
```bash
npm run backup:list
```
Shows all available backups with metadata.

#### Backup Status
```bash
npm run backup:status
```
Displays backup system status and configuration.

### Programmatic Usage

```javascript
const BackupSystem = require('./scripts/backup-system');

const backupSystem = new BackupSystem({
    retentionDays: 14,
    compressionEnabled: true
});

// Initialize and perform backup
await backupSystem.initialize();
const backupId = await backupSystem.performFullBackup();

// List available backups
const backups = await backupSystem.listBackups();

// Restore from backup
await backupSystem.restoreFromBackup(backupId);
```

## Backup Structure

### Directory Layout
```
backups/
├── backup_2024-01-15T02-00-00-000Z/
│   ├── database_2024-01-15T02-00-00-000Z.sql
│   ├── redis_2024-01-15T02-00-00-000Z.rdb
│   └── manifest.json
├── backup_2024-01-16T02-00-00-000Z.tar.gz
└── backup_2024-01-17T02-00-00-000Z.tar.gz
```

### Manifest File
```json
{
    "backupId": "backup_2024-01-15T02-00-00-000Z",
    "timestamp": "2024-01-15T02:00:00.000Z",
    "version": "1.0",
    "database": "/path/to/database_backup.sql",
    "redis": "/path/to/redis_backup.rdb",
    "created_at": "2024-01-15T02:00:00.000Z",
    "system": {
        "node_version": "v18.17.0",
        "platform": "linux",
        "arch": "x64"
    },
    "config": {
        "retention_days": 7,
        "compression_enabled": true
    }
}
```

## Monitoring and Alerts

### Backup Events Logged
- Backup start/completion
- Backup failures with detailed errors
- Cleanup operations
- Restore operations

### Prometheus Metrics
- `backup_total` - Total backups created
- `backup_duration_seconds` - Backup duration
- `backup_size_bytes` - Backup file sizes
- `backup_failures_total` - Failed backup attempts

### Alert Conditions
- Backup failure
- Backup taking too long (>30 minutes)
- Disk space low in backup directory
- No recent backups (>25 hours)

## Restore Process

### Database Restore
1. Stop the bot application
2. Create a backup of current database (safety)
3. Run restore command:
   ```bash
   psql -h localhost -U postgres -d area51_bot -f backup_file.sql
   ```
4. Restart the bot application

### Redis Restore
1. Stop Redis service
2. Copy RDB file to Redis data directory
3. Start Redis service
4. Restart the bot application

### Automated Restore
```javascript
const backupSystem = new BackupSystem();
await backupSystem.restoreFromBackup('backup_2024-01-15T02-00-00-000Z');
```

## Security Considerations

### Database Security
- Uses `PGPASSWORD` environment variable
- No passwords in command line arguments
- Secure file permissions on backup files

### Redis Security
- Supports password authentication
- RDB files contain all Redis data
- Backup files should be encrypted for long-term storage

### File Security
- Backup directory should have restricted access
- Consider encrypting backup files
- Secure transfer for off-site backups

## Troubleshooting

### Common Issues

#### pg_dump not found
```bash
# Install PostgreSQL client tools
sudo apt-get install postgresql-client
```

#### redis-cli not found
```bash
# Install Redis tools
sudo apt-get install redis-tools
```

#### Permission denied
```bash
# Check backup directory permissions
chmod 755 /path/to/backups
chown user:group /path/to/backups
```

#### Backup too large
- Enable compression: `compressionEnabled: true`
- Reduce retention period
- Consider incremental backups for very large databases

### Log Analysis
```bash
# Check backup logs
grep "backup" /var/log/area51-bot.log

# Monitor backup performance
grep "backup.*duration" /var/log/area51-bot.log
```

## Best Practices

### Backup Strategy
1. **Regular Testing**: Test restore procedures monthly
2. **Off-site Storage**: Copy backups to remote location
3. **Monitoring**: Set up alerts for backup failures
4. **Documentation**: Keep restore procedures updated

### Performance Optimization
1. **Schedule During Low Usage**: 2 AM is typically optimal
2. **Compression**: Always enable for space savings
3. **Retention Policy**: Balance storage vs. recovery needs
4. **Incremental Backups**: Consider for very large datasets

### Disaster Recovery
1. **Multiple Backup Locations**: Local + remote storage
2. **Recovery Testing**: Regular restore drills
3. **Documentation**: Clear recovery procedures
4. **Monitoring**: Backup health checks

## Integration with Bot

The backup system is fully integrated with the Area51 bot:

```javascript
// Backup service is available in bot instance
const backupStatus = await bot.backupService.getStatus();

// Manual backup through bot
const backupId = await bot.backupService.performBackup();

// Health check includes backup status
const health = await bot.monitoring.healthCheck.getStatus();
console.log(health.backup); // Backup system status
```

## Maintenance

### Regular Tasks
- Monitor backup success/failure rates
- Check available disk space
- Verify backup file integrity
- Test restore procedures
- Update retention policies as needed

### Cleanup
Old backups are automatically cleaned up based on retention policy, but manual cleanup can be performed:

```bash
# Manual cleanup (older than 7 days)
find /path/to/backups -name "backup_*" -mtime +7 -delete
```

This backup system ensures your Area51 bot data is protected and recoverable in case of any system failures or data corruption.
