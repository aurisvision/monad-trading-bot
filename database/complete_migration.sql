-- Complete Migration Script for Area51 Bot Production
-- This script ensures all tables and columns exist with proper structure
-- Compatible with PostgreSQL 17 and handles all edge cases

-- Start transaction
BEGIN;

-- Create extensions if not exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =====================================================
-- USERS TABLE - Complete Structure
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    wallet_address VARCHAR(42) NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    encrypted_mnemonic TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Add missing columns to users table if they don't exist
DO $$ 
BEGIN
    -- Add username column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'username') THEN
        ALTER TABLE users ADD COLUMN username VARCHAR(255);
    END IF;
    
    -- Add encrypted_mnemonic column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'encrypted_mnemonic') THEN
        ALTER TABLE users ADD COLUMN encrypted_mnemonic TEXT;
    END IF;
    
    -- Add last_activity column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_activity') THEN
        ALTER TABLE users ADD COLUMN last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add is_active column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
    -- Ensure encrypted_private_key exists and is NOT NULL
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'encrypted_private_key') THEN
        ALTER TABLE users ADD COLUMN encrypted_private_key TEXT NOT NULL DEFAULT 'pending_key_creation';
    END IF;
END $$;

-- =====================================================
-- USER_SETTINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    setting_key VARCHAR(50) NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE,
    UNIQUE(telegram_id, setting_key)
);

-- =====================================================
-- TRANSACTIONS TABLE - Complete Structure
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    tx_type VARCHAR(20) NOT NULL CHECK (tx_type IN ('buy', 'sell', 'transfer', 'approval')),
    type VARCHAR(20), -- Add this column for compatibility
    token_address VARCHAR(42),
    token_symbol VARCHAR(20),
    amount DECIMAL(36, 18),
    price_usd DECIMAL(18, 8),
    gas_used INTEGER,
    gas_price BIGINT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE
);

-- Add missing type column to transactions if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'type') THEN
        ALTER TABLE transactions ADD COLUMN type VARCHAR(20);
    END IF;
END $$;

-- =====================================================
-- ACCESS CODE SYSTEM TABLES
-- =====================================================
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

CREATE TABLE IF NOT EXISTS user_access (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    used_code VARCHAR(20) NOT NULL,
    access_granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    used_at TIMESTAMP, -- Add this column for compatibility
    user_info JSONB,
    revoked_at TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    CONSTRAINT fk_user_access_code FOREIGN KEY (used_code) REFERENCES access_codes(code)
);

-- Add missing used_at column to user_access if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_access' AND column_name = 'used_at') THEN
        ALTER TABLE user_access ADD COLUMN used_at TIMESTAMP;
    END IF;
END $$;

-- =====================================================
-- OTHER REQUIRED TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS portfolio_entries (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20),
    balance DECIMAL(36, 18) NOT NULL DEFAULT 0,
    average_buy_price DECIMAL(18, 8),
    total_invested DECIMAL(18, 8) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE,
    UNIQUE(telegram_id, token_address)
);

CREATE TABLE IF NOT EXISTS user_states (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    state_key VARCHAR(50) NOT NULL,
    state_data JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE,
    UNIQUE(telegram_id, state_key)
);

CREATE TABLE IF NOT EXISTS temp_sell_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20),
    amount DECIMAL(36, 18) NOT NULL,
    quote_data JSONB,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE
);

-- =====================================================
-- MONITORING TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(18, 8) NOT NULL,
    labels JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_type VARCHAR(100),
    error_message TEXT,
    stack_trace TEXT,
    context JSONB,
    telegram_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CREATE ALL INDEXES
-- =====================================================
-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users (wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users (last_activity);
CREATE INDEX IF NOT EXISTS idx_users_registration ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_telegram_active ON users (telegram_id) WHERE is_active = true;

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions (telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions (tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions (tx_type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON transactions USING GIN (metadata);

-- Portfolio indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_telegram_id ON portfolio_entries (telegram_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_token ON portfolio_entries (token_address);
CREATE INDEX IF NOT EXISTS idx_portfolio_metadata ON portfolio_entries USING GIN (metadata);

-- Access code indexes
CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_access_codes_type ON access_codes(code_type);
CREATE INDEX IF NOT EXISTS idx_access_codes_expires ON access_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_codes_created_by ON access_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_access_codes_created_at ON access_codes(created_at);

CREATE INDEX IF NOT EXISTS idx_user_access_telegram_id ON user_access(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_access_code ON user_access(used_code);
CREATE INDEX IF NOT EXISTS idx_user_access_active ON user_access(is_active);
CREATE INDEX IF NOT EXISTS idx_user_access_granted_at ON user_access(access_granted_at);

-- Other indexes
CREATE INDEX IF NOT EXISTS idx_user_states_telegram_id ON user_states (telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_states_expires ON user_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_user_states_data ON user_states USING GIN (state_data);

CREATE INDEX IF NOT EXISTS idx_temp_sell_telegram_id ON temp_sell_data (telegram_id);
CREATE INDEX IF NOT EXISTS idx_temp_sell_expires ON temp_sell_data (expires_at);
CREATE INDEX IF NOT EXISTS idx_temp_sell_quote ON temp_sell_data USING GIN (quote_data);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics (metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded ON performance_metrics (recorded_at);
CREATE INDEX IF NOT EXISTS idx_performance_labels ON performance_metrics USING GIN (labels);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_error_context ON error_logs USING GIN (context);

-- =====================================================
-- CREATE FUNCTIONS AND TRIGGERS
-- =====================================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update used_count when a user gains access
CREATE OR REPLACE FUNCTION update_code_usage()
RETURNS TRIGGER AS $$
BEGIN
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

-- Function to clean up expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
    DELETE FROM user_states WHERE expires_at < CURRENT_TIMESTAMP;
    DELETE FROM temp_sell_data WHERE expires_at < CURRENT_TIMESTAMP;
    DELETE FROM performance_metrics WHERE recorded_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    DELETE FROM error_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CREATE VIEWS
-- =====================================================
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

-- =====================================================
-- VERIFY SCHEMA INTEGRITY
-- =====================================================
-- Insert verification record
INSERT INTO performance_metrics (metric_name, metric_value, labels) VALUES 
('complete_migration_executed', 1, '{"version": "2.0", "timestamp": "' || CURRENT_TIMESTAMP || '", "postgresql_version": "17"}')
ON CONFLICT DO NOTHING;

-- Commit transaction
COMMIT;

-- Display completion message
SELECT 'Complete migration executed successfully!' as status,
       'All tables, columns, indexes, and functions are now up to date' as message,
       CURRENT_TIMESTAMP as completed_at;
