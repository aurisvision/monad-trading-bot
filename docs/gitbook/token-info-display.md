# Token Information Display

Area51 Bot automatically recognizes and displays comprehensive information about Monad tokens when contract addresses are shared in groups or private chats.

## Automatic Detection

### How It Works

The bot continuously monitors messages for:
- **Contract addresses** in standard Monad format (0x...)
- **Token symbols** mentioned with $ prefix ($TOKEN)
- **Direct mentions** with contract addresses (@area51bot 0x...)

### Recognition Patterns

```
✅ Supported formats:
- 0x1234567890abcdef1234567890abcdef12345678
- $MONAD, $TOKEN, $SYMBOL
- @area51bot 0x1234...

❌ Not recognized:
- Incomplete addresses
- Non-Monad contracts
- Invalid checksums
```

## Information Display

### Standard Token Card

When a token is detected, the bot displays:

```
🚀 MONAD TOKEN DETECTED

🏷️ Token: Example Token (EXT)
💰 Price: $0.0123 (+15.67% 24h)
📊 Market Cap: $1,234,567
💧 Liquidity: $456,789
🔄 Volume 24h: $89,012

📈 Price Chart: [View on DEX]
🔍 Contract: 0x1234...5678 ✅ Verified
⚡ Network: Monad Mainnet

[🛒 Buy 0.1 MON] [🛒 Buy 0.5 MON] [🛒 Buy 1 MON] [💰 Custom]
```

### Data Sources

Information is fetched from:
- **Monad Network** - Real-time blockchain data <mcreference link="https://www.monad.xyz/ecosystem" index="5">5</mcreference>
- **DEX Aggregators** - Price and liquidity data
- **Token Registry** - Metadata and verification status
- **Analytics APIs** - Trading volume and market metrics

## Display Components

### Price Information
- **Current Price** - Real-time USD value
- **24h Change** - Percentage and absolute change
- **Price Trend** - Visual indicators (🔺🔻)
- **Historical Data** - 7d/30d performance

### Market Data
- **Market Capitalization** - Total token value
- **Circulating Supply** - Available tokens
- **Total Supply** - Maximum token count
- **Holder Count** - Number of unique holders

### Liquidity Metrics
- **Total Liquidity** - Available trading liquidity
- **Liquidity Pools** - DEX pool information
- **Pool Composition** - Token pair ratios
- **Liquidity Depth** - Order book analysis

### Security Indicators
- **Contract Verification** - ✅ Verified / ⚠️ Unverified
- **Audit Status** - Security audit results
- **Risk Assessment** - Automated risk scoring
- **Honeypot Detection** - Scam protection alerts

## Customization Options

### Display Preferences

Users can customize what information appears:

```
⚙️ Display Settings:
□ Show price charts
□ Include market cap
□ Display holder count
□ Show liquidity depth
□ Include risk warnings
□ Auto-refresh data
```

### Update Frequency
- **Real-time** - Instant updates (premium)
- **1 minute** - Standard refresh rate
- **5 minutes** - Basic update interval
- **Manual** - Update on request only

## Interactive Features

### Quick Actions

Each token display includes:
- **Buy Buttons** - Preset amount purchases
- **Custom Amount** - User-defined purchase
- **Add to Watchlist** - Track token performance
- **Share Token** - Forward to other chats
- **Price Alerts** - Set notification triggers

### Chart Integration

```
📈 Price Chart Options:
- 1h, 4h, 24h, 7d, 30d timeframes
- Candlestick and line charts
- Volume overlay
- Technical indicators
- Mobile-optimized display
```

## Advanced Features

### Multi-Token Detection

When multiple tokens are mentioned:

```
🔍 Multiple tokens detected:

1️⃣ Token A (TKA) - $0.123 (+5.67%)
2️⃣ Token B (TKB) - $0.456 (-2.34%)
3️⃣ Token C (TKC) - $0.789 (+12.45%)

[View All] [Compare] [Bulk Actions]
```

### Portfolio Integration

For connected users:
- **Holdings Display** - Show owned amounts
- **P&L Calculation** - Profit/loss tracking
- **Portfolio Percentage** - Allocation display
- **Rebalancing Suggestions** - Optimization tips

## Error Handling

### Invalid Contracts

```
❌ Contract Not Found

The address 0x1234... could not be found on Monad network.

Possible reasons:
• Invalid contract address
• Token not yet deployed
• Network connectivity issues

[Retry] [Report Issue]
```

### Network Issues

```
⚠️ Data Temporarily Unavailable

Unable to fetch token information due to:
• Monad network congestion
• API rate limits
• Temporary service outage

[Retry in 30s] [Use Cached Data]
```

## Privacy & Performance

### Data Caching
- **Smart Caching** - Reduces API calls
- **Cache Invalidation** - Ensures fresh data
- **Offline Mode** - Cached data when offline
- **Bandwidth Optimization** - Minimal data usage

### Privacy Protection
- **No Data Storage** - Token queries not logged
- **Anonymous Requests** - No user tracking
- **Secure APIs** - Encrypted data transmission
- **GDPR Compliant** - Privacy-first approach

## Configuration

### Group Settings

Administrators can configure:

```
🛠️ Group Configuration:
□ Auto-detect tokens
□ Show buy buttons
□ Display price alerts
□ Allow custom amounts
□ Enable chart links
□ Moderate token posts
```

### Rate Limiting
- **Detection Frequency** - Max tokens per minute
- **User Limits** - Requests per user
- **Group Limits** - Total group activity
- **Cooldown Periods** - Anti-spam delays

## Best Practices

### For Users
- **Verify Information** - Cross-check with official sources
- **Check Multiple Sources** - Don't rely on single data point
- **Understand Risks** - Read security indicators
- **Use Responsibly** - Don't spam token addresses

### For Groups
- **Set Clear Rules** - Token sharing guidelines
- **Monitor Activity** - Watch for spam or scams
- **Educate Members** - Share safety practices
- **Regular Updates** - Keep bot permissions current

---

*The token information display feature makes it easy to research and analyze Monad tokens directly within your Telegram conversations, providing instant access to crucial trading data.*