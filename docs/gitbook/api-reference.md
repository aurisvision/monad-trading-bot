# 🔌 API Reference & Integration

Area51 Bot provides comprehensive APIs and integration capabilities for developers, advanced users, and institutional clients. Access real-time data, execute trades programmatically, and build custom applications on top of our infrastructure.

## 🎯 API Overview

### Available APIs
- **Trading API**: Execute buy/sell operations programmatically
- **Portfolio API**: Access portfolio data and analytics
- **Market Data API**: Real-time price and market information
- **Wallet API**: Wallet management and transaction history
- **Monitoring API**: System health and performance metrics

### API Architecture
- **RESTful Design**: Standard HTTP methods and status codes
- **JSON Format**: All requests and responses in JSON
- **Rate Limited**: Intelligent rate limiting for fair usage
- **Authenticated**: Secure API key authentication
- **Real-time**: WebSocket support for live data streams

*[Image placeholder: API architecture diagram]*

## 🔐 Authentication & Security

### API Key Management

**Obtaining API Keys**
1. Contact Area51 Bot support team
2. Complete verification process
3. Receive API credentials securely
4. Configure authentication in your application

**Authentication Methods**
```http
# Header-based authentication
Authorization: Bearer YOUR_API_KEY

# Query parameter authentication
GET /api/v1/portfolio?api_key=YOUR_API_KEY
```

### Security Best Practices
- **Secure Storage**: Never expose API keys in client-side code
- **Environment Variables**: Store keys in environment variables
- **Rotation**: Regularly rotate API keys
- **Permissions**: Use least-privilege access principles
- **Monitoring**: Monitor API usage for suspicious activity

*[Image placeholder: API security flow]*

## 📊 Market Data API

### Real-Time Price Data

**Get Token Price**
```http
GET /api/v1/tokens/{address}/price
```

**Response**
```json
{
  "success": true,
  "data": {
    "address": "0x1234...5678",
    "symbol": "TOKEN",
    "name": "Example Token",
    "price_usd": 1.25,
    "price_mon": 0.0045,
    "market_cap": 12500000,
    "volume_24h": 850000,
    "change_24h": 5.67,
    "liquidity": 2500000,
    "timestamp": "2025-09-22T06:59:55Z"
  }
}
```

**Get Multiple Token Prices**
```http
GET /api/v1/tokens/prices?addresses=0x1234,0x5678,0x9abc
```

### Market Analytics

**Get Market Overview**
```http
GET /api/v1/market/overview
```

**Response**
```json
{
  "success": true,
  "data": {
    "total_market_cap": 125000000,
    "total_volume_24h": 8500000,
    "active_tokens": 1250,
    "trending_tokens": [
      {
        "address": "0x1234...5678",
        "symbol": "TREND",
        "change_24h": 25.5,
        "volume_24h": 125000
      }
    ],
    "top_gainers": [...],
    "top_losers": [...]
  }
}
```

*[Image placeholder: Market data API examples]*

## 💼 Portfolio API

### Portfolio Information

**Get User Portfolio**
```http
GET /api/v1/portfolio/{user_id}
```

**Response**
```json
{
  "success": true,
  "data": {
    "user_id": "123456789",
    "total_value_usd": 5250.75,
    "total_value_mon": 1875.25,
    "total_pnl_usd": 1250.50,
    "total_pnl_percentage": 31.25,
    "holdings": [
      {
        "token_address": "0x1234...5678",
        "symbol": "TOKEN1",
        "balance": "1000.5",
        "value_usd": 1250.75,
        "value_mon": 450.25,
        "avg_buy_price": 1.15,
        "current_price": 1.25,
        "pnl_usd": 100.50,
        "pnl_percentage": 8.7,
        "last_updated": "2025-09-22T06:59:55Z"
      }
    ],
    "performance": {
      "best_performer": {...},
      "worst_performer": {...},
      "total_trades": 45,
      "win_rate": 67.5
    }
  }
}
```

### Transaction History

**Get Transaction History**
```http
GET /api/v1/portfolio/{user_id}/transactions?limit=50&offset=0
```

