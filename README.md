# Area51 Telegram Trading Bot

🛸 **Area51** - Enterprise-grade Telegram trading bot for Monad testnet with high-performance architecture supporting 10,000+ concurrent users.

## 🏗️ Architecture Overview

### System Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Telegram API  │◄──►│   Load Balancer  │◄──►│  Node.js Cluster│
└─────────────────┘    │    (Nginx)       │    │   (4 Workers)   │
                       └──────────────────┘    └─────────────────┘
                                │                        │
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Redis Cache      │◄──►│  PostgreSQL DB  │
                       │ (Rate Limiting)  │    │ (Connection Pool)│
                       └──────────────────┘    └─────────────────┘
                                │                        │
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Monitoring       │    │  Monad Network  │
                       │ (Prometheus)     │    │  (RPC Provider) │
                       └──────────────────┘    └─────────────────┘
```

### Core Components

#### 1. **Application Layer**
- **Main Bot (`src/index.js`)** - Primary bot logic with 100+ user capacity
- **Scalable Bot (`src/index-scalable.js`)** - Enterprise version for 10,000+ users
- **Cluster Manager (`src/cluster.js`)** - Multi-process management
- **Load Balancer (`src/loadBalancer.js`)** - Request distribution

#### 2. **Data Layer**
- **PostgreSQL Database** - Primary data storage with connection pooling
- **Redis Cache** - Session management and rate limiting
- **Database Manager (`src/database-postgresql.js`)** - ORM and query optimization

#### 3. **Security Layer**
- **Wallet Manager (`src/wallet.js`)** - AES-256 encryption for private keys
- **Security Module (`src/security.js`)** - Input validation and XSS protection
- **Rate Limiter (`src/rateLimiter.js`)** - Anti-spam and DDoS protection

#### 4. **Trading Engine**
- **Trading Module (`src/trading.js`)** - Buy/sell execution logic
- **Monorail Integration (`src/monorail.js`)** - DEX aggregator API
- **Portfolio Manager (`src/portfolio.js`)** - Real-time P&L tracking

#### 5. **Infrastructure**
- **Monitoring (`src/monitoring.js`)** - Prometheus metrics collection
- **Health Checks (`src/healthCheck.js`)** - System status monitoring
- **Error Handler (`src/errorHandler.js`)** - Centralized error management

## 🚀 Tech Stack

### Backend Technologies
- **Runtime**: Node.js 18+ with ES2022 features
- **Framework**: Telegraf.js 4.x for Telegram Bot API
- **Database**: PostgreSQL 13+ with connection pooling (pg module)
- **Cache**: Redis 6+ for session management and rate limiting
- **Blockchain**: ethers.js 6.x for Ethereum/Monad interactions

### Infrastructure & DevOps
- **Load Balancer**: Nginx with least-connections algorithm
- **Process Manager**: Node.js Cluster API with PM2 compatibility
- **Monitoring**: Prometheus + Grafana for metrics and alerting
- **Logging**: Winston with structured JSON logging
- **Containerization**: Docker with multi-stage builds

### External APIs
- **Monorail Pathfinder API**: `https://testnet-pathfinder.monorail.xyz/v4`
- **Monorail Data API**: `https://testnet-api.monorail.xyz/v1`
- **Monad RPC**: `https://testnet-rpc.monad.xyz`
- **Block Explorer**: `https://testnet.monadexplorer.com`

### Security & Encryption
- **Encryption**: AES-256-CBC for private key storage
- **Hashing**: bcrypt for password hashing
- **Validation**: joi for input validation
- **Rate Limiting**: Token bucket algorithm with Redis backend

## 📊 Performance Specifications

### Scalability Metrics
- **Concurrent Users**: 10,000+ simultaneous connections
- **Response Time**: <500ms for 95% of requests
- **Throughput**: 1,000+ transactions per minute
- **Database Connections**: 20 pooled connections with auto-scaling
- **Cache Hit Rate**: 90%+ with 5-minute TTL

