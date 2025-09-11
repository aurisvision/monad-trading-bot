# Changelog - Area51 Telegram Bot

## [v2.1.0] - 2025-09-11 - Token Trading Fixes & Precision Handling

### 🔧 Critical Bug Fixes
- **DECIMALS**: Fixed dynamic token decimals detection (WBTC=8, USDC=6, ETH=18)
- **PRECISION**: Resolved floating-point precision errors in token amount parsing
- **BIGINT**: Fixed BigInt to Number conversion for token decimals
- **PARSING**: Fixed Telegram message parsing errors with special characters
- **CACHE**: Enhanced cache invalidation after successful/failed transactions

### 🚀 Performance Improvements
- **GAS**: Updated gas price fetching for ethers v6 compatibility
- **BUFFER**: Added 99.99% buffer for 100% token sells to prevent precision issues
- **TOLERANCE**: Implemented 1 wei tolerance for balance checks
- **ESCAPING**: Added automatic escaping for special characters in token names

### 🎯 Trading Engine Enhancements
- **UNIVERSAL**: All token types now supported regardless of decimals
- **LIQUIDITY**: Fixed issues with high-liquidity tokens failing due to precision
- **MONORAIL**: Improved Monorail API integration with proper decimal handling
- **VALIDATION**: Enhanced token balance validation with proper decimal formatting

### 📊 Error Handling
- **LOGGING**: Added comprehensive debugging for token operations
- **RECOVERY**: Automatic cache refresh after failed transactions
- **FEEDBACK**: Improved error messages with sanitized content
- **MONITORING**: Enhanced transaction monitoring and status reporting

---

## [v2.0.0] - 2025-01-09 - Major Cleanup & Optimization

### 🚀 Major Changes
- **CRITICAL**: Removed legacy `index.js` file (2,527 lines) that was causing production conflicts
- **ARCHITECTURE**: Consolidated to single production-ready entry point (`index-scalable.js`)
- **PERFORMANCE**: Eliminated 25+ redundant `require('telegraf').Markup` calls
- **STABILITY**: Fixed inline buttons disappearing issue with comprehensive debugging

### ✅ Bug Fixes
- Fixed inline keyboard buttons not appearing in back navigation
- Resolved conflicting bot architectures between index.js and index-scalable.js
- Fixed cluster.js pointing to wrong entry point
- Standardized all keyboard creation patterns

### 🔧 Code Quality Improvements
- Removed duplicate code across all files
- Standardized import statements
- Cleaned unused functions and variables
- Improved error handling consistency
- Added comprehensive logging for debugging

### 📦 Infrastructure
- Updated cluster.js to reference correct entry point
- Enhanced .gitignore for better version control
- Maintained Redis caching and monitoring features
- Preserved all production-ready scalability features

### 🎯 Production Ready
- Single source of truth architecture
- Zero file conflicts
- Optimized performance
- Consistent error handling
- Full clustering support maintained

---

## [v1.x.x] - Previous Versions
- Initial bot development
- Redis caching implementation
- PostgreSQL integration
- Monitoring system
- Trading engine development
