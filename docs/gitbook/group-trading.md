# Group Trading

Area51 Bot brings seamless trading capabilities directly to your Telegram groups, making it easier than ever to trade Monad tokens without leaving your conversations.

## Overview

The Group Trading feature allows users to:
- **Instantly trade tokens** by mentioning the bot with contract addresses
- **View real-time token information** automatically when contracts are shared
- **Execute buy orders** directly from group chats
- **Access trading commands** through simple mentions

## How It Works

### Automatic Token Recognition

When any group member shares a Monad token contract address, Area51 Bot automatically:

1. **Detects the contract address** in the message
2. **Fetches real-time token data** from the Monad network
3. **Displays comprehensive token information** including:
   - Token name and symbol
   - Current price and market cap
   - 24h price change
   - Liquidity information
   - Contract verification status
   - Trading volume

### Quick Buy Feature

Users can instantly purchase tokens by mentioning the bot with a contract address:

```
@area51bot 0x1234...abcd
```

This triggers:
- Automatic token information display
- Quick buy buttons with preset amounts
- Custom amount input option
- Real-time price updates

## Group Commands

### Basic Commands

- **`@area51bot help`** - Display available group commands
- **`@area51bot [contract_address]`** - Show token info and buy options
- **`@area51bot buy [contract_address] [amount]`** - Quick buy with specific amount

### Token Information Display

When a contract address is detected, the bot shows:

```
🚀 Token Information

📊 Name: Example Token (EXT)
💰 Price: $0.0123 (+15.67%)
📈 Market Cap: $1.2M
💧 Liquidity: $456K
🔒 Contract: Verified ✅
📊 24h Volume: $89K

[Buy 0.1 MON] [Buy 0.5 MON] [Buy 1 MON] [Custom Amount]
```

## Security Features

### Group Safety
- **Read-only token detection** - Bot only reads messages, never stores group content
- **No private key exposure** - All trading happens through secure wallet connections
- **Permission-based access** - Users must connect their wallets to trade
- **Anti-spam protection** - Rate limiting prevents bot abuse

### Trading Security
- **Slippage protection** - Automatic slippage calculation
- **MEV protection** - Private mempool submission
- **Gas optimization** - Smart gas fee calculation
- **Transaction verification** - Real-time confirmation

## Setup for Groups

### Adding the Bot

1. **Add @area51bot** to your Telegram group
2. **Grant necessary permissions**:
   - Read messages (for contract detection)
   - Send messages (for token information)
   - Send inline keyboards (for trading buttons)

### Configuration

Group administrators can configure:
- **Auto-detection sensitivity** - How quickly bot responds to contracts
- **Display preferences** - What information to show
- **Trading limits** - Maximum amounts for quick buy buttons
- **Notification settings** - When to alert about new tokens

## Best Practices

### For Group Members
- **Verify contracts** before trading
- **Start with small amounts** when trying new tokens
- **Use the help command** to learn available features
- **Report suspicious tokens** to group admins

### For Group Administrators
- **Monitor bot activity** regularly
- **Set appropriate trading limits** for your community
- **Educate members** about safe trading practices
- **Keep bot permissions minimal** but functional

## Supported Features

### Token Types
- ✅ **Standard ERC-20 tokens** on Monad
- ✅ **Verified contracts** with full metadata
- ✅ **Liquidity pool tokens** with DEX integration
- ✅ **New token launches** with real-time data

### Trading Options
- ✅ **Market orders** with instant execution
- ✅ **Preset amounts** for quick trading
- ✅ **Custom amounts** for precise control
- ✅ **Slippage tolerance** adjustment

## Limitations

- **Monad network only** - Currently supports Monad tokens exclusively
- **Group context** - Full trading features require private chat setup
- **Rate limits** - Anti-spam measures may delay rapid requests
- **Network dependency** - Requires stable Monad network connection

## Troubleshooting

### Common Issues

**Bot not responding to contracts:**
- Check bot permissions in group settings
- Ensure contract address is valid Monad format
- Verify network connectivity

**Trading buttons not working:**
- Connect wallet in private chat first
- Check MON balance for gas fees
- Verify token has sufficient liquidity

**Information not updating:**
- Wait for network confirmation
- Check Monad network status
- Refresh by sending contract again

## Privacy & Data

- **No message storage** - Bot doesn't save group conversations
- **Minimal data collection** - Only trading-related information
- **User consent** - Trading requires explicit wallet connection
- **Transparent operations** - All actions are visible to users

---

*Ready to start group trading? Add @area51bot to your group and share a Monad token contract to see it in action!*