**Response**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "tx_123456",
        "type": "buy",
        "token_address": "0x1234...5678",
        "symbol": "TOKEN1",
        "amount": "100.5",
        "price": 1.25,
        "total_value": 125.625,
        "gas_fee": 0.05,
        "tx_hash": "0xabcd...ef01",
        "status": "confirmed",
        "timestamp": "2025-09-22T06:45:30Z"
      }
    ],
    "pagination": {
      "total": 145,
      "limit": 50,
      "offset": 0,
      "has_more": true
    }
  }
}
```

*[Image placeholder: Portfolio API response examples]*

## 🛒 Trading API

### Execute Trades

**Buy Token**
```http
POST /api/v1/trading/buy
Content-Type: application/json

{
  "user_id": "123456789",
  "token_address": "0x1234...5678",
  "amount_mon": "10.5",
  "slippage": 3.0,
  "gas_price": 50000000000
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "transaction_id": "tx_789012",
    "tx_hash": "0x1234...5678",
    "status": "pending",
    "estimated_tokens": "8.45",
    "estimated_gas": "0.025",
    "slippage_used": 2.1,
    "timestamp": "2025-09-22T06:59:55Z"
  }
}
```

**Sell Token**
```http
POST /api/v1/trading/sell
Content-Type: application/json

{
  "user_id": "123456789",
  "token_address": "0x1234...5678",
  "amount_tokens": "5.25",
  "slippage": 3.0,
  "gas_price": 50000000000
}
```

### Trading Quotes

**Get Trading Quote**
```http
POST /api/v1/trading/quote
Content-Type: application/json

{
  "type": "buy",
  "token_address": "0x1234...5678",
  "amount_mon": "10.0",
  "slippage": 3.0
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "quote_id": "quote_123456",
    "type": "buy",
    "input_amount": "10.0",
    "output_amount": "8.125",
    "price": 1.23,
    "price_impact": 0.15,
    "gas_estimate": "0.025",
    "route": [
      {
        "pool": "MON/TOKEN1",
        "percentage": 100
      }
    ],
    "expires_at": "2025-09-22T07:04:55Z"
  }
}
```

*[Image placeholder: Trading API workflow]*

## 💳 Wallet API

### Wallet Information

**Get Wallet Details**
```http
GET /api/v1/wallet/{user_id}
```

**Response**
```json
{
  "success": true,
  "data": {
    "user_id": "123456789",
    "wallet_address": "0xabcd...ef01",
    "mon_balance": "125.75",
    "mon_balance_usd": 157.19,
    "network": "monad_testnet",
    "last_updated": "2025-09-22T06:59:55Z"
  }
}
```

### Transaction Status

**Get Transaction Status**
```http
GET /api/v1/wallet/transaction/{tx_hash}
```

**Response**
```json
{
  "success": true,
  "data": {
    "tx_hash": "0x1234...5678",
    "status": "confirmed",
    "block_number": 1234567,
    "confirmations": 12,
    "gas_used": "21000",
    "gas_price": "50000000000",
    "timestamp": "2025-09-22T06:55:30Z"
  }
}
```

## 📈 Monitoring API

### System Health

**Get System Status**
```http
GET /api/v1/health
```

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-22T06:59:55Z",
  "uptime": "72h 15m 30s",
  "services": {
    "database": {
      "status": "healthy",
      "response_time": "15ms",
      "connections": {
        "active": 12,
        "max": 25
      }
    },
    "redis": {
      "status": "healthy",
      "response_time": "3ms",
      "memory_usage": "45%"
    },
    "monad_rpc": {
      "status": "healthy",
      "response_time": "125ms",
      "block_height": 1234567
    }
  }
}
```

### Performance Metrics

**Get Performance Stats**
```http
GET /api/v1/metrics
```

**Response**
```json
{
  "success": true,
  "data": {
    "active_users": 85,
    "transactions_24h": 1250,
    "volume_24h_usd": 125000,
    "avg_response_time": "250ms",
    "cache_hit_rate": 87.5,
    "error_rate": 0.02
  }
}
```

*[Image placeholder: Monitoring dashboard]*

## 🔄 WebSocket API

### Real-Time Data Streams

**Connect to WebSocket**
```javascript
const ws = new WebSocket('wss://api.area51bot.com/ws');

// Authentication
ws.send(JSON.stringify({
  type: 'auth',
  api_key: 'YOUR_API_KEY'
}));
```

