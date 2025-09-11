-- Fix user_states table - add missing updated_at column and function
-- This script adds the missing updated_at column, function, and trigger

-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at column to user_states table
ALTER TABLE user_states 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows to have current timestamp
UPDATE user_states 
SET updated_at = CURRENT_TIMESTAMP 
WHERE updated_at IS NULL;

-- Create trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS update_user_states_updated_at ON user_states;
CREATE TRIGGER update_user_states_updated_at 
    BEFORE UPDATE ON user_states
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Verify the fix
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_states' 
AND column_name = 'updated_at';
