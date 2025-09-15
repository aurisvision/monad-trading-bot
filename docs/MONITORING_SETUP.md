# Area51 Bot Monitoring Setup Guide

## Overview
This guide will help you set up comprehensive monitoring for the Area51 Telegram bot using Prometheus, Grafana, and AlertManager.

## Prerequisites
- Docker Desktop installed
- Docker Compose available
- Area51 bot running on port 3001

## Quick Start

### 1. Install Dependencies
```bash
npm install prom-client
```

### 2. Start Monitoring Stack
```bash
# Windows
scripts\start-monitoring.bat

# Linux/Mac
npm run monitoring:start
```

### 3. Access Dashboards
- **Grafana**: http://localhost:3000 (admin/area51admin)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

## Integration with Bot

### 1. Update your main bot file
```javascript
const MonitoringSystem = require('./src/monitoring');

// Initialize monitoring
const monitoring = new MonitoringSystem(database, redis, logger);

// Add monitoring endpoints to Express app
monitoring.initializeEndpoints(app);

// Use Telegram middleware
bot.use(monitoring.getTelegramMiddleware());

// Set bot instance for admin alerts
monitoring.setTelegramBot(bot);
```

### 2. Wrap operations for metrics
```javascript
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
```

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
Copy `.env.monitoring.example` to `.env.monitoring` and configure:
- `ADMIN_CHAT_ID`: Your Telegram chat ID for critical alerts
- `POSTGRES_EXPORTER_DSN`: Database connection string
- `REDIS_URL`: Redis connection URL

### Custom Alerts
Edit `docker/alert_rules.yml` to add custom alert rules.

### Dashboard Customization
- Import additional dashboards in Grafana
- Modify `docker/grafana/dashboards/area51-bot-dashboard.json`

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure ports 3000, 9090, 9093 are available
2. **Docker permissions**: Run Docker as administrator on Windows
3. **Network issues**: Check Docker network configuration

### Logs
```bash
# View all monitoring logs
npm run monitoring:logs

# View specific service logs
docker-compose -f docker/docker-compose.monitoring.yml logs grafana
```

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
