# 🧪 Testing Guide - Area51 Telegram Bot

## 📋 Pre-Testing Setup

### Environment Preparation
1. **Clone and Install**
```bash
git clone <repository-url>
cd area51-bot
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Configure all required variables (see below)
```

3. **Required Environment Variables**
```bash
# Essential for testing
TELEGRAM_BOT_TOKEN=your_test_bot_token
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_NAME=area51_bot_test
POSTGRES_USER=test_user
POSTGRES_PASSWORD=test_password
ENCRYPTION_KEY=test_32_character_encryption_key
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
CHAIN_ID=41454
```

4. **Database Setup**
```bash
npm run migrate
npm run test-migration
```

---

## 🚀 Testing Scenarios

### 1. Basic Bot Functionality

#### **Test 1.1: Bot Startup**
```bash
npm run dev
```
**Expected**: Bot starts without errors, connects to database and Redis

#### **Test 1.2: Health Checks**
```bash
curl http://localhost:3001/health
curl http://localhost:3001/health/detailed
```
**Expected**: All endpoints return 200 status

#### **Test 1.3: Basic Commands**
- Send `/start` to bot
- **Expected**: Welcome message with main menu

### 2. Wallet Management

#### **Test 2.1: Wallet Creation**
- Click "🔐 Wallet" → "Generate New Wallet"
- **Expected**: New wallet created with encrypted private key

#### **Test 2.2: Wallet Import**
- Click "🔐 Wallet" → "Import Wallet"
- Enter test private key
- **Expected**: Wallet imported successfully

#### **Test 2.3: Wallet Balance**
- Click "🔐 Wallet" → "Check Balance"
- **Expected**: MON balance displayed

### 3. Trading Functionality

#### **Test 3.1: Token Purchase**
- Navigate to "💰 Buy Tokens"
- Select a token from trending list
- Enter amount (e.g., 0.1 MON)
- **Expected**: Transaction executes successfully

#### **Test 3.2: Token Sale**
- Navigate to "💸 Sell Tokens"
- Select token from portfolio
- Enter percentage (e.g., 50%)
- **Expected**: Sell transaction completes

#### **Test 3.3: Auto-Buy Configuration**
- Go to "⚙️ Settings" → "🤖 Auto Buy"
- Configure amount, gas, slippage
- **Expected**: Settings saved and applied

### 4. Performance Testing

#### **Test 4.1: Cache Performance**
- Monitor logs for cache hit/miss ratios
- **Expected**: >95% cache hit ratio for user data

#### **Test 4.2: Response Time**
- Measure response times for common operations
- **Expected**: <2 seconds for most operations

#### **Test 4.3: Concurrent Users**
- Simulate multiple users simultaneously
- **Expected**: No performance degradation up to 100 users

### 5. Error Handling

#### **Test 5.1: Invalid Inputs**
- Enter invalid token addresses
- Enter negative amounts
- **Expected**: Proper error messages displayed

#### **Test 5.2: Network Failures**
- Disconnect from internet briefly
- **Expected**: Graceful error handling and retry

#### **Test 5.3: Database Failures**
- Stop PostgreSQL temporarily
- **Expected**: Error messages, automatic retry

---

## 🔍 Key Areas to Focus On

### Critical Functionality
1. **Wallet Security**: Ensure private keys are encrypted
2. **Transaction Execution**: Verify all trades complete successfully  
3. **Balance Accuracy**: Check portfolio values are correct
4. **Cache Performance**: Monitor Redis hit ratios
5. **Error Recovery**: Test system resilience

### Security Testing
1. **Input Validation**: Try SQL injection, XSS attempts
2. **Authentication**: Verify user isolation
3. **Private Key Protection**: Ensure no key exposure
4. **Rate Limiting**: Test excessive request handling

### Performance Benchmarks
- **Response Time**: <2s for 95% of requests
- **Cache Hit Ratio**: >95% for user data
- **Memory Usage**: <1GB under normal load
- **Database Connections**: <25 concurrent connections

