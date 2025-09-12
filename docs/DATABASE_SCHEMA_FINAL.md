# Area51 Bot - Final Optimized Database Schema

## Overview
This document outlines the final optimized database schema after removing unnecessary variables and ensuring all button handlers are properly mapped to database fields.

## User Settings Table Schema

```sql
CREATE TABLE IF NOT EXISTS user_settings (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    
    -- Buy Settings
    gas_price BIGINT DEFAULT 50000000000,              -- Gas price for buy transactions (wei)
    slippage_tolerance DECIMAL(5,2) DEFAULT 5.0,       -- Slippage tolerance for buy (%)
    
    -- Sell Settings  
    sell_gas_price BIGINT DEFAULT 50000000000,          -- Gas price for sell transactions (wei)
    sell_slippage_tolerance DECIMAL(5,2) DEFAULT 5.0,   -- Slippage tolerance for sell (%)
    
    -- Auto Buy Settings
    auto_buy_enabled BOOLEAN DEFAULT false,             -- Auto buy toggle
    auto_buy_amount DECIMAL(10,4) DEFAULT 0.1,         -- Auto buy amount (MON)
    auto_buy_gas BIGINT DEFAULT 50000000000,           -- Auto buy gas price (wei)
    auto_buy_slippage DECIMAL(5,2) DEFAULT 5.0,       -- Auto buy slippage (%)
    
    -- UI Configuration
    custom_buy_amounts TEXT DEFAULT '0.1,0.5,1,5',     -- Custom buy amount buttons
    custom_sell_percentages TEXT DEFAULT '25,50,75,100', -- Custom sell percentage buttons
    
    -- Advanced Features
    turbo_mode BOOLEAN DEFAULT false,                   -- Turbo mode toggle
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

## Removed Variables (Cleanup)

The following variables were identified as unnecessary and removed:

- `buy_slippage` - Duplicate of `slippage_tolerance`
- `sell_slippage` - Duplicate of `sell_slippage_tolerance`  
- `auto_sell_enabled` - Feature not implemented
- `auto_sell_profit_target` - Feature not implemented
- `gas_priority` - Replaced with direct gas price values
- `preferences` - Unused JSONB field

## Button-Database Field Mappings

### Buy Settings Buttons
| Button Action | Database Field | Value | Description |
|---------------|----------------|-------|-------------|
| `gas_normal_buy` | `gas_price` | 50000000000 | Normal gas (50 Gwei) |
| `gas_turbo_buy` | `gas_price` | 100000000000 | Turbo gas (100 Gwei) |
| `slippage_1_buy` | `slippage_tolerance` | 1.0 | Low slippage (1%) |
| `slippage_5_buy` | `slippage_tolerance` | 5.0 | Normal slippage (5%) |
| `slippage_10_buy` | `slippage_tolerance` | 10.0 | High slippage (10%) |

### Sell Settings Buttons
| Button Action | Database Field | Value | Description |
|---------------|----------------|-------|-------------|
| `gas_normal_sell` | `sell_gas_price` | 50000000000 | Sell normal gas (50 Gwei) |
| `gas_turbo_sell` | `sell_gas_price` | 100000000000 | Sell turbo gas (100 Gwei) |
| `slippage_1_sell` | `sell_slippage_tolerance` | 1.0 | Sell low slippage (1%) |
| `slippage_5_sell` | `sell_slippage_tolerance` | 5.0 | Sell normal slippage (5%) |
| `slippage_10_sell` | `sell_slippage_tolerance` | 10.0 | Sell high slippage (10%) |

### Auto Buy Settings Buttons
| Button Action | Database Field | Value | Description |
|---------------|----------------|-------|-------------|
| `auto_buy_toggle` | `auto_buy_enabled` | true/false | Enable/disable auto buy |
| `auto_buy_amount_0.1` | `auto_buy_amount` | 0.1 | Auto buy 0.1 MON |
| `auto_buy_amount_0.5` | `auto_buy_amount` | 0.5 | Auto buy 0.5 MON |
| `auto_buy_amount_1` | `auto_buy_amount` | 1.0 | Auto buy 1.0 MON |
| `auto_buy_amount_5` | `auto_buy_amount` | 5.0 | Auto buy 5.0 MON |
| `auto_buy_gas_50` | `auto_buy_gas` | 50000000000 | Auto buy normal gas |
| `auto_buy_gas_100` | `auto_buy_gas` | 100000000000 | Auto buy turbo gas |
| `auto_buy_slippage_1` | `auto_buy_slippage` | 1.0 | Auto buy low slippage |
| `auto_buy_slippage_5` | `auto_buy_slippage` | 5.0 | Auto buy normal slippage |
| `auto_buy_slippage_10` | `auto_buy_slippage` | 10.0 | Auto buy high slippage |

### Advanced Features
| Button Action | Database Field | Value | Description |
|---------------|----------------|-------|-------------|
| `turbo_mode_toggle` | `turbo_mode` | true/false | Enable/disable turbo mode |

## Handler Implementation Status

### ✅ Implemented and Working
- Auto buy gas buttons (50 Gwei, 100 Gwei)
- Auto buy amount, slippage settings
- Auto buy enable/disable with confirmation
- Turbo mode toggle with confirmation
- Cache invalidation after all updates

### ✅ Validated Functionality
- All buttons update database correctly
- Settings display current values from database
- Cache clearing ensures UI consistency
- Error handling and user feedback
- Navigation flow works properly

## Database Update Methods

### Primary Update Method
```javascript
async updateUserSettings(telegramId, settingsUpdate) {
    // Updates any combination of settings fields
    // Automatically invalidates cache
    // Returns updated settings record
}
```

### Usage Examples
```javascript
// Update buy gas price
await database.updateUserSettings(userId, { gas_price: 100000000000 });

