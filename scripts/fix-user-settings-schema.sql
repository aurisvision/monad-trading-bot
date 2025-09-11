-- Fix user_settings table schema mismatch
-- Convert from key-value structure to column-based structure

-- Drop existing user_settings table and recreate with proper structure
DROP TABLE IF EXISTS user_settings CASCADE;

-- Create new user_settings table with proper columns
CREATE TABLE user_settings (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    slippage_tolerance DECIMAL(5,2) DEFAULT 5.0,
    gas_price BIGINT DEFAULT 20000000000,
    sell_gas_price BIGINT DEFAULT 20000000000,
    sell_slippage_tolerance DECIMAL(5,2) DEFAULT 5.0,
    custom_buy_amounts JSONB DEFAULT '[]'::jsonb,
    custom_sell_amounts JSONB DEFAULT '[]'::jsonb,
    turbo_mode BOOLEAN DEFAULT false,
    notifications_enabled BOOLEAN DEFAULT true,
    auto_buy_enabled BOOLEAN DEFAULT false,
    auto_buy_amount DECIMAL(18,8) DEFAULT 0.1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE,
    UNIQUE(telegram_id)
);

-- Create trigger for updated_at
CREATE TRIGGER update_user_settings_updated_at 
    BEFORE UPDATE ON user_settings
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_telegram_id ON user_settings (telegram_id);

-- Insert default settings for existing users
INSERT INTO user_settings (telegram_id, slippage_tolerance, gas_price, sell_gas_price, sell_slippage_tolerance, turbo_mode, notifications_enabled, auto_buy_enabled, auto_buy_amount)
SELECT 
    telegram_id, 
    5.0 as slippage_tolerance,
    20000000000 as gas_price,
    20000000000 as sell_gas_price,
    5.0 as sell_slippage_tolerance,
    false as turbo_mode,
    true as notifications_enabled,
    false as auto_buy_enabled,
    0.1 as auto_buy_amount
FROM users
ON CONFLICT (telegram_id) DO NOTHING;

-- Verify the fix
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_settings' 
ORDER BY ordinal_position;
