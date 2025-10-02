# 🧪 Group Functionality Testing Guide - Area51 Bot

## 📋 Overview

This guide explains how to test all new group functionalities in the Area51 bot.

## 🔧 Local Testing

### 1. Running Automated Tests

```bash
# Run comprehensive test
npm run test:group

# Run quick test
npm run test:quick

# Run syntax check
npm run test:syntax
```

### 2. Code Validation

```bash
# Check syntax errors
node -c src/handlers/groupHandlers.js
node -c src/index-modular-simple.js

# Check all files
find src -name "*.js" -exec node -c {} \;
```

## 🤖 Testing with Telegram

### Prerequisites

1. **Create Test Group:**
   - Create a new group in Telegram
   - Add the bot to the group
   - Grant admin permissions to the bot (optional)

2. **Prepare Data:**
   - Ensure user has a wallet
   - Ensure database connection
   - Ensure MonorailAPI is working

### Testing Scenarios

#### 🪙 Token Recognition Testing

**1. Contract Address:**
```
0x1234567890123456789012345678901234567890
```

**Expected Result:**
- Bot should automatically recognize the contract
- Display token information
- Show price, market cap, 24h change
- Provide buy button/instructions

**2. Token Symbol:**
```
USDC
ETH
WETH
```

**Expected Result:**
- Bot should recognize common token symbols
- Display token information automatically
- Show relevant market data

#### 💰 Buy Command Testing

**1. Basic Buy Command:**
```
@YourBotUsername buy USDC 5
```

**Expected Result:**
- Bot processes the command
- Shows processing message
- Executes the trade
- Shows success/failure message
- Displays transaction hash

**2. Buy with Contract Address:**
```
@YourBotUsername buy 0x1234567890123456789012345678901234567890 10
```

**Expected Result:**
- Bot recognizes contract address
- Processes the buy order
- Shows transaction details

**3. Invalid Commands:**
```
@YourBotUsername buy
@YourBotUsername buy USDC
@YourBotUsername buy USDC abc
```

**Expected Result:**
- Bot shows error messages
- Provides correct usage format
- Doesn't execute invalid trades

#### ❓ Help Command Testing

**1. Help Command:**
```
@YourBotUsername help
```

**Expected Result:**
- Shows available commands
- Explains usage format
- Provides examples

#### 🔒 Security Testing

**1. Normal Messages (Should be Ignored):**
```
Hello everyone!
How are you?
Check this out: https://example.com
```

**Expected Result:**
- Bot ignores normal conversation
- Only responds to token addresses/symbols
- Only responds to @mentions

**2. Private Chat Messages:**
- Test that group handlers don't interfere with private chats
- Ensure private chat functionality remains intact

## 📊 Performance Monitoring

### Key Metrics to Watch

1. **Response Time:**
   - Token recognition: < 2 seconds
   - Buy commands: < 5 seconds
   - Help commands: < 1 second

2. **Error Rates:**
   - API errors should be handled gracefully
   - User-friendly error messages
   - No bot crashes

3. **Memory Usage:**
   - Monitor for memory leaks
   - Check cache efficiency
   - Ensure proper cleanup

### Monitoring Commands

```bash
# Check bot logs
tail -f logs/bot.log

# Monitor system resources
htop

# Check database connections
psql -h localhost -U your_user -d your_db -c "SELECT count(*) FROM pg_stat_activity;"
```

## 🐛 Troubleshooting

### Common Issues

**1. Bot Not Responding in Groups:**
- Check if group handlers are properly set up
- Verify bot has necessary permissions
- Check logs for errors

**2. Token Recognition Not Working:**
- Verify MonorailAPI connection
- Check token address format
- Ensure API endpoints are accessible

**3. Buy Commands Failing:**
- Check user wallet status
- Verify sufficient balance
- Check gas price settings
- Ensure token approval

**4. API Errors:**
- Check MonorailAPI status
- Verify network connectivity
- Check rate limiting

### Debug Commands

```bash
# Test specific functionality
node quick-test.js contract
node quick-test.js symbol
node quick-test.js buy

# Check configuration
node -e "console.log(require('./test-config.json'))"

# Validate handlers
node -e "const GroupHandlers = require('./src/handlers/groupHandlers.js'); console.log('✅ GroupHandlers loaded successfully');"
```

## ✅ Success Criteria

### Group Functionality Should:

1. **✅ Recognize Token Contracts:**
   - Automatically detect 0x addresses
   - Display token information
   - Show market data

2. **✅ Recognize Token Symbols:**
   - Detect common token symbols
   - Show relevant token info
   - Handle multiple tokens in one message

3. **✅ Process Buy Commands:**
   - Handle @bot mentions correctly
   - Execute trades successfully
   - Provide clear feedback

4. **✅ Show Help Information:**
   - Display available commands
   - Provide usage examples
   - Guide users effectively

5. **✅ Maintain Security:**
   - Ignore irrelevant messages
   - Validate user permissions
   - Handle errors gracefully

6. **✅ Performance:**
   - Fast response times
   - Efficient resource usage
   - Stable operation

## 📝 Test Results Template

```
Date: ___________
Tester: ___________
Bot Version: ___________

✅ Token Contract Recognition: PASS/FAIL
✅ Token Symbol Recognition: PASS/FAIL  
✅ Buy Commands: PASS/FAIL
✅ Help Command: PASS/FAIL
✅ Security (Ignoring Normal Messages): PASS/FAIL
✅ Error Handling: PASS/FAIL
✅ Performance: PASS/FAIL

Notes:
_________________________________
_________________________________
_________________________________
```

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally
- [ ] No syntax errors
- [ ] Group functionality tested in test environment
- [ ] Performance metrics acceptable
- [ ] Error handling verified
- [ ] Security measures confirmed
- [ ] Documentation updated
- [ ] Monitoring alerts configured

---

**Need Help?** Check the logs or contact the development team for assistance.