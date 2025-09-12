-- Clean Database Schema Migration
-- Removes unnecessary variables and keeps only actively used ones

-- Remove unnecessary columns from user_settings table
ALTER TABLE user_settings DROP COLUMN IF EXISTS buy_slippage;
ALTER TABLE user_settings DROP COLUMN IF EXISTS sell_slippage;
ALTER TABLE user_settings DROP COLUMN IF EXISTS auto_sell_enabled;
ALTER TABLE user_settings DROP COLUMN IF EXISTS auto_sell_profit_target;
ALTER TABLE user_settings DROP COLUMN IF EXISTS gas_priority;
ALTER TABLE user_settings DROP COLUMN IF EXISTS preferences;

-- Add sell_gas_price if it doesn't exist (for separate sell gas settings)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS sell_gas_price BIGINT DEFAULT 50000000000;

-- Add sell_slippage_tolerance if it doesn't exist (for separate sell slippage settings)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS sell_slippage_tolerance DECIMAL(5,2) DEFAULT 5.0;

-- Update any existing NULL values to defaults
UPDATE user_settings SET 
    gas_price = 50000000000 WHERE gas_price IS NULL,
    slippage_tolerance = 5.0 WHERE slippage_tolerance IS NULL,
    sell_gas_price = 50000000000 WHERE sell_gas_price IS NULL,
    sell_slippage_tolerance = 5.0 WHERE sell_slippage_tolerance IS NULL,
    auto_buy_enabled = false WHERE auto_buy_enabled IS NULL,
    auto_buy_amount = 0.1 WHERE auto_buy_amount IS NULL,
    auto_buy_gas = 50000000000 WHERE auto_buy_gas IS NULL,
    auto_buy_slippage = 5.0 WHERE auto_buy_slippage IS NULL,
    turbo_mode = false WHERE turbo_mode IS NULL;

-- Verify final schema
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_settings' 
ORDER BY ordinal_position;
