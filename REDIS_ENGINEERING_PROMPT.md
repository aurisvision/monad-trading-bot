# Redis Performance Engineering Prompt - Area51 Telegram Trading Bot

## Project Overview

You are tasked with optimizing Redis caching for a **high-frequency Telegram trading bot** operating on Monad testnet. This bot serves crypto traders who demand **sub-second response times** for trading operations. Performance is critical - every millisecond matters in trading scenarios.

### Core Application Details
- **Platform**: Node.js Telegram Bot (Telegraf framework)
- **Database**: PostgreSQL with Redis caching layer
- **Trading API**: Monorail API integration for Monad testnet
- **Architecture**: Modular design with 20+ components
- **User Base**: Active crypto traders requiring instant execution
- **Peak Load**: 100+ concurrent users, scaling to 10,000+

## Critical User Behavior Patterns

### 1. Trading Speed Requirements
- **Auto Buy Execution**: Users send token contract addresses expecting **instant purchases** (< 2 seconds total)
- **Portfolio Checks**: Frequent balance queries (every 10-30 seconds during active trading)
- **Settings Changes**: Gas price/slippage adjustments need immediate effect
- **Transaction Monitoring**: Real-time status updates for pending transactions

### 2. User Interaction Patterns
- **Burst Activity**: Heavy usage during market volatility (100+ requests/minute per user)
- **Session Duration**: 30-120 minutes of continuous trading
- **Multi-Operation Flows**: Buy → Check Portfolio → Adjust Settings → Sell (rapid succession)
- **Concurrent Actions**: Multiple users executing trades simultaneously

### 3. Data Access Patterns
- **Hot Data**: User settings, wallet balances, active transactions (accessed every few seconds)
- **Warm Data**: Portfolio holdings, transaction history (accessed every 1-5 minutes)
- **Cold Data**: Historical data, archived transactions (accessed rarely)

## Current Redis Implementation Analysis

### Existing Cache Structure
```javascript
// Current cache keys and TTL patterns:
- `settings:${userId}` - User trading settings (Static cache, manual invalidation)
- `user:${userId}` - User profile data (24h TTL)
- `portfolio:${userId}` - Token balances (5min TTL)
- `session:${userId}` - User session state (1h TTL)
- `tx:${userId}:${txHash}` - Transaction status (10min TTL)
```

### Performance Bottlenecks Identified
1. **Cache Invalidation Issues**: Inconsistent clearing after transactions
2. **Stale Data Problems**: Portfolio showing old balances after trades
3. **Cache Miss Penalties**: Expensive database queries during high load
4. **Memory Inefficiency**: No compression for large portfolio data
5. **Network Latency**: No Redis clustering or geographical distribution

## Technical Requirements

### 1. Performance Targets
- **Cache Hit Rate**: > 95% for user settings and portfolio data
- **Response Time**: < 50ms for cached data retrieval
- **Invalidation Speed**: < 100ms for cache clearing after transactions
- **Memory Usage**: < 2GB for 10,000 active users
- **Availability**: 99.9% uptime with failover mechanisms

### 2. Data Consistency Requirements
- **Strong Consistency**: User wallet balances, transaction states
- **Eventual Consistency**: Portfolio USD values, market data
- **Real-time Updates**: Transaction confirmations, balance changes
- **Atomic Operations**: Settings updates, multi-step trading flows

### 3. Scalability Requirements
- **Horizontal Scaling**: Support Redis clustering for 10,000+ users
- **Memory Management**: Efficient eviction policies for large datasets
- **Connection Pooling**: Optimize Redis connections for Node.js app
- **Monitoring**: Real-time metrics for cache performance

## Specific Optimization Areas

### 1. Cache Key Strategy
Design optimal key patterns for:
- User-specific data with efficient wildcarding
- Transaction-based invalidation triggers
- Hierarchical data structures (user → portfolio → tokens)
- Time-based expiration with business logic

### 2. Data Serialization
Optimize for:
- JSON vs MessagePack vs Protocol Buffers
- Compression for large portfolio objects
- Partial updates for nested structures
- Binary data for wallet encryption keys

### 3. Invalidation Strategy
Implement:
- Event-driven cache clearing (post-transaction)
- Batch invalidation for related data
- Graceful degradation during cache failures
- Proactive refresh for critical data

