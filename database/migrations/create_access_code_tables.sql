-- Migration: Create Access Code System Tables
-- Description: Creates tables for managing access codes and user access
-- Date: 2025-09-23

-- Table for storing access codes
CREATE TABLE IF NOT EXISTS access_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    code_type VARCHAR(20) NOT NULL DEFAULT 'general',
    max_uses INTEGER NULL, -- NULL means unlimited
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NULL, -- NULL means never expires
    description TEXT,
    created_by BIGINT NOT NULL, -- Admin who created the code
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Indexes for performance
    CONSTRAINT chk_used_count_positive CHECK (used_count >= 0),
    CONSTRAINT chk_max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0),
    CONSTRAINT chk_expires_future CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Table for tracking user access
CREATE TABLE IF NOT EXISTS user_access (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    used_code VARCHAR(20) NOT NULL,
    access_granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    user_info JSONB, -- Store user information like username, first_name, etc.
    revoked_at TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Foreign key to access_codes
    CONSTRAINT fk_user_access_code FOREIGN KEY (used_code) REFERENCES access_codes(code)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_access_codes_type ON access_codes(code_type);
CREATE INDEX IF NOT EXISTS idx_access_codes_expires ON access_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_codes_created_by ON access_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_access_codes_created_at ON access_codes(created_at);

CREATE INDEX IF NOT EXISTS idx_user_access_telegram_id ON user_access(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_access_code ON user_access(used_code);
CREATE INDEX IF NOT EXISTS idx_user_access_active ON user_access(is_active);
CREATE INDEX IF NOT EXISTS idx_user_access_granted_at ON user_access(access_granted_at);

-- Add some sample data for testing (optional)
-- INSERT INTO access_codes (code, code_type, description, created_by) 
-- VALUES ('AREA51-TEST01', 'general', 'Test code for development', 6920475855);

-- Add comments for documentation
COMMENT ON TABLE access_codes IS 'Stores access codes for bot entry control';
COMMENT ON TABLE user_access IS 'Tracks which users have gained access and with which codes';

COMMENT ON COLUMN access_codes.code IS 'Unique access code (format: AREA51-XXXXXXXX)';
COMMENT ON COLUMN access_codes.code_type IS 'Type of code: general, vip, limited, timed, etc.';
COMMENT ON COLUMN access_codes.max_uses IS 'Maximum number of times this code can be used (NULL = unlimited)';
COMMENT ON COLUMN access_codes.used_count IS 'Current number of times this code has been used';
COMMENT ON COLUMN access_codes.expires_at IS 'When this code expires (NULL = never expires)';

COMMENT ON COLUMN user_access.telegram_id IS 'Telegram user ID who gained access';
COMMENT ON COLUMN user_access.used_code IS 'The access code that was used to gain access';
COMMENT ON COLUMN user_access.user_info IS 'JSON object containing user information (username, first_name, etc.)';

-- Create a function to automatically update used_count when a user gains access
CREATE OR REPLACE FUNCTION update_code_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Only increment if this is a new active access (not an update)
    IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
        UPDATE access_codes 
        SET used_count = used_count + 1 
        WHERE code = NEW.used_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update code usage
DROP TRIGGER IF EXISTS trigger_update_code_usage ON user_access;
CREATE TRIGGER trigger_update_code_usage
    AFTER INSERT ON user_access
    FOR EACH ROW
    EXECUTE FUNCTION update_code_usage();

-- Create a view for easy access code statistics
CREATE OR REPLACE VIEW access_code_stats AS
SELECT 
    ac.code,
    ac.code_type,
    ac.max_uses,
    ac.used_count,
    ac.expires_at,
    ac.is_active,
    ac.created_at,
    CASE 
        WHEN ac.expires_at IS NOT NULL AND ac.expires_at < NOW() THEN 'expired'
        WHEN ac.max_uses IS NOT NULL AND ac.used_count >= ac.max_uses THEN 'exhausted'
        WHEN ac.is_active = false THEN 'disabled'
        ELSE 'active'
    END as status,
    CASE 
        WHEN ac.max_uses IS NULL THEN 'unlimited'
        ELSE CONCAT(ac.used_count, '/', ac.max_uses)
    END as usage_display
FROM access_codes ac
ORDER BY ac.created_at DESC;

-- Create a view for user access summary
CREATE OR REPLACE VIEW user_access_summary AS
SELECT 
    ua.telegram_id,
    ua.used_code,
    ua.access_granted_at,
    ua.is_active,
    ua.user_info->>'username' as username,
    ua.user_info->>'first_name' as first_name,
    ua.user_info->>'last_name' as last_name,
    ac.code_type
FROM user_access ua
JOIN access_codes ac ON ua.used_code = ac.code
WHERE ua.is_active = true
ORDER BY ua.access_granted_at DESC;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON access_codes TO your_bot_user;
-- GRANT SELECT, INSERT, UPDATE ON user_access TO your_bot_user;
-- GRANT USAGE ON SEQUENCE access_codes_id_seq TO your_bot_user;
-- GRANT USAGE ON SEQUENCE user_access_id_seq TO your_bot_user;
