-- Fix custom_buy_amounts column type
-- Change from JSON/JSONB back to TEXT

-- First check current type
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_settings' 
AND column_name IN ('custom_buy_amounts', 'custom_sell_percentages');

-- Change custom_buy_amounts from JSON/JSONB to TEXT if needed
ALTER TABLE user_settings 
ALTER COLUMN custom_buy_amounts TYPE TEXT;

-- Change custom_sell_percentages from JSON/JSONB to TEXT if needed  
ALTER TABLE user_settings 
ALTER COLUMN custom_sell_percentages TYPE TEXT;

-- Set default values for any NULL entries
UPDATE user_settings 
SET custom_buy_amounts = '0.1,0.5,1,5' 
WHERE custom_buy_amounts IS NULL;

UPDATE user_settings 
SET custom_sell_percentages = '25,50,75,100' 
WHERE custom_sell_percentages IS NULL;

-- Verify the fix
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'user_settings' 
AND column_name IN ('custom_buy_amounts', 'custom_sell_percentages');
