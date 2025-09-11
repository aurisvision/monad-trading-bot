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
    custom_buy_amounts JSONB DEFAULT '[]'::jsonb,
    custom_sell_amounts JSONB DEFAULT '[]'::jsonb,
    turbo_mode BOOLEAN DEFAULT false,
    notifications_enabled BOOLEAN DEFAULT true,
    degen_mode BOOLEAN DEFAULT false,
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
INSERT INTO user_settings (telegram_id, slippage_tolerance, gas_price, turbo_mode, notifications_enabled, degen_mode)
SELECT 
    telegram_id, 
    5.0 as slippage_tolerance,
    20000000000 as gas_price,
    false as turbo_mode,
    true as notifications_enabled,
    false as degen_mode
FROM users
ON CONFLICT (telegram_id) DO NOTHING;

-- Verify the fix
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_settings' 
ORDER BY ordinal_position;
