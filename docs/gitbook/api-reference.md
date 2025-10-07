# API Reference

Technical information about the APIs used by Area51 Bot.

## Overview

Area51 Bot uses two main APIs to provide trading services:

1. **Data API** - Token information, balances, wallet data
2. **Trading API** - Price quotes, transaction generation

## Data API

**Base URL:** `https://testnet-api.monorail.xyz/v1/`

### Key Endpoints

#### Get Token Information
```
GET /tokens/{address}
```
**Purpose:** Get details about a specific token

**Parameters:**
- `address` - Token contract address

**Response:** Token name, symbol, decimals, price

#### Get Wallet Balance
```
GET /wallets/{address}/balance
```
**Purpose:** Get wallet balance for all tokens

**Parameters:**
- `address` - Wallet address

**Response:** List of tokens and their balances

#### Get Token Price
```
GET /tokens/{address}/price
```
**Purpose:** Get current token price

**Parameters:**
- `address` - Token contract address

**Response:** Current price in MON and USD

## Trading API

**Base URL:** `https://testnet-pathfinder.monorail.xyz/v4/`

### Key Endpoints

#### Get Quote
```
POST /quote
```
**Purpose:** Get price quote for a trade

**Request Body:**
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "1000000000000000000",
  "slippage": 100
}
```

**Response:** Expected output amount, price impact, route

#### Generate Transaction
```
POST /transaction
```
**Purpose:** Generate transaction data for a trade

**Request Body:**
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "1000000000000000000",
  "slippage": 100,
  "recipient": "0x..."
}
```

**Response:** Transaction data ready to sign and send

## Common Parameters

### Token Addresses
- **MON Token:** `0x...` (native Monad token)
- **USDC:** `0x...` (USD Coin)
- **WETH:** `0x...` (Wrapped Ethereum)

### Slippage Values
- **Low Risk:** 50 (0.5%)
- **Medium Risk:** 100 (1.0%)
- **High Risk:** 500 (5.0%)

### Gas Settings
- **Standard:** 50 Gwei
- **Fast:** 100 Gwei
- **Turbo:** 200 Gwei

## Error Codes

### Common Errors

#### 400 - Bad Request
**Causes:**
- Invalid token address
- Invalid amount format
- Missing required parameters

**Solution:** Check request format and parameters

#### 404 - Not Found
**Causes:**
- Token doesn't exist
- Wallet address not found
- Invalid endpoint

**Solution:** Verify addresses and endpoints

#### 429 - Rate Limited
**Causes:**
- Too many requests
- API rate limit exceeded

**Solution:** Wait and retry with delays

#### 500 - Server Error
**Causes:**
- API server issues
- Network problems
- Temporary outages

**Solution:** Retry after a few minutes

## Rate Limits

### Data API Limits
- **100 requests per minute** per IP
- **1,000 requests per hour** per IP

### Trading API Limits
- **50 requests per minute** per IP
- **500 requests per hour** per IP

## Authentication

Currently, no authentication is required for testnet APIs.

**Note:** Mainnet APIs may require API keys or authentication.

## Response Formats

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data here
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

## SDK Usage

The bot uses these APIs internally. You don't need to call them directly.

### Example Bot Usage

```javascript
// Get token price
const price = await dataAPI.getTokenPrice(tokenAddress);

// Get trading quote
const quote = await tradingAPI.getQuote({
  tokenIn: MON_ADDRESS,
  tokenOut: tokenAddress,
  amount: amountInWei,
  slippage: slippagePercent
});

// Generate transaction
const txData = await tradingAPI.generateTransaction({
  ...quote,
  recipient: userWallet
});
```

## Network Information

### Monad Testnet
- **Chain ID:** 41454
- **RPC URL:** `https://lb.drpc.live/monad-testnet/AoOgZcz1jUo2kLGq0kMoG3ovAOf-o9gR8IGdwg8TMB_n`
- **Explorer:** `https://testnet.monadexplorer.com`

### Important Addresses
- **Monorail Router:** `0x...`
- **WMON Token:** `0x...`
- **Factory Contract:** `0x...`

## Best Practices

### API Usage
1. **Handle errors gracefully** - Always check for error responses
2. **Respect rate limits** - Don't exceed API limits
3. **Cache responses** - Cache data when appropriate
4. **Use retries** - Implement retry logic for failed requests

### Trading
1. **Validate inputs** - Check token addresses and amounts
2. **Set appropriate slippage** - Based on token liquidity
3. **Monitor gas prices** - Adjust for network conditions
4. **Check balances** - Ensure sufficient funds before trading

### Security
1. **Validate responses** - Don't trust API responses blindly
2. **Use HTTPS** - Always use secure connections
3. **Handle sensitive data** - Protect private keys and user data
4. **Log appropriately** - Log errors but not sensitive information

## Troubleshooting

### Common Issues

#### API Not Responding
**Solutions:**
- Check network connection
- Verify API endpoints
- Check Monad network status
- Try different RPC endpoints

#### Invalid Token Address
**Solutions:**
- Verify token exists on Monad
- Check address format (0x...)
- Use token list from API
- Confirm token is tradeable

#### Transaction Fails
**Solutions:**
- Increase gas limit
- Adjust slippage tolerance
- Check token approvals
- Verify wallet balance

#### Rate Limit Exceeded
**Solutions:**
- Implement request delays
- Use exponential backoff
- Cache API responses
- Optimize API usage

## API Documentation Links

### Full Documentation
- **Data API:** [Swagger Documentation](https://testnet-api.monorail.xyz/v1/swagger/doc.json)
- **Trading API:** [Swagger Documentation](https://testnet-pathfinder.monorail.xyz/v4/swagger/doc.json)

### Additional Resources
- **Monad Documentation:** Official Monad docs
- **Monorail Documentation:** DEX aggregator docs
- **Community Support:** Telegram groups and forums

## Updates and Changes

### API Versioning
- **Current Version:** v1 (Data API), v4 (Trading API)
- **Backward Compatibility:** Maintained for major versions
- **Deprecation Notice:** 30 days advance notice for changes

### Staying Updated
- **Monitor announcements** - Follow official channels
- **Test regularly** - Verify API functionality
- **Update dependencies** - Keep libraries current
- **Check documentation** - Review for changes

---

## Need Help?

For API-related questions:
- **Check documentation** - Review full API docs
- **Test endpoints** - Use API testing tools
- **Contact support** - For technical issues
- **Join community** - Ask other developers

**Remember:** This is testnet only. Mainnet APIs may differ.
