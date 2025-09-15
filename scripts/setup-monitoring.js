#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Area51 Bot Monitoring System...\n');

// Check if Docker is installed
function checkDocker() {
    try {
        execSync('docker --version', { stdio: 'ignore' });
        console.log('✅ Docker is installed');
        return true;
    } catch (error) {
        console.log('❌ Docker is not installed or not in PATH');
        console.log('Please install Docker Desktop from: https://www.docker.com/products/docker-desktop');
        return false;
    }
}

// Check if Docker Compose is available
function checkDockerCompose() {
    try {
        execSync('docker-compose --version', { stdio: 'ignore' });
        console.log('✅ Docker Compose is available');
        return true;
    } catch (error) {
        try {
            execSync('docker compose version', { stdio: 'ignore' });
            console.log('✅ Docker Compose (v2) is available');
            return true;
        } catch (error2) {
            console.log('❌ Docker Compose is not available');
            return false;
        }
    }
}

// Create monitoring directories
function createDirectories() {
    const dirs = [
        'docker/grafana/provisioning/datasources',
        'docker/grafana/provisioning/dashboards',
        'docker/grafana/dashboards',
        'src/monitoring'
    ];

    dirs.forEach(dir => {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`✅ Created directory: ${dir}`);
        } else {
            console.log(`✅ Directory exists: ${dir}`);
        }
    });
}

// Update package.json with monitoring scripts
function updatePackageJson() {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Add monitoring scripts
        if (!packageJson.scripts) {
            packageJson.scripts = {};
        }
        
        packageJson.scripts['monitoring:start'] = 'docker-compose -f docker/docker-compose.monitoring.yml up -d';
        packageJson.scripts['monitoring:stop'] = 'docker-compose -f docker/docker-compose.monitoring.yml down';
        packageJson.scripts['monitoring:logs'] = 'docker-compose -f docker/docker-compose.monitoring.yml logs -f';
        packageJson.scripts['monitoring:restart'] = 'npm run monitoring:stop && npm run monitoring:start';
        
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log('✅ Updated package.json with monitoring scripts');
    }
}

// Create environment template
function createEnvTemplate() {
    const envTemplatePath = path.join(process.cwd(), '.env.monitoring.example');
    const envTemplate = `# Monitoring Configuration
ADMIN_CHAT_ID=your_telegram_chat_id_here
GRAFANA_ADMIN_PASSWORD=area51admin
PROMETHEUS_RETENTION=200h

# Database connection for postgres-exporter
POSTGRES_EXPORTER_DSN=postgresql://username:password@localhost:5432/area51_bot?sslmode=disable

# Redis connection for redis-exporter
REDIS_URL=redis://localhost:6379

# Alert webhook URL
ALERT_WEBHOOK_URL=http://localhost:3001/webhook/alerts
`;

    fs.writeFileSync(envTemplatePath, envTemplate);
    console.log('✅ Created .env.monitoring.example template');
}

// Create monitoring setup script
function createSetupScript() {
    const setupScriptPath = path.join(process.cwd(), 'scripts/start-monitoring.bat');
    const setupScript = `@echo off
echo Starting Area51 Bot Monitoring Stack...

echo Pulling Docker images...
docker-compose -f docker/docker-compose.monitoring.yml pull

echo Starting monitoring services...
docker-compose -f docker/docker-compose.monitoring.yml up -d

echo Waiting for services to start...
timeout /t 10

echo.
echo ========================================
echo   Area51 Bot Monitoring Stack Started
echo ========================================
echo.
echo Grafana Dashboard: http://localhost:3000
echo   Username: admin
echo   Password: area51admin
echo.
echo Prometheus: http://localhost:9090
echo AlertManager: http://localhost:9093
echo.
echo Bot Metrics: http://localhost:3001/metrics
echo Bot Health: http://localhost:3001/health
echo.
echo ========================================
`;

    fs.writeFileSync(setupScriptPath, setupScript);
    console.log('✅ Created start-monitoring.bat script');
}

