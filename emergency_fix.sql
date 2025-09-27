-- 🚨 Emergency Fix for Production Database
-- Fixes critical issues preventing bot operation

-- 1. Create missing user_access table
CREATE TABLE IF NOT EXISTS user_access (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    access_code VARCHAR(50) NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- 2. Create indexes for user_access
CREATE INDEX IF NOT EXISTS idx_user_access_telegram_id ON user_access(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_access_code ON user_access(access_code);
CREATE INDEX IF NOT EXISTS idx_user_access_active ON user_access(is_active);

-- 3. Ensure all required columns exist in users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_mnemonic TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 4. Ensure type column exists in transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type VARCHAR(20);

-- 5. Verify the critical column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'encrypted_private_key'
    ) THEN
        RAISE EXCEPTION 'CRITICAL: encrypted_private_key column missing from users table';
    END IF;
END $$;

-- 6. Show table structure for verification
\echo 'Showing users table structure:'
\d users

\echo 'Showing user_access table structure:'
\d user_access

\echo 'Showing transactions table structure:'
\d transactions

-- 7. Test query to ensure everything works
SELECT 'Database structure verified successfully' as status;
