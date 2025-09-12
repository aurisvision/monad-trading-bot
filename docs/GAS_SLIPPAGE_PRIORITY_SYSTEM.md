# Gas and Slippage Priority System Documentation

## Overview
The Area51 Telegram Bot implements a sophisticated priority system for gas and slippage settings that determines which configuration to use based on the most recent user action.

## Priority Logic

### Default Settings
- **Gas**: 50 Gwei for both buy and sell transactions
- **Slippage**: 5% for both buy and sell transactions

### Turbo Mode Override
- **Gas**: 100 Gwei for both buy and sell (overrides default)
- **Slippage**: Remains at user-configured values (turbo doesn't affect slippage)

### Custom Settings Override
- **Gas**: User-defined values (20-200 Gwei range)
- **Slippage**: User-defined values (0.1%-50% range)

### Priority Determination
**Last Action Wins**: The system compares timestamps to determine which setting takes precedence:
- If turbo mode was activated more recently than custom gas settings → Use 100 Gwei
- If custom gas was set more recently than turbo mode → Use custom gas value
- Slippage settings are independent and always use the most recent custom value

## Database Schema

### Timestamp Tracking Columns
```sql
-- Added to user_settings table
turbo_mode_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
gas_settings_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP  
slippage_settings_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
```

### Migration Script
Location: `scripts/add-timestamp-columns.sql`

## Implementation Components

### 1. Priority System Utility (`src/utils/gasSlippagePriority.js`)
Core class that handles:
- Effective gas price calculation based on timestamps
- Effective slippage calculation
- Auto buy settings (completely separate)
- Timestamp updates for all setting changes

### 2. Trading Engine Integration (`src/trading.js`)
- `executeBuy()` and `executeSell()` use priority system
- Automatic gas/slippage resolution before transactions
- Detailed logging of effective settings used

### 3. Monorail API Enhancement (`src/monorail.js`)
- Support for custom gas prices via `options.gasPrice`
- Priority: Custom Gas > Turbo Mode > Default (50 Gwei)
- Console logging of gas price decisions

### 4. Handler Updates
- **Navigation Handlers**: Custom input processing with timestamp tracking
- **Turbo Mode Handler**: Timestamp update on toggle
- **Settings Handlers**: Timestamp tracking for all gas/slippage changes

## Auto Buy System (Independent)

The auto buy system operates with completely separate settings:
- `auto_buy_gas` - Independent gas setting
- `auto_buy_slippage` - Independent slippage setting  
- `auto_buy_amount` - Purchase amount setting
- **No interaction** with regular buy/sell priority system
- **No turbo mode effect** on auto buy transactions

## Usage Examples

### Example 1: Default → Custom Gas → Turbo
1. User starts with defaults (50 Gwei, 5% slippage)
2. User sets custom gas to 150 Gwei → Uses 150 Gwei
3. User enables turbo mode → Uses 100 Gwei (turbo overrides custom)
4. User sets custom gas to 75 Gwei → Uses 75 Gwei (custom overrides turbo)

### Example 2: Priority Status Check
```javascript
const prioritySystem = new GasSlippagePriority(database);
const status = await prioritySystem.getPriorityStatus(userId);
// Returns: { turboMode: false, effectiveGas: 150, effectiveSlippage: 5, lastAction: 'custom_gas' }
```

## API Methods

### GasSlippagePriority Class Methods
```javascript
// Get effective settings
await getEffectiveGasPrice(userId, type) // 'buy' or 'sell'
await getEffectiveSlippage(userId, type) // 'buy' or 'sell'
await getAutoBuySettings(userId) // Separate auto buy settings

// Update settings with timestamp tracking
await updateTurboMode(userId, enabled)
await updateGasSettings(userId, gasPrice, type)
await updateSlippageSettings(userId, slippage, type)

// Debug and status
await getPriorityStatus(userId) // Full status with timestamps
```

## Transaction Flow

### Buy Transaction Process
1. `TradingEngine.executeBuy()` called
2. Priority system calculates effective gas/slippage
3. Settings passed to `MonorailAPI.buyToken()`
4. Monorail API applies custom gas price if provided
5. Transaction executed with correct settings
6. Console logs show which settings were used

### Console Output Examples
```
🎯 Using priority-based settings: Gas=150 Gwei, Slippage=5%
🎯 Using custom gas price: 150 Gwei
```

## Testing and Validation

### Database Verification
```sql
-- Check current user settings and timestamps
SELECT telegram_id, gas_price, turbo_mode, 
       turbo_mode_updated_at, gas_settings_updated_at 
FROM user_settings 
WHERE telegram_id = [USER_ID];
```

### Priority Status Check
Use the `getPriorityStatus()` method to verify which setting is currently active and why.

## Migration Guide

### From Previous System
1. Run `scripts/add-timestamp-columns.sql` to add timestamp tracking
2. Existing users will have all timestamps set to current time
3. New priority logic will take effect immediately
4. No user data or settings are lost

### Rollback Plan
The system is backward compatible. If rollback is needed:
1. Remove timestamp columns (optional)
2. Revert to simple turbo/non-turbo logic
3. All existing gas/slippage settings remain intact

## Performance Impact

- **Minimal overhead**: 2-3 additional database queries per transaction
- **Cached effectively**: User settings are cached in Redis
- **Index optimized**: Timestamp columns have database indexes
- **Memory efficient**: Priority calculations done on-demand

## Security Considerations

- **Input validation**: Gas prices limited to 20-200 Gwei range
- **Slippage limits**: 0.1%-50% range prevents extreme values
- **Timestamp integrity**: Uses database CURRENT_TIMESTAMP for accuracy
- **Cache invalidation**: Proper cache clearing after setting updates

## Future Enhancements

### Potential Additions
1. **Time-based rules**: Different gas prices for different times of day
2. **Network congestion**: Automatic gas adjustment based on network conditions
3. **User profiles**: Preset configurations (conservative, aggressive, etc.)
4. **Analytics**: Track which settings are most commonly used

### Monitoring Recommendations
1. Monitor effective gas prices used in transactions
2. Track turbo mode vs custom setting usage patterns
3. Alert on extreme gas price settings
4. Performance monitoring of priority calculations

---

**Last Updated**: 2025-09-12  
**Version**: 1.0  
**Status**: Production Ready ✅