### Resource Requirements
- **Memory**: 2GB RAM minimum, 8GB recommended for production
- **CPU**: 4 cores minimum, 8 cores recommended
- **Storage**: 100GB SSD for database and logs
- **Network**: 1Gbps bandwidth for high-frequency trading

## 🔧 Installation & Setup

### Prerequisites
```bash
# System Requirements
Node.js >= 18.0.0
PostgreSQL >= 13.0
Redis >= 6.0
Docker >= 20.10 (optional)
```

### Quick Start
```bash
# 1. Clone repository
git clone <repository-url>
cd area51-bot

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env.production
# Edit .env.production with your configuration

# 4. Initialize database
npm run setup:database

# 5. Start bot (development)
npm start

# 6. Start bot (production - scalable)
npm run start:production
```

### Docker Deployment
```bash
# Build and start all services
docker-compose up -d

# Scale bot instances
docker-compose up -d --scale bot=4

# Monitor logs
docker-compose logs -f bot
```

## ⚙️ Configuration

### Environment Variables

#### Core Configuration
```env
# Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
MONORAIL_APP_ID=2837175649443187
ENCRYPTION_KEY=your_32_character_encryption_key

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

# Network Configuration
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
CHAIN_ID=41454
```

#### Performance Tuning
```env
# Scaling Configuration
CLUSTER_WORKERS=4
MAX_CONNECTIONS_PER_WORKER=2500
DATABASE_POOL_SIZE=20
REDIS_POOL_SIZE=10

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_TRANSACTIONS_PER_HOUR=100
CACHE_TTL_SECONDS=300

# Trading Configuration
DEFAULT_SLIPPAGE_BPS=10
DEFAULT_GAS_PRICE_GWEI=20
DEFAULT_GAS_LIMIT=250000
```

## 🎯 Bot Features & Commands

### Core Trading Functions
- **💰 Buy Tokens** - Purchase tokens with MON (0.1, 0.5, 1, 5, 10 MON + custom amounts)
- **💸 Sell Tokens** - Sell tokens for MON (25%, 50%, 75%, 100% + custom percentages)
- **📊 Portfolio** - Real-time portfolio with P&L tracking and win rate statistics
- **🔄 Refresh** - Live balance updates from Monad network

### Wallet Management
- **👛 Wallet Info** - Display wallet address and balance
- **🔑 Export Private Key** - Encrypted display with auto-delete (30 seconds)
- **📝 Export Mnemonic** - Secure mnemonic phrase export
- **📥 Import Wallet** - Import existing wallet via private key or mnemonic
- **🗑️ Delete Wallet** - Secure wallet deletion with confirmation

### Advanced Features
- **📈 Categories** - Browse tokens by category (DeFi, Gaming, NFTs, Memecoins, Trending)
- **📤 Transfer** - Send MON to any wallet address with amount selection
- **⚙️ Settings** - Configure slippage, trading amounts, notifications, security
- **❓ Help** - Comprehensive bot guide and support information

### Security Features
- **🔒 AES-256 Encryption** - All private keys encrypted at rest
- **🕐 Auto-Delete Messages** - Sensitive data auto-deleted after 30 seconds
- **✅ Input Validation** - Comprehensive validation for all user inputs
- **🛡️ Rate Limiting** - Protection against spam and abuse
- **🔐 Session Management** - Secure session handling with Redis

## 🔗 API Integration

### Monorail DEX Aggregator
```javascript
// Quote API for best prices across DEXs
GET https://testnet-pathfinder.monorail.xyz/v4/quote
Parameters: from, to, amount, source=2837175649443187

// Data API for token information
GET https://testnet-api.monorail.xyz/v1/wallet/{address}/balances
GET https://testnet-api.monorail.xyz/v1/tokens/trending
```

### Monad Network Integration
```javascript
// RPC Provider Configuration
const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz', {
  chainId: 41454,
  name: 'monad-testnet'
});

// Transaction Monitoring
Explorer: https://testnet.monadexplorer.com/tx/{txHash}
```

