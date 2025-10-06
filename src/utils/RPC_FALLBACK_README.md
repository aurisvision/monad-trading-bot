# RPC Fallback System for Rate Limiting Management

## Overview

The RPC Fallback system was developed to handle rate limiting issues that the bot faces in production, especially with QuickNode which limits 25 requests/second for `eth_getTransactionByHash`.

## Problems It Solves

1. **Rate Limiting**: When the bot reaches request limits (25/second)
2. **Connection Drops**: When the primary RPC endpoint fails
3. **System Stability**: Ensuring continuous operation despite network issues

## Available RPC Endpoints

1. **Primary**: `https://rpc.ankr.com/monad_testnet` (High performance, reliable)
2. **Fallback 1**: `https://monad-testnet.drpc.org` (Good latency)
3. **Fallback 2**: `https://rpc-testnet.monad.xyz` (Official endpoint)
4. **Fallback 3**: `https://testnet.monad.network` (Backup)
5. **Environment**: `process.env.MONAD_RPC_URL` (Custom endpoint)

## How The System Works

### 1. Automatic Fallback Mechanism
```javascript
const rpcManager = new RPCManager();

// Execute operation with automatic fallback
const result = await rpcManager.executeWithFallback(
    async (provider) => {
        return await provider.getBalance(address);
    },
    'GET_BALANCE'
);
```

### 2. Smart Error Detection
The system automatically detects:
- **Rate Limit Errors**: "rate limit", "too many requests", "429"
- **Network Errors**: "ENOTFOUND", "ECONNREFUSED", "timeout"
- **RPC Errors**: "server error", "internal error"

### 3. RPC Status Management
- Track status of each RPC endpoint (healthy/disabled)
- Automatic switching when RPC fails
- Re-enable RPC after cooldown period (30 seconds)

## Applied Updates

### 1. WalletManager (`wallet.js`)
```javascript
// Before update
const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);

// After update
const balance = await this.rpcManager.executeWithFallback(
    async (provider) => {
        return await provider.getBalance(walletAddress);
    },
    'GET_BALANCE'
);
```

### 2. MonorailAPI (`monorail.js`)
```javascript
// Before update
const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
const feeData = await provider.getFeeData();

// After update
const feeData = await this.rpcManager.executeWithFallback(
    async (provider) => {
        return await provider.getFeeData();
    },
    'GET_FEE_DATA'
);
```

## Updated Functions

### In WalletManager:
- ✅ `getWalletWithProvider()` - Using RPC fallback
- ✅ `getBalance()` - Using RPC fallback
- ✅ `getTransactionReceipt()` - Using RPC fallback
- ✅ `waitForTransaction()` - Using RPC fallback

### In MonorailAPI:
- ✅ `getCurrentGasPrice()` - Using RPC fallback

## System Testing

### Running Tests
```bash
node src/utils/testRPCFallback.js
```

### Latest Test Results
```
📊 Test Results:
==================================================
✅ basic_connection: Connected to network: monad-testnet (Chain ID: 10143)
✅ fallback_mechanism: Retrieved block number: 41601533
✅ rate_limit_handling: Succeeded 5/5 operations
✅ multiple_operations: Succeeded 3/3 operations
==================================================
📈 Final Result: 4/4 tests passed
🎉 All tests passed! RPC Fallback system is working correctly.
```

## Monitoring and Logs

The system logs all important events:

```javascript
// Successful connection
{"level":"INFO","message":"RPC connection successful","meta":{"rpcUrl":"***","responseTime":234}}

// Failed connection
{"level":"WARN","message":"RPC connection failed","meta":{"rpcUrl":"***","error":"rate limit exceeded"}}

// RPC switching
{"level":"INFO","message":"Switching RPC endpoint","meta":{"from":"***","to":"***"}}

// RPC re-enabled
{"level":"INFO","message":"RPC re-enabled after rate limit cooldown","meta":{"rpcUrl":"***"}}
```

## Benefits

1. **Higher Stability**: Bot continues working even with RPC issues
2. **Better Performance**: Fast switching between RPC endpoints
3. **Enhanced Monitoring**: Detailed logs for all operations
4. **Complete Transparency**: No changes to external API

## Environment Requirements

```bash
# Primary RPC (required)
MONAD_RPC_URL=https://rpc.ankr.com/monad_testnet

# Chain ID (required)
CHAIN_ID=10143
```

## Maintenance

### System Health Check
```javascript
const tester = new RPCFallbackTester();
await tester.quickHealthCheck();
```

### Reset RPC Status
```javascript
rpcManager.resetRpcStatus();
```

## Summary

The RPC Fallback system solves rate limiting issues and ensures bot stability in production. The system is completely transparent and requires no changes to external code.