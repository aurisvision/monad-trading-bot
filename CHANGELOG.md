# Changelog

All notable changes to the Area51 Telegram Bot project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-09-12

### Added
- **Gas and Slippage Priority System**: Intelligent priority system that determines which gas/slippage settings to use based on the most recent user action
- **Timestamp Tracking**: Database columns to track when turbo mode, gas settings, and slippage settings were last updated
- **Custom Input Handlers**: Support for user-defined gas prices (20-200 Gwei) and slippage values (0.1%-50%)
- **Priority System Utility**: New `GasSlippagePriority` class for managing setting precedence
- **Auto Buy Engine**: Separate auto buy system with independent gas, slippage, and amount settings
- **Enhanced Monorail API**: Support for custom gas prices in transaction execution
- **Comprehensive Documentation**: Detailed documentation of the priority system implementation

### Changed
- **Transaction Execution**: `executeBuy()` and `executeSell()` now use priority-based gas and slippage calculation
- **Turbo Mode Logic**: Turbo mode now properly integrates with custom settings using timestamp comparison
- **Database Schema**: Added `turbo_mode_updated_at`, `gas_settings_updated_at`, and `slippage_settings_updated_at` columns
- **Settings Handlers**: All gas and slippage updates now include timestamp tracking
- **Monorail API Gas Logic**: Enhanced to support custom gas prices with proper fallback hierarchy

### Fixed
- **Database Method Calls**: Fixed incorrect `getUserByTelegramId()` calls to use proper `getUser()` method
- **TradingEngine Initialization**: Corrected parameter order in TradingEngine constructor
- **Custom Input Processing**: Fixed missing text message handlers for custom gas, slippage, and auto buy amount inputs
- **Gas Price Application**: Fixed issue where custom gas prices weren't being applied to actual transactions

### Technical Details
- **Priority Logic**: Last action wins - compares timestamps between turbo mode and custom settings
- **Default Settings**: 50 Gwei gas, 5% slippage for new users
- **Turbo Override**: 100 Gwei gas when turbo mode is the most recent action
- **Custom Override**: User-defined values when custom settings are more recent than turbo mode
- **Auto Buy Independence**: Auto buy system completely separate from regular buy/sell settings
- **Database Migration**: `scripts/add-timestamp-columns.sql` for existing installations

### Performance
- **Minimal Overhead**: 2-3 additional database queries per transaction
- **Redis Caching**: User settings cached effectively with proper invalidation
- **Database Indexes**: Optimized timestamp columns with appropriate indexes
- **Memory Efficient**: Priority calculations performed on-demand

### Security
- **Input Validation**: Gas prices limited to safe 20-200 Gwei range
- **Slippage Limits**: 0.1%-50% range prevents extreme values
- **Timestamp Integrity**: Uses database CURRENT_TIMESTAMP for accuracy
- **Cache Security**: Proper cache invalidation after setting updates

---

## [v2.2.0] - 2025-09-11 - Modular Architecture & Critical Bug Fixes

### 🏗️ Modular Architecture Refactoring (Main Feature)
- **MODULAR DESIGN**: Split monolithic `index-scalable.js` (3,140 lines) into clean modules (422 lines main file)
- **HANDLER SEPARATION**: Created dedicated handlers for navigation, trading, wallet, and portfolio operations
- **CONSTANTS UNIFICATION**: Centralized all configuration variables in `constants.js`
- **UTILS OPTIMIZATION**: Reorganized utility functions with proper exports and error handling
- **87% CODE REDUCTION**: Dramatically improved maintainability and performance

### 🔧 Critical Bug Fixes
- **TURBO MODE**: Fixed non-responsive toggle button with proper event handler registration
- **DATABASE SCHEMA**: Added missing `turbo_mode` column to user_settings table
- **PARSEAMOUNTS**: Resolved "parseCustomAmounts is not a function" error
- **HANDLER CONFLICTS**: Fixed handler registration order to prevent callback conflicts
- **CACHE INVALIDATION**: Proper cache clearing after turbo mode changes

### 📁 File Structure Improvements
- **NEW**: `src/handlers/` directory with modular handlers
- **NEW**: `src/constants.js` for unified configuration
- **NEW**: `src/utils/index.js` with proper module exports
- **REMOVED**: Duplicate files (`portfolio.js`, `security.js`, `utils.js`)
- **OPTIMIZED**: Clean separation of concerns across all modules

### ⚡ Gas System Optimization (Previous v2.1.0)
- **TURBO MODE**: Optimized 100 gwei gas pricing for fast transactions (~1-2 min)
- **NORMAL MODE**: Efficient 50 gwei gas pricing for cost-effective transactions (~3-5 min)
- **DYNAMIC GAS**: Fixed ethers v6 compatibility with `getFeeData()` instead of `getGasPrice()`
- **MONORAIL INTEGRATION**: Using Monorail's exact gas estimates (~264,520) instead of hardcoded limits
- **PREDICTABLE COSTS**: Normal ~0.013 MON, Turbo ~0.026 MON per transaction

### 🔧 Amount Tolerance Fixes (Previous v2.1.0)
- **PRECISION BUFFER**: Added 99.99% buffer for 100% token sells to prevent floating-point errors
- **WEI TOLERANCE**: Implemented 1 wei tolerance for balance checks
- **DECIMALS HANDLING**: Dynamic token decimals detection (WBTC=8, USDC=6, ETH=18)
- **BIGINT CONVERSION**: Fixed BigInt to Number conversion for token decimals
- **PARSEUNITS FIX**: Resolved floating-point precision errors in amount parsing

### 🎯 Trading Engine Improvements
- **UNIVERSAL SUPPORT**: All token types now work regardless of decimals or liquidity
- **CACHE OPTIMIZATION**: Enhanced cache invalidation after successful/failed transactions
- **ERROR HANDLING**: Improved Telegram message parsing with special character escaping
- **MONORAIL API**: Better integration with proper decimal and gas handling

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