// Create monitoring integration guide
function createIntegrationGuide() {
    const guidePath = path.join(process.cwd(), 'docs/MONITORING_SETUP.md');
    const guide = `# Area51 Bot Monitoring Setup Guide

## Overview
This guide will help you set up comprehensive monitoring for the Area51 Telegram bot using Prometheus, Grafana, and AlertManager.

## Prerequisites
- Docker Desktop installed
- Docker Compose available
- Area51 bot running on port 3001

## Quick Start

### 1. Install Dependencies
\`\`\`bash
npm install prom-client
\`\`\`

### 2. Start Monitoring Stack
\`\`\`bash
# Windows
scripts\\start-monitoring.bat

# Linux/Mac
npm run monitoring:start
\`\`\`

### 3. Access Dashboards
- **Grafana**: http://localhost:3000 (admin/area51admin)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

## Integration with Bot

### 1. Update your main bot file
\`\`\`javascript
const MonitoringSystem = require('./src/monitoring');

// Initialize monitoring
const monitoring = new MonitoringSystem(database, redis, logger);

// Add monitoring endpoints to Express app
monitoring.initializeEndpoints(app);

// Use Telegram middleware
bot.use(monitoring.getTelegramMiddleware());

// Set bot instance for admin alerts
monitoring.setTelegramBot(bot);
\`\`\`

### 2. Wrap operations for metrics
\`\`\`javascript
// Database operations
const wrappedQuery = monitoring.wrapDatabaseOperation(
    database.query.bind(database), 
    'select_user'
);

// Trading operations
const wrappedTrade = monitoring.wrapTradingOperation(
    tradingEngine.executeBuy.bind(tradingEngine),
    'buy'
);

// API calls
const wrappedApiCall = monitoring.wrapApiCall(
    monorailApi.getQuote.bind(monorailApi),
    'monorail',
    'quote'
);
\`\`\`

## Available Metrics

### System Metrics
- Memory usage (heap, RSS, external)
- CPU usage percentage
- Active database connections
- Redis connection status

### Bot Metrics
- Active users count
- Telegram messages processed
- Trading operations (buy/sell/transfer)
- Trading volume in MON
- Cache hit ratio

### Error Metrics
- Error count by type and severity
- Database query failures
- Redis operation failures
- API call failures

## Alerts

### Critical Alerts
- High memory usage (>90%)
- Database connection failures
- Bot instance down

### Warning Alerts
- High error rate (>10%)
- Slow API responses
- Low cache hit ratio (<70%)

## Configuration

### Environment Variables
Copy \`.env.monitoring.example\` to \`.env.monitoring\` and configure:
- \`ADMIN_CHAT_ID\`: Your Telegram chat ID for critical alerts
- \`POSTGRES_EXPORTER_DSN\`: Database connection string
- \`REDIS_URL\`: Redis connection URL

### Custom Alerts
Edit \`docker/alert_rules.yml\` to add custom alert rules.

### Dashboard Customization
- Import additional dashboards in Grafana
- Modify \`docker/grafana/dashboards/area51-bot-dashboard.json\`

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure ports 3000, 9090, 9093 are available
2. **Docker permissions**: Run Docker as administrator on Windows
3. **Network issues**: Check Docker network configuration

### Logs
\`\`\`bash
# View all monitoring logs
npm run monitoring:logs

# View specific service logs
docker-compose -f docker/docker-compose.monitoring.yml logs grafana
\`\`\`

### Health Checks
- Bot health: http://localhost:3001/health
- Prometheus targets: http://localhost:9090/targets
- Grafana datasources: http://localhost:3000/datasources

## Production Deployment

### Security
- Change default Grafana password
- Configure proper authentication
- Use HTTPS for external access
- Restrict network access to monitoring ports

### Scaling
- Use external Prometheus for multiple bot instances
- Configure Grafana for high availability
- Set up external alerting (email, Slack, etc.)

### Backup
- Backup Grafana dashboards and datasources
- Export Prometheus data for long-term storage
- Document custom alert rules and configurations
`;

    // Create docs directory if it doesn't exist
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    fs.writeFileSync(guidePath, guide);
    console.log('✅ Created monitoring setup guide');
}

// Main setup function
async function main() {
    console.log('Checking prerequisites...\n');
    
    const dockerOk = checkDocker();
    const composeOk = checkDockerCompose();
    
    if (!dockerOk || !composeOk) {
        console.log('\n❌ Prerequisites not met. Please install Docker and try again.');
        process.exit(1);
    }
    
    console.log('\nSetting up monitoring system...\n');
    
    createDirectories();
    updatePackageJson();
    createEnvTemplate();
    createSetupScript();
    createIntegrationGuide();
    
    console.log('\n🎉 Monitoring system setup complete!\n');
    console.log('Next steps:');
    console.log('1. Copy .env.monitoring.example to .env.monitoring and configure');
    console.log('2. Update your bot code to integrate monitoring (see docs/MONITORING_SETUP.md)');
    console.log('3. Run: npm run monitoring:start');
    console.log('4. Access Grafana at http://localhost:3000 (admin/area51admin)');
    console.log('\nFor detailed instructions, see docs/MONITORING_SETUP.md');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