// Update auto buy settings
await database.updateUserSettings(userId, { 
    auto_buy_enabled: true,
    auto_buy_amount: 1.0,
    auto_buy_gas: 50000000000 
});

// Toggle turbo mode
await database.updateUserSettings(userId, { turbo_mode: true });
```

## Cache Management

### Cache Keys Used
- `settings:${userId}` - User settings data
- `user:${userId}` - General user data
- `main_menu:${userId}` - Main menu cached data

### Cache Invalidation
All setting updates automatically:
1. Clear relevant cache keys
2. Update database record
3. Set fresh cache with new data
4. Provide user feedback

## Security Considerations

### Input Validation
- Gas prices: Must be positive integers in wei
- Slippage: Must be between 0.1% and 50%
- Amounts: Must be positive decimals
- Booleans: Strict true/false validation

### Rate Limiting
- Settings updates limited to prevent spam
- Confirmation required for critical changes
- Auto buy requires explicit user consent

## Performance Optimizations

### Database Indexes
```sql
CREATE INDEX idx_user_settings_telegram_id ON user_settings(telegram_id);
CREATE INDEX idx_user_settings_auto_buy ON user_settings(auto_buy_enabled) WHERE auto_buy_enabled = true;
```

### Query Optimization
- Single query updates multiple fields
- Prepared statements for security
- Connection pooling for scalability

## Migration Notes

### From Previous Schema
1. Removed duplicate slippage fields
2. Removed unused auto sell features  
3. Added separate sell gas/slippage fields
4. Consolidated preferences into specific fields

### Production Deployment
1. Run migration script to remove unused columns
2. Update existing records with default values
3. Verify all button handlers work correctly
4. Test cache invalidation functionality

## Conclusion

The optimized schema provides:
- ✅ Clean, minimal field set
- ✅ All buttons properly mapped
- ✅ Separate buy/sell configurations
- ✅ Comprehensive auto buy settings
- ✅ Proper cache management
- ✅ Production-ready validation

All unnecessary variables have been removed and all button functionality has been validated to work correctly with the database.