**Subscribe to Price Updates**
```javascript
// Subscribe to token price updates
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'prices',
  tokens: ['0x1234...5678', '0xabcd...ef01']
}));

// Handle price updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'price_update') {
    console.log('Price update:', data.payload);
  }
};
```

**Subscribe to Portfolio Updates**
```javascript
// Subscribe to portfolio changes
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'portfolio',
  user_id: '123456789'
}));
```

### WebSocket Events

**Price Update Event**
```json
{
  "type": "price_update",
  "timestamp": "2025-09-22T06:59:55Z",
  "payload": {
    "address": "0x1234...5678",
    "symbol": "TOKEN1",
    "price_usd": 1.27,
    "change": 0.02
  }
}
```

**Transaction Event**
```json
{
  "type": "transaction",
  "timestamp": "2025-09-22T06:59:55Z",
  "payload": {
    "user_id": "123456789",
    "tx_hash": "0x1234...5678",
    "status": "confirmed",
    "type": "buy"
  }
}
```

*[Image placeholder: WebSocket connection flow]*

## 📚 SDK & Libraries

### Official SDKs

**JavaScript/Node.js SDK**
```bash
npm install @area51bot/sdk
```

```javascript
const Area51SDK = require('@area51bot/sdk');

const client = new Area51SDK({
  apiKey: 'YOUR_API_KEY',
  environment: 'testnet' // or 'mainnet'
});

// Get portfolio
const portfolio = await client.portfolio.get('123456789');

// Execute trade
const trade = await client.trading.buy({
  userId: '123456789',
  tokenAddress: '0x1234...5678',
  amountMon: '10.0',
  slippage: 3.0
});
```

**Python SDK**
```bash
pip install area51bot-sdk
```

```python
from area51bot import Area51Client

client = Area51Client(
    api_key='YOUR_API_KEY',
    environment='testnet'
)

# Get portfolio
portfolio = client.portfolio.get('123456789')

# Execute trade
trade = client.trading.buy(
    user_id='123456789',
    token_address='0x1234...5678',
    amount_mon='10.0',
    slippage=3.0
)
```

### Community Libraries

**Go SDK** (Community Maintained)
```go
import "github.com/area51bot/go-sdk"

client := area51.NewClient("YOUR_API_KEY")
portfolio, err := client.Portfolio.Get("123456789")
```

**PHP SDK** (Community Maintained)
```php
use Area51Bot\SDK\Client;

$client = new Client('YOUR_API_KEY');
$portfolio = $client->portfolio()->get('123456789');
```

*[Image placeholder: SDK usage examples]*

## 🔧 Integration Examples

### Trading Bot Integration

**Automated Trading Bot**
```javascript
const Area51SDK = require('@area51bot/sdk');

class TradingBot {
  constructor(apiKey, userId) {
    this.client = new Area51SDK({ apiKey });
    this.userId = userId;
  }

  async executeDCAStrategy() {
    const tokens = ['0x1234...5678', '0xabcd...ef01'];
    const amountPerToken = '5.0';

    for (const token of tokens) {
      try {
        const quote = await this.client.trading.getQuote({
          type: 'buy',
          tokenAddress: token,
          amountMon: amountPerToken,
          slippage: 3.0
        });

        if (quote.priceImpact < 2.0) {
          await this.client.trading.buy({
            userId: this.userId,
            tokenAddress: token,
            amountMon: amountPerToken,
            slippage: 3.0
          });
        }
      } catch (error) {
        console.error(`Failed to buy ${token}:`, error);
      }
    }
  }
}
```

### Portfolio Analytics Dashboard

**Real-time Dashboard**
```javascript
class PortfolioDashboard {
  constructor(apiKey, userId) {
    this.client = new Area51SDK({ apiKey });
    this.userId = userId;
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.ws = this.client.websocket.connect();
    
    this.ws.subscribe('portfolio', this.userId);
    this.ws.on('portfolio_update', (data) => {
      this.updateDashboard(data);
    });
  }

  async loadInitialData() {
    const portfolio = await this.client.portfolio.get(this.userId);
    const transactions = await this.client.portfolio.getTransactions(this.userId);
    
    this.renderPortfolio(portfolio);
    this.renderTransactions(transactions);
  }

  updateDashboard(data) {
    // Update UI with real-time data
    this.updatePortfolioValue(data.totalValue);
    this.updatePnL(data.totalPnL);
  }
}
```

