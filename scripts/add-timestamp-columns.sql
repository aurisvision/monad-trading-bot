-- Add timestamp tracking columns for gas and slippage priority system
-- This allows tracking which setting was updated last: turbo mode or custom values

-- Add timestamp columns if they don't exist
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS turbo_mode_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS gas_settings_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS slippage_settings_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Update existing records to have current timestamp
UPDATE user_settings 
SET 
    turbo_mode_updated_at = CURRENT_TIMESTAMP,
    gas_settings_updated_at = CURRENT_TIMESTAMP,
    slippage_settings_updated_at = CURRENT_TIMESTAMP
WHERE turbo_mode_updated_at IS NULL 
   OR gas_settings_updated_at IS NULL 
   OR slippage_settings_updated_at IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_turbo_updated ON user_settings(turbo_mode_updated_at);
CREATE INDEX IF NOT EXISTS idx_user_settings_gas_updated ON user_settings(gas_settings_updated_at);
CREATE INDEX IF NOT EXISTS idx_user_settings_slippage_updated ON user_settings(slippage_settings_updated_at);

-- Verify the changes
SELECT 
    telegram_id,
    turbo_mode,
    gas_price,
    slippage_tolerance,
    turbo_mode_updated_at,
    gas_settings_updated_at,
    slippage_settings_updated_at
FROM user_settings 
LIMIT 5;
