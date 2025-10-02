# Group Commands

Area51 Bot responds to various commands and mentions in Telegram groups, making it easy to access trading features and information without leaving your conversations.

## Command Overview

### Mention-Based Commands

All group commands start with mentioning the bot:

```
@area51bot [command] [parameters]
```

### Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `help` | Show available commands | `@area51bot help` |
| `[contract]` | Display token info | `@area51bot 0x1234...` |
| `buy [contract] [amount]` | Quick buy token | `@area51bot buy 0x1234... 1` |
| `price [symbol]` | Get token price | `@area51bot price $MONAD` |
| `trending` | Show trending tokens | `@area51bot trending` |
| `gas` | Current gas prices | `@area51bot gas` |

## Basic Commands

### Help Command

```
@area51bot help
```

**Response:**
```
🤖 Area51 Bot - Group Commands

📊 Token Information:
• @area51bot [contract] - Show token details
• @area51bot price [symbol] - Get current price

🛒 Trading:
• @area51bot buy [contract] [amount] - Quick buy
• Connect wallet in private chat for trading

📈 Market Data:
• @area51bot trending - Top trending tokens
• @area51bot gas - Current gas prices

💡 Need more help? Start a private chat with me!
```

### Token Information

```
@area51bot 0x1234567890abcdef1234567890abcdef12345678
```

**Response:**
- Complete token information card
- Real-time price and market data
- Quick buy buttons
- Security indicators

### Price Check

```
@area51bot price $MONAD
@area51bot price MONAD
@area51bot price 0x1234...
```

**Response:**
```
💰 MONAD Price Update

Current: $1.234 (+5.67% 24h)
Market Cap: $123.4M
Volume 24h: $12.3M
Last Updated: 2 minutes ago

[📊 Full Details] [🛒 Buy Now]
```

## Trading Commands

### Quick Buy

```
@area51bot buy 0x1234... 0.5
@area51bot buy $MONAD 1
```

**Requirements:**
- Wallet connected in private chat
- Sufficient MON balance for gas
- Valid token contract

**Response:**
```
🛒 Quick Buy Initiated

Token: Example Token (EXT)
Amount: 0.5 MON (~$0.615)
Estimated Tokens: ~1,234 EXT

[Confirm Purchase] [Adjust Amount] [Cancel]
```

### Custom Amount

```
@area51bot buy 0x1234... custom
```

**Response:**
```
💰 Custom Amount Purchase

Token: Example Token (EXT)
Current Price: $0.0005

Enter amount in MON:
[0.1] [0.5] [1.0] [5.0] [Custom Input]
```

## Market Commands

### Trending Tokens

```
@area51bot trending
@area51bot trending 24h
@area51bot trending 7d
```

**Response:**
```
🔥 Trending on Monad (24h)

1️⃣ TokenA (TKA) +45.67% 🚀
2️⃣ TokenB (TKB) +23.45% 📈
3️⃣ TokenC (TKC) +18.90% ⬆️
4️⃣ TokenD (TKD) +12.34% 📊
5️⃣ TokenE (TKE) +8.76% 🔺

[View Details] [Full Rankings]
```

### Gas Tracker

```
@area51bot gas
@area51bot gas prices
```

**Response:**
```
⛽ Monad Gas Tracker

🚀 Fast: 25 gwei (~$0.05)
⚡ Standard: 20 gwei (~$0.04)
🐌 Slow: 15 gwei (~$0.03)

Network Status: 🟢 Normal
Block Time: ~1.2s
Pending Txs: 1,234

[Refresh] [Set Alert]
```

## Advanced Commands

### Token Search

```
@area51bot search gaming
@area51bot search "defi protocol"
```

**Response:**
```
🔍 Search Results: "gaming"

1️⃣ GameToken (GAME) - $0.123
   Gaming platform token
   
2️⃣ PlayCoin (PLAY) - $0.456
   Play-to-earn ecosystem
   
3️⃣ MetaGame (META) - $0.789
   Metaverse gaming hub

[View All] [Filter Results]
```

### Portfolio Summary

```
@area51bot portfolio
@area51bot pnl
```

**Requirements:** Connected wallet

**Response:**
```
📊 Your Portfolio Summary

Total Value: $1,234.56
24h Change: +$67.89 (+5.82%)

Top Holdings:
• MONAD: $456.78 (37%)
• TokenA: $234.56 (19%)
• TokenB: $123.45 (10%)

[Full Portfolio] [Rebalance]
```

## Utility Commands

### Network Status

```
@area51bot status
@area51bot network
```

**Response:**
```
🌐 Monad Network Status

Status: 🟢 Operational
Block Height: 1,234,567
TPS: 8,945 / 10,000
Validators: 156 active

Recent Blocks:
• Block 1,234,567 - 1.2s ago
• Block 1,234,566 - 2.4s ago
• Block 1,234,565 - 3.6s ago

[Explorer] [More Details]
```

### Price Alerts

```
@area51bot alert $MONAD $1.50
@area51bot alerts list
```

**Response:**
```
🔔 Price Alert Set

Token: MONAD
Target: $1.50 (current: $1.234)
Type: Above target (+21.6%)

You'll be notified when price reaches $1.50

[Manage Alerts] [Set Another]
```

## Command Modifiers

### Time Periods

```
@area51bot trending 1h    # 1 hour
@area51bot trending 24h   # 24 hours  
@area51bot trending 7d    # 7 days
@area51bot trending 30d   # 30 days
```

### Amount Formats

```
@area51bot buy 0x1234... 0.5      # 0.5 MON
@area51bot buy 0x1234... $10      # $10 worth
@area51bot buy 0x1234... 50%      # 50% of balance
@area51bot buy 0x1234... max      # Maximum amount
```

## Error Responses

### Invalid Command

```
❌ Command not recognized

Available commands:
• help - Show this help
• [contract] - Token info
• buy [contract] [amount] - Purchase
• trending - Top tokens
• gas - Gas prices

Type @area51bot help for full list
```

### Missing Parameters

```
⚠️ Missing required parameter

Usage: @area51bot buy [contract] [amount]
Example: @area51bot buy 0x1234... 0.5

[Show Examples] [Get Help]
```

### Wallet Not Connected

```
🔗 Wallet Connection Required

To use trading commands, please:
1. Start a private chat with @area51bot
2. Connect your wallet
3. Return to this group to trade

[Start Private Chat] [Learn More]
```

## Best Practices

### Command Usage
- **Use clear syntax** - Follow exact command formats
- **Check responses** - Read bot feedback carefully
- **Verify amounts** - Double-check trading parameters
- **Stay updated** - Commands may be added or changed

### Group Etiquette
- **Don't spam commands** - Respect rate limits
- **Use private chat** - For sensitive operations
- **Help others** - Share command knowledge
- **Report issues** - Notify admins of problems

### Security Tips
- **Verify contracts** - Always check token addresses
- **Start small** - Test with small amounts first
- **Use official commands** - Don't trust unofficial syntax
- **Keep wallet secure** - Never share private keys

## Rate Limits

### Command Limits
- **5 commands per minute** per user
- **20 commands per minute** per group
- **Cooldown period** - 30 seconds after limit
- **Premium users** - Higher limits available

### Trading Limits
- **3 trades per minute** per user
- **Maximum amount** - Based on wallet balance
- **Gas limit protection** - Prevents failed transactions
- **Slippage protection** - Automatic adjustment

---

*Group commands make Area51 Bot incredibly accessible, allowing you to trade and research Monad tokens without ever leaving your group conversations.*