### 4. Memory Optimization
Configure:
- Appropriate eviction policies (LRU vs LFU vs TTL)
- Memory allocation for different data types
- Compression algorithms for large objects
- Efficient data structures (Hash vs String vs List)

## Application Integration Points

### 1. Database Layer (`database-postgresql.js`)
- 39KB file handling all PostgreSQL operations
- Current static cache implementation needs optimization
- User settings and portfolio queries are most frequent
- Transaction logging requires immediate cache updates

### 2. Trading Engine (`trading.js`, `monorail.js`)
- High-frequency buy/sell operations (22KB + 47KB files)
- Real-time balance updates after each trade
- Gas price calculations need sub-second caching
- Transaction status monitoring requires instant updates

### 3. Portfolio Service (`portfolioService.js`)
- 12KB file managing token balance displays
- USD price calculations with 5-minute cache
- Most accessed feature during active trading
- Requires atomic updates after transactions

### 4. Auto Buy Engine (`utils/autoBuyEngine.js`)
- Instant execution system for token purchases
- Rate limiting with 30-second cooldowns per user
- Requires immediate settings access and balance checks
- Critical path for user satisfaction

## Redis Configuration Requirements

### 1. Memory Configuration
```redis
# Suggested initial configuration
maxmemory 4gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### 2. Performance Tuning
```redis
# Optimize for speed
tcp-keepalive 300
timeout 0
tcp-backlog 511
databases 16
```

### 3. Persistence Strategy
- RDB snapshots for data recovery
- AOF for transaction-critical data
- Backup strategy for user wallet data
- Disaster recovery procedures

## Monitoring and Alerting

### 1. Key Metrics to Track
- Cache hit/miss ratios per operation type
- Memory usage and eviction rates
- Response times for critical trading operations
- Connection pool utilization
- Error rates and timeout incidents

### 2. Alert Thresholds
- Cache hit rate < 90% (Warning)
- Response time > 100ms (Critical)
- Memory usage > 80% (Warning)
- Connection failures > 1% (Critical)
- Transaction cache misses (Immediate)

## Success Criteria

### 1. Performance Improvements
- Reduce average trading operation time from 3s to < 1s
- Achieve 95%+ cache hit rate for user operations
- Eliminate stale balance display issues
- Support 10x user growth without performance degradation

### 2. User Experience Goals
- Instant portfolio updates after transactions
- Sub-second response to settings changes
- Zero cache-related trading failures
- Seamless experience during high market volatility

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Redis cluster setup and configuration
- Basic cache key strategy implementation
- Connection pooling optimization
- Monitoring dashboard setup

### Phase 2: Optimization (Week 2)
- Advanced serialization and compression
- Event-driven invalidation system
- Memory usage optimization
- Performance testing under load

### Phase 3: Scaling (Week 3)
- Horizontal scaling implementation
- Geographical distribution setup
- Disaster recovery procedures
- Production deployment and monitoring

## Technical Constraints

### 1. Application Constraints
- Node.js single-threaded event loop
- PostgreSQL as primary data store
- Existing Telegraf bot framework
- Current modular architecture must be preserved

### 2. Infrastructure Constraints
- Budget considerations for Redis hosting
- Network latency between components
- Backup and recovery requirements
- Compliance with data protection regulations

## Expected Deliverables

1. **Redis Architecture Design**: Detailed cluster and configuration setup
2. **Caching Strategy Document**: Key patterns, TTL policies, invalidation rules
3. **Performance Benchmarks**: Before/after metrics with load testing results
4. **Monitoring Setup**: Dashboards, alerts, and maintenance procedures
5. **Implementation Guide**: Step-by-step deployment and configuration
6. **Disaster Recovery Plan**: Backup, restore, and failover procedures

## Critical Success Factors

- **Zero Downtime**: Any Redis optimization must not interrupt trading operations
- **Data Integrity**: No loss of user balances or transaction data during migration
- **Performance Validation**: All changes must be validated under simulated trading load
- **Rollback Plan**: Ability to revert changes if performance degrades
- **Documentation**: Complete operational procedures for ongoing maintenance

This trading bot serves users who make split-second financial decisions. Any performance improvement directly impacts user satisfaction and trading success. The Redis optimization is critical for the bot's competitive advantage in the high-frequency trading space.