*[Image placeholder: Integration architecture]*

## 📊 Rate Limits & Quotas

### API Rate Limits

Based on our system analysis, Area51 Bot implements the following rate limits:

**Standard Limits**
- **30 requests per minute** per API key
- **1,000 requests per hour** per API key
- **10,000 requests per day** per API key

**Endpoint-Specific Limits**
- **Trading endpoints**: 20 requests per minute
- **Portfolio endpoints**: 60 requests per minute
- **Market data endpoints**: 100 requests per minute
- **WebSocket connections**: 5 concurrent connections per API key

**Rate Limit Headers**
```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1632150000
X-RateLimit-Retry-After: 60
```

### Handling Rate Limits

**Exponential Backoff**
```javascript
async function makeRequestWithRetry(requestFn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      if (error.status === 429) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

*[Image placeholder: Rate limiting flow]*

## 🔍 Error Handling

### Error Response Format

**Standard Error Response**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient MON balance for transaction",
    "details": {
      "required": "10.5",
      "available": "8.2"
    },
    "timestamp": "2025-09-22T06:59:55Z"
  }
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_API_KEY` | Invalid or expired API key | 401 |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded | 429 |
| `INSUFFICIENT_BALANCE` | Insufficient token balance | 400 |
| `INVALID_TOKEN_ADDRESS` | Invalid token contract address | 400 |
| `SLIPPAGE_EXCEEDED` | Transaction slippage too high | 400 |
| `NETWORK_ERROR` | Monad network connectivity issue | 503 |
| `INTERNAL_ERROR` | Internal server error | 500 |

### Error Handling Best Practices

```javascript
try {
  const result = await client.trading.buy({
    userId: '123456789',
    tokenAddress: '0x1234...5678',
    amountMon: '10.0'
  });
} catch (error) {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      console.log('Not enough MON tokens');
      break;
    case 'RATE_LIMIT_EXCEEDED':
      console.log('Rate limit hit, waiting...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      break;
    case 'SLIPPAGE_EXCEEDED':
      console.log('Slippage too high, retrying with higher tolerance');
      break;
    default:
      console.error('Unexpected error:', error);
  }
}
```

## 🆘 API Support

### Getting API Access

**Request API Access**
1. **Contact Support**: Reach out through official channels
2. **Provide Details**: Describe your use case and requirements
3. **Verification**: Complete identity and use case verification
4. **Receive Credentials**: Get your API key and documentation

**API Tiers**
- **Developer**: Free tier with basic limits
- **Professional**: Higher limits for production applications
- **Enterprise**: Custom limits and dedicated support

### Support Resources

**Documentation & Guides**
- **API Reference**: Complete endpoint documentation
- **SDK Documentation**: Language-specific guides
- **Integration Examples**: Real-world implementation examples
- **Best Practices**: Performance and security guidelines

**Community Support**
- **Developer Forum**: [GitHub Discussions](https://github.com/devYahia/area51-bot/discussions)
- **Telegram Group**: [@Area51Developers](https://t.me/Area51Developers)
- **Stack Overflow**: Tag questions with `area51bot`
- **Discord**: Developer community server

**Direct Support**
- **Technical Support**: api-support@area51bot.com
- **Partnership Inquiries**: partnerships@area51bot.com
- **Security Issues**: security@area51bot.com
- **General Questions**: support@area51bot.com

*[Image placeholder: Support channels overview]*

---

## 🚀 Getting Started with API

Ready to integrate Area51 Bot into your application?

1. **Request API Access**: Contact our team for API credentials
2. **Choose Your SDK**: Select from our official SDKs or use direct HTTP
3. **Read the Docs**: Familiarize yourself with endpoints and responses
4. **Start Building**: Begin with simple portfolio queries
5. **Join Community**: Connect with other developers

---

**Build the Future of DeFi** 🔌

Our APIs provide the foundation for the next generation of DeFi applications and trading tools.

*Last updated: September 2025*
