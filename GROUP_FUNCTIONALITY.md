# Group Functionality for Area51 Trading Bot

## Overview
The Area51 Trading Bot now supports group chat functionality, allowing users to interact with the bot in Telegram groups for token information and trading operations.

## Features

### 1. Token Recognition
- **Automatic Contract Detection**: The bot automatically detects contract addresses (0x...) posted in group chats
- **Token Symbol Recognition**: Recognizes common token symbols (3-10 characters)
- **Token Information Display**: Shows token details including price, market cap, and 24h change

### 2. Mention Commands
When the bot is mentioned (@botusername), it supports the following commands:

#### Buy Command
```
@area51bot buy <token> <amount>
```
- `<token>`: Token symbol or contract address
- `<amount>`: Amount to buy in MON

**Examples:**
- `@area51bot buy USDC 100`
- `@area51bot buy 0x1234...5678 50`

#### Help Command
```
@area51bot help
```
Shows available commands and usage instructions.

### 3. Automatic Token Info
When a contract address is posted in the group, the bot automatically:
1. Fetches token information
2. Displays token details
3. Provides quick action buttons (Chart, Explorer)

## Implementation Details

### Files Modified
- `src/handlers/groupHandlers.js` - New group functionality handler
- `src/index-modular-simple.js` - Integration with main bot
- Text handler updated to support group messages

### Key Methods
- `handleGroupMessage()` - Main entry point for group messages
- `handleTokenRecognition()` - Detects and processes token addresses/symbols
- `handleMentionCommand()` - Processes bot mentions and commands
- `executeBuyInGroup()` - Handles buy operations in groups

### Security Features
- Group chat validation
- User wallet verification
- Error handling and user feedback
- Rate limiting (inherited from main bot)

## Usage in Groups

1. **Add the bot to your group**
2. **Give the bot necessary permissions** (send messages, read messages)
3. **Start using the features:**
   - Post contract addresses for automatic token info
   - Mention the bot with buy commands
   - Use @botusername help for assistance

## Error Handling
- Invalid token addresses/symbols
- Insufficient balance warnings
- Network connectivity issues
- User-friendly error messages in Arabic

## Dependencies
- Unified Trading Engine integration
- MonorailAPI for token data
- Database for user settings
- Cache service for performance
- Monitoring system for logging

## Testing
Run the test script to verify functionality:
```bash
node test-group-functionality.js
```

## Notes
- All group operations use the same security and validation as private chat operations
- User settings (turbo mode, slippage, etc.) are respected in group operations
- Transaction confirmations are sent to the group for transparency