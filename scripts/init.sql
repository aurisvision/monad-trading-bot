-- PostgreSQL initialization script for Area51 Bot
-- This script sets up the database schema and initial configuration

-- Create database if it doesn't exist (handled by Docker)
-- CREATE DATABASE area51_bot;

-- Connect to the database
\c area51_bot;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    mnemonic TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_settings table
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

-- Create transactions table with JSONB for metadata
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    tx_type VARCHAR(20) NOT NULL CHECK (tx_type IN ('buy', 'sell', 'transfer', 'approval')),
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

-- Create portfolio_entries table
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

-- Create user_states table for temporary data
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

-- Create temp_sell_data table
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

-- Create performance monitoring tables
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions (telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions (tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions (tx_type, status);
CREATE INDEX IF NOT EXISTS idx_portfolio_telegram_id ON portfolio_entries (telegram_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_token ON portfolio_entries (token_address);
CREATE INDEX IF NOT EXISTS idx_user_states_telegram_id ON user_states (telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_states_expires ON user_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_temp_sell_telegram_id ON temp_sell_data (telegram_id);
CREATE INDEX IF NOT EXISTS idx_temp_sell_expires ON temp_sell_data (expires_at);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics (metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded ON performance_metrics (recorded_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at);

-- Create JSONB indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON transactions USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_portfolio_metadata ON portfolio_entries USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_user_states_data ON user_states USING GIN (state_data);
CREATE INDEX IF NOT EXISTS idx_temp_sell_quote ON temp_sell_data USING GIN (quote_data);
CREATE INDEX IF NOT EXISTS idx_performance_labels ON performance_metrics USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_error_context ON error_logs USING GIN (context);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
    -- Clean up expired user states
    DELETE FROM user_states WHERE expires_at < CURRENT_TIMESTAMP;
    
    -- Clean up expired temp sell data
    DELETE FROM temp_sell_data WHERE expires_at < CURRENT_TIMESTAMP;
    
    -- Clean up old performance metrics (keep 30 days)
    DELETE FROM performance_metrics WHERE recorded_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Clean up old error logs (keep 7 days)
    DELETE FROM error_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-expired-data', '0 2 * * *', 'SELECT cleanup_expired_data();');

-- Grant permissions to the application user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO area51_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO area51_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO area51_user;

-- Insert initial configuration data
INSERT INTO performance_metrics (metric_name, metric_value, labels) VALUES 
('database_initialized', 1, '{"version": "1.0", "timestamp": "' || CURRENT_TIMESTAMP || '"}')
ON CONFLICT DO NOTHING;