---

## 📊 Monitoring During Tests

### Health Check Endpoints
```bash
# Basic health
curl http://localhost:3001/health

# Detailed system status
curl http://localhost:3001/health/detailed

# Database status
curl http://localhost:3001/health/database

# Redis status  
curl http://localhost:3001/health/redis

# System metrics
curl http://localhost:3001/metrics
```

### Log Monitoring
```bash
# Watch application logs
tail -f logs/app.log

# Monitor error logs
tail -f logs/error.log

# Database query logs
tail -f logs/database.log
```

---

## 🐛 Common Issues & Solutions

### Bot Not Responding
- **Check**: `TELEGRAM_BOT_TOKEN` is valid
- **Check**: Network connectivity to Telegram
- **Solution**: Verify token with @BotFather

### Database Connection Failed
- **Check**: PostgreSQL is running
- **Check**: Connection parameters in `.env`
- **Solution**: Restart PostgreSQL, verify credentials

### Redis Connection Issues
- **Note**: Bot works without Redis (degraded performance)
- **Check**: Redis server status
- **Solution**: Install/start Redis or continue without cache

### Transaction Failures
- **Check**: Wallet has sufficient MON balance
- **Check**: Gas settings are reasonable
- **Check**: Monad RPC connectivity
- **Solution**: Add funds, adjust gas, check network

### Memory Leaks
- **Monitor**: Memory usage over time
- **Check**: Connection pooling is working
- **Solution**: Restart bot if memory exceeds 1GB

---

## 📈 Performance Validation

### Expected Metrics
```json
{
  "cache_hit_ratio": "> 95%",
  "average_response_time": "< 2000ms",
  "database_connections": "< 25 active",
  "memory_usage": "< 1GB",
  "error_rate": "< 1%"
}
```

### Load Testing
```bash
# Simulate 50 concurrent users
npm run load-test

# Monitor system resources
htop
iostat -x 1
```

---

## ✅ Testing Checklist

### Pre-Deployment
- [ ] All environment variables configured
- [ ] Database migrations completed successfully
- [ ] Redis connection established (optional)
- [ ] Health checks return 200 status
- [ ] Bot responds to `/start` command
- [ ] Wallet creation/import works
- [ ] Token trading executes successfully
- [ ] Auto-buy configuration saves properly
- [ ] Error handling works for invalid inputs
- [ ] Performance metrics within acceptable ranges
- [ ] Security validation passed
- [ ] Backup system functional
- [ ] Monitoring endpoints accessible

### Post-Deployment
- [ ] Monitor logs for errors
- [ ] Check cache hit ratios
- [ ] Verify transaction success rates
- [ ] Monitor system resources
- [ ] Test disaster recovery procedures

---

## 🚨 Critical Test Cases

### Must-Pass Tests
1. **Wallet Security**: Private keys never exposed in logs
2. **Transaction Integrity**: All trades execute correctly
3. **Data Consistency**: Portfolio values match blockchain
4. **Error Recovery**: System handles failures gracefully
5. **Performance**: Meets response time requirements

### Red Flags
- Private keys in logs or error messages
- Transactions failing silently
- Cache hit ratio below 90%
- Memory usage growing continuously
- Database connection pool exhaustion
- Unhandled promise rejections

---

## 📞 Support During Testing

### Getting Help
- Check health endpoints for system status
- Review logs for detailed error information
- Use GitHub issues for bug reports
- Monitor system metrics for performance issues

### Reporting Issues
Include in bug reports:
- Error messages from logs
- Steps to reproduce
- Environment configuration
- System metrics at time of issue
- Expected vs actual behavior

---

**🎯 Testing Success Criteria**
- All critical functionality works
- Performance meets benchmarks  
- Security validation passes
- Error handling is robust
- System is ready for production use