## 📈 Monitoring & Analytics

### Metrics Collection
- **Response Times** - P50, P95, P99 latencies
- **Error Rates** - 4xx, 5xx error tracking
- **Database Performance** - Query times, connection pool usage
- **Trading Metrics** - Success rates, slippage analysis
- **User Analytics** - Active users, transaction volumes

### Health Checks
```bash
# Application Health
GET /health - Basic health check
GET /health/detailed - Comprehensive system status

# Metrics Endpoint
GET /metrics - Prometheus metrics format
```

### Logging Strategy
```javascript
// Structured logging with Winston
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Trade executed successfully",
  "userId": "12345",
  "txHash": "0x...",
  "token": "USDC",
  "amount": "100.00",
  "executionTime": "450ms"
}
```

## 🛡️ Security Implementation

### Encryption Standards
- **Private Keys**: AES-256-CBC with unique IV per encryption
- **Database**: Encrypted columns for sensitive data
- **Transport**: TLS 1.3 for all external communications
- **Storage**: Encrypted at rest with key rotation

### Access Control
- **Rate Limiting**: Token bucket algorithm with Redis
- **Input Validation**: joi schema validation for all inputs
- **SQL Injection**: Parameterized queries with pg module
- **XSS Protection**: HTML entity encoding for user content

## 🚀 Deployment Guide

### Production Deployment
```bash
# 1. Server Setup (Ubuntu 20.04+)
sudo apt update && sudo apt upgrade -y
sudo apt install nodejs npm postgresql redis-server nginx

# 2. Database Setup
sudo -u postgres createdb area51_bot
sudo -u postgres createuser area51_user

# 3. Application Deployment
git clone <repository>
cd area51-bot
npm ci --production
npm run build

# 4. Process Management
pm2 start ecosystem.config.js
pm2 startup
pm2 save

# 5. Nginx Configuration
sudo cp nginx.conf /etc/nginx/sites-available/area51-bot
sudo ln -s /etc/nginx/sites-available/area51-bot /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

### Docker Production Setup
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  bot:
    build: .
    replicas: 4
    environment:
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
  
  postgres:
    image: postgres:13
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
```

## 📋 Development

### Project Structure
```
area51-bot/
├── src/                    # Source code
│   ├── index.js           # Main bot (100 users)
│   ├── index-scalable.js  # Scalable bot (10,000+ users)
│   ├── cluster.js         # Process management
│   ├── database-postgresql.js # Database layer
│   ├── wallet.js          # Wallet management
│   ├── trading.js         # Trading engine
│   ├── monorail.js        # API integration
│   ├── portfolio.js       # Portfolio management
│   ├── security.js        # Security utilities
│   ├── monitoring.js      # Metrics collection
│   └── utils.js           # Helper functions
├── data/                  # Database files
├── logs/                  # Application logs
├── monitoring/            # Prometheus config
├── scripts/               # Deployment scripts
├── tests/                 # Test files
├── docker-compose.yml     # Docker configuration
├── ecosystem.config.js    # PM2 configuration
├── nginx.conf            # Nginx configuration
└── package.json          # Dependencies
```

### Testing
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Load testing
npm run test:load

# Security testing
npm run test:security
```

## 📞 Support & Maintenance

### Monitoring Alerts
- **High Error Rate**: >1% error rate triggers alert
- **Slow Response**: >1s response time triggers alert
- **Database Issues**: Connection failures or slow queries
- **Memory Usage**: >80% memory usage triggers scaling

### Maintenance Tasks
- **Daily**: Log rotation and cleanup
- **Weekly**: Database optimization and backup
- **Monthly**: Security updates and dependency updates
- **Quarterly**: Performance review and scaling assessment

### Support Channels
- **Technical Issues**: Create GitHub issue
- **Trading Support**: [@yahia_crypto](https://t.me/yahia_crypto)
- **Community**: [Telegram Group]
- **Documentation**: [Wiki Pages]

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the Monad community**
