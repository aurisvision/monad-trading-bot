-- Fix Access Code Tables for Production Deployment
-- This script creates missing tables and columns

-- Create access_codes table if not exists
CREATE TABLE IF NOT EXISTS access_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    code_type VARCHAR(20) NOT NULL DEFAULT 'general',
    max_uses INTEGER NULL,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NULL,
    description TEXT,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    CONSTRAINT chk_used_count_positive CHECK (used_count >= 0),
    CONSTRAINT chk_max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0),
    CONSTRAINT chk_expires_future CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Create user_access table if not exists
CREATE TABLE IF NOT EXISTS user_access (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    used_code VARCHAR(20) NOT NULL,
    access_granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    user_info JSONB,
    revoked_at TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    CONSTRAINT fk_user_access_code FOREIGN KEY (used_code) REFERENCES access_codes(code)
);

-- Add missing columns to existing tables if they don't exist

-- Check if transactions table has 'type' column, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'type') THEN
        ALTER TABLE transactions ADD COLUMN type VARCHAR(20) DEFAULT 'trade';
    END IF;
END $$;

-- Check if user_access table has 'used_at' column, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_access' AND column_name = 'used_at') THEN
        ALTER TABLE user_access ADD COLUMN used_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_active ON access_codes(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_type ON access_codes(code_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_expires ON access_codes(expires_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_created_by ON access_codes(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_created_at ON access_codes(created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_telegram_id ON user_access(telegram_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_code ON user_access(used_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_active ON user_access(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_granted_at ON user_access(access_granted_at);

-- Add transactions type index if missing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Insert default access codes for testing
INSERT INTO access_codes (code, code_type, max_uses, description, created_by) 
VALUES 
    ('AREA51-ADMIN', 'admin', NULL, 'Admin access code', 6920475855),
    ('AREA51-TEST', 'general', 100, 'Test access code', 6920475855)
ON CONFLICT (code) DO NOTHING;

-- Grant admin access if not exists
INSERT INTO user_access (telegram_id, used_code, user_info) 
VALUES (6920475855, 'AREA51-ADMIN', '{"role": "admin"}')
ON CONFLICT (telegram_id) DO NOTHING;
