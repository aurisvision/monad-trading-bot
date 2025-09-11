# Area51 Telegram Bot - Backend Architecture Flow

## Backend System Architecture

```mermaid
flowchart TD
    %% Entry Point
    A[index-scalable.js - Main Bot Entry] --> B[Initialize Components]
    
    %% Component Initialization
    B --> C[Monitoring System]
    B --> D[Redis Connection]
    B --> E[PostgreSQL Database]
    B --> F[Monorail API]
    B --> G[Security & Rate Limiting]
    B --> H[Health Check Server]
    
    %% Redis Setup
    D --> D1{Redis Available?}
    D1 -->|Yes| D2[Redis Client + Caching]
    D1 -->|No| D3[Memory Fallback]
    D2 --> D4[User Cache - 24h TTL]
    D2 --> D5[Portfolio Cache - 1min TTL]
    D2 --> D6[Balance Cache - 1min TTL]
    D2 --> D7[MON Price Cache - 5min TTL]
    
    %% Database Layer
    E --> E1[PostgreSQL Connection Pool]
    E1 --> E2[User Management Tables]
    E1 --> E3[Wallet Storage]
    E1 --> E4[Transaction History]
    E1 --> E5[Settings & Preferences]
    E1 --> E6[Health Monitoring]
    
    %% API Integration Layer
    F --> F1[Monorail Testnet APIs]
    F1 --> F2[Quote API - testnet-pathfinder.monorail.xyz/v4]
    F1 --> F3[Data API - testnet-api.monorail.xyz/v1]
    F1 --> F4[Token Balance Fetching]
    F1 --> F5[Swap Execution]
    F1 --> F6[Gas Estimation]
    
    %% Security Layer
    G --> G1{Redis Available?}
    G1 -->|Yes| G2[Redis Rate Limiter]
    G1 -->|No| G3[Memory Rate Limiter]
    G2 --> G4[Session Management]
    G3 --> G5[Memory Session Management]
    G4 --> G6[Security Enhancements]
    G5 --> G6
    
    %% Health Monitoring
    H --> H1[Health Check Endpoint :3001]
    H1 --> H2[Database Health]
    H1 --> H3[Redis Health]
    H1 --> H4[API Health]
    H1 --> H5[System Metrics]

    %% Request Processing Flow
    I[Telegram Bot Request] --> J[Rate Limiting Check]
    J --> J1{Rate Limit OK?}
    J1 -->|No| J2[❌ Rate Limited]
    J1 -->|Yes| K[Security Validation]
    
    K --> L[Session Management]
    L --> M{User Authentication}
    M -->|New User| N[Create User Session]
    M -->|Existing| O[Load User Data]
    
    N --> P[Cache User Data]
    O --> P
    P --> Q[Route to Handler]
    
    %% Handler Routing
    Q --> R{Request Type}
    R -->|Wallet| S[Wallet Manager]
    R -->|Trading| T[Trading Engine]
    R -->|Portfolio| U[Portfolio Service]
    R -->|Transfer| V[Transfer Handler]
    
    %% Wallet Management Flow
    S --> S1[WalletManager Class]
    S1 --> S2{Action Type}
    S2 -->|Generate| S3[Create New Wallet]
    S2 -->|Import| S4[Import Private Key]
    S2 -->|Export| S5[Reveal Private Key]
    S2 -->|Delete| S6[Delete Wallet]
    S3 --> S7[Save to Database]
    S4 --> S7
    S5 --> S8[Security Confirmation]
    S6 --> S9[Clear All Data]
    S7 --> S10[Update Cache]
    S8 --> S10
    S9 --> S11[Invalidate Cache]
    
    %% Trading Engine Flow
    T --> T1[TradingEngine Class]
    T1 --> T2{Trade Type}
    T2 -->|Buy| T3[Execute Buy Flow]
    T2 -->|Sell| T4[Execute Sell Flow]
    
    T3 --> T5[Get Quote from Monorail]
    T4 --> T5
    T5 --> T6[Validate Balance & Amount]
    T6 --> T7{Validation OK?}
    T7 -->|No| T8[❌ Validation Error]
    T7 -->|Yes| T9[Token Approval Check]
    
    T9 --> T10{Approval Needed?}
    T10 -->|Yes| T11[Execute Approval Transaction]
    T10 -->|No| T12[Execute Swap Transaction]
    T11 --> T12
    
    T12 --> T13[Gas Price Calculation]
    T13 --> T14{Turbo Mode?}
    T14 -->|Yes| T15[100 gwei Gas Price]
    T14 -->|No| T16[50 gwei Gas Price]
    T15 --> T17[Send Transaction]
    T16 --> T17
    
    T17 --> T18[Wait for Confirmation]
    T18 --> T19{Success?}
    T19 -->|Yes| T20[✅ Update Cache & DB]
    T19 -->|No| T21[❌ Handle Error]
    
    %% Portfolio Service Flow
    U --> U1[PortfolioService Class]
    U1 --> U2{Cache Available?}
    U2 -->|Yes| U3[Load from Redis Cache]
    U2 -->|No| U4[Fetch from Monorail API]
    U3 --> U5[Return Portfolio Data]
    U4 --> U6[Process & Filter Tokens]
    U6 --> U7[Cache for 1 minute]
    U7 --> U5
    
    U5 --> U8[Calculate USD Values]
    U8 --> U9[Apply Minimum Thresholds]
    U9 --> U10[Format for Display]
    
    %% Gas Optimization System
    W[Gas Management] --> W1[getCurrentGasPrice()]
    W1 --> W2[ethers.getFeeData()]
    W2 --> W3{Turbo Mode?}
    W3 -->|Yes| W4[100 gwei + Monorail Estimate]
    W3 -->|No| W5[50 gwei + Monorail Estimate]
    W4 --> W6[~0.026 MON Cost]
    W5 --> W7[~0.013 MON Cost]
    
    %% Token Decimals Handling
    X[Token Processing] --> X1[Get Token Contract]
    X1 --> X2[Fetch Decimals Dynamically]
    X2 --> X3{Decimals Retrieved?}
    X3 -->|Yes| X4[Use Actual Decimals]
    X3 -->|No| X5[Default to 18 Decimals]
    X4 --> X6[Convert BigInt to Number]
    X5 --> X6
    X6 --> X7[Apply Precision Buffer]
    X7 --> X8[parseUnits with Correct Decimals]
    
    %% Error Handling & Recovery
    Y[Error Handler] --> Y1{Error Type}
    Y1 -->|Network| Y2[Retry with Backoff]
    Y1 -->|Validation| Y3[User-Friendly Message]
    Y1 -->|System| Y4[Log & Alert]
    Y2 --> Y5[Update Monitoring]
    Y3 --> Y5
    Y4 --> Y5
    Y5 --> Y6[Clear Affected Caches]
    Y6 --> Y7[Return Error Response]
    
    %% Cache Management System
    Z[Cache Manager] --> Z1{Cache Type}
    Z1 -->|User Data| Z2[24h TTL - Static Data]
    Z1 -->|Portfolio| Z3[1min TTL - Dynamic Data]
    Z1 -->|Balance| Z4[1min TTL - Real-time Data]
    Z1 -->|Gas Price| Z5[10min TTL - Network Data]
    Z1 -->|MON Price| Z6[5min TTL - Price Data]
    
    Z2 --> Z7[Redis Storage]
    Z3 --> Z7
    Z4 --> Z7
    Z5 --> Z7
    Z6 --> Z7
    
    Z7 --> Z8{Cache Hit?}
    Z8 -->|Yes| Z9[Return Cached Data]
    Z8 -->|No| Z10[Fetch Fresh Data]
    Z10 --> Z11[Update Cache]
    Z11 --> Z9

    %% Styling
    style A fill:#e1f5fe
    style F fill:#f3e5f5
    style T20 fill:#e8f5e8
    style T21 fill:#ffebee
    style J2 fill:#ffebee
    style T8 fill:#ffebee
```

## Backend Components Detail

### 1. **Core Architecture**
- **Entry Point**: `index-scalable.js` - Main bot orchestrator
- **Database**: PostgreSQL with connection pooling
- **Cache**: Redis with memory fallback
- **API**: Monorail integration for DEX operations
- **Monitoring**: Comprehensive logging and health checks

### 2. **Data Layer**
```
PostgreSQL Tables:
├── users (id, telegram_id, wallet_address, created_at)
├── user_settings (user_id, turbo_mode, slippage, etc.)
├── transactions (hash, user_id, type, amount, status)
└── sessions (user_id, session_data, expires_at)

Redis Cache Structure:
├── user:{userId} (24h TTL) - Static user data
├── balance:{userId} (1min TTL) - Dynamic balance data
├── portfolio:{userId} (1min TTL) - Portfolio data
├── mon_price_usd (5min TTL) - MON price data
└── gas_price (10min TTL) - Network gas data
```

### 3. **API Integration Layer**
```
Monorail APIs:
├── Quote API: testnet-pathfinder.monorail.xyz/v4
│   ├── /quote - Get swap quotes
│   └── /route - Get optimal routes
├── Data API: testnet-api.monorail.xyz/v1
│   ├── /wallet/{address}/balances - Get balances
│   ├── /tokens - Get token information
│   └── /transactions - Transaction data
└── App ID: 2837175649443187
```

### 4. **Trading Engine Architecture**
```
Trading Flow:
1. Quote Generation → Monorail API
2. Balance Validation → Token Contract
3. Approval Check → ERC20 allowance()
4. Gas Calculation → Dynamic pricing
5. Transaction Execution → Blockchain
6. Confirmation Wait → Receipt monitoring
7. Cache Update → Invalidate affected data
```

### 5. **Gas Optimization System**
```
Gas Pricing Strategy:
├── Normal Mode: 50 gwei base price
├── Turbo Mode: 100 gwei base price
├── Dynamic Fetching: ethers.getFeeData()
├── Monorail Integration: Exact gas estimates
└── Cost Prediction: ~0.013 MON (Normal), ~0.026 MON (Turbo)
```

### 6. **Security & Rate Limiting**
```
Security Layers:
├── Rate Limiting: Per-user request limits
├── Session Management: Secure session handling
├── Input Validation: Address & amount validation
├── Private Key Security: Encrypted storage
└── Error Sanitization: Safe error messages
```

### 7. **Monitoring & Health**
```
Health Check System:
├── Database Connectivity
├── Redis Availability  
├── API Response Times
├── Transaction Success Rates
└── System Resource Usage
```

### 8. **Error Handling Strategy**
```
Error Recovery:
├── Network Errors → Retry with exponential backoff
├── Cache Misses → Fallback to API/Database
├── API Failures → Graceful degradation
├── Transaction Failures → Clear cache + user notification
└── System Errors → Logging + monitoring alerts
```
