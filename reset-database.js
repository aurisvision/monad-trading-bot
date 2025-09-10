#!/usr/bin/env node

// Database reset script for Area51 Bot
// This will completely reset and recreate the database with correct schema

require('dotenv').config({ path: '.env.production' });
const { Pool } = require('pg');

class DatabaseReset {
    constructor() {
        this.pool = new Pool({
            user: process.env.POSTGRES_USER || 'postgres',
            host: process.env.POSTGRES_HOST || 'localhost',
            database: process.env.POSTGRES_DB_NAME || 'area51_bot',
            password: String(process.env.POSTGRES_PASSWORD || ''),
            port: parseInt(process.env.POSTGRES_PORT) || 5432,
        });
    }

    async reset() {
        console.log('🔄 Starting database reset...');
        
        try {
            // Drop all existing tables
            await this.dropAllTables();
            
            // Create fresh tables with correct schema
            await this.createTables();
            
            // Create indexes
            await this.createIndexes();
            
            console.log('✅ Database reset completed successfully!');
        } catch (error) {
            console.error('❌ Database reset failed:', error);
            throw error;
        } finally {
            await this.pool.end();
        }
    }

    async dropAllTables() {
        console.log('🗑️ Dropping existing tables...');
        
        const dropQueries = [
            'DROP TABLE IF EXISTS temp_sell_data CASCADE',
            'DROP TABLE IF EXISTS user_states CASCADE',
            'DROP TABLE IF EXISTS portfolio_entries CASCADE',
            'DROP TABLE IF EXISTS transactions CASCADE',
            'DROP TABLE IF EXISTS user_settings CASCADE',
            'DROP TABLE IF EXISTS users CASCADE',
            'DROP TABLE IF EXISTS system_metrics CASCADE',
            'DROP TABLE IF EXISTS rate_limits CASCADE'
        ];

        for (const query of dropQueries) {
            try {
                await this.pool.query(query);
                console.log(`✅ ${query.split(' ')[4]} dropped`);
            } catch (error) {
                console.log(`⚠️ ${query.split(' ')[4]} not found (OK)`);
            }
        }
    }

    async createTables() {
        console.log('📋 Creating fresh tables...');
        
        const queries = [
            // Users table
            `CREATE TABLE users (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                wallet_address VARCHAR(42) NOT NULL,
                encrypted_private_key TEXT NOT NULL,
                encrypted_mnemonic TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT true
            )`,
            
            // User settings
            `CREATE TABLE user_settings (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                buy_slippage DECIMAL(5,2) DEFAULT 5.0,
                sell_slippage DECIMAL(5,2) DEFAULT 5.0,
                auto_buy_enabled BOOLEAN DEFAULT false,
                auto_sell_enabled BOOLEAN DEFAULT false,
                auto_sell_profit_target DECIMAL(10,2) DEFAULT 100.0,
                custom_buy_amounts TEXT DEFAULT '0.1,0.5,1,5',
                custom_sell_percentages TEXT DEFAULT '25,50,75,100',
                gas_priority VARCHAR(20) DEFAULT 'normal',
                preferences JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Transactions
            `CREATE TABLE transactions (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                tx_hash VARCHAR(66) NOT NULL,
                type VARCHAR(20) NOT NULL,
                token_address VARCHAR(42) NOT NULL,
                token_symbol VARCHAR(20),
                amount DECIMAL(36,18) NOT NULL,
                price_per_token DECIMAL(36,18),
                total_value DECIMAL(36,18) NOT NULL,
                gas_used BIGINT,
                gas_price BIGINT,
                status VARCHAR(20) DEFAULT 'pending',
                block_number BIGINT,
                network VARCHAR(20) DEFAULT 'monad',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                confirmed_at TIMESTAMPTZ
            )`,
            
            // Portfolio entries - FIXED SCHEMA
            `CREATE TABLE portfolio_entries (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                token_address VARCHAR(42) NOT NULL,
                token_symbol VARCHAR(20),
                total_bought DECIMAL(36,18) DEFAULT 0,
                total_sold DECIMAL(36,18) DEFAULT 0,
                average_buy_price DECIMAL(36,18) DEFAULT 0,
                current_balance DECIMAL(36,18) DEFAULT 0,
                realized_pnl DECIMAL(36,18) DEFAULT 0,
                unrealized_pnl DECIMAL(36,18) DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(telegram_id, token_address)
            )`,
            
            // User states
            `CREATE TABLE user_states (
                telegram_id BIGINT UNIQUE NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                state VARCHAR(50),
                data JSONB,
                expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (telegram_id)
            )`,
            
            // Temporary sell data
            `CREATE TABLE temp_sell_data (
                id VARCHAR(100) PRIMARY KEY,
                telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                token_address VARCHAR(42) NOT NULL,
                token_symbol VARCHAR(20),
                amount DECIMAL(36,18) NOT NULL,
                quote_data JSONB,
                expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

            // System metrics
            `CREATE TABLE system_metrics (
                id BIGSERIAL PRIMARY KEY,
                metric_name VARCHAR(50) NOT NULL,
                metric_value DECIMAL(20,8) NOT NULL,
                metadata JSONB DEFAULT '{}',
                recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

            // Rate limiting
            `CREATE TABLE rate_limits (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                action VARCHAR(50) NOT NULL,
                count INTEGER DEFAULT 1,
                window_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(telegram_id, action, window_start)
            )`
        ];

        for (const query of queries) {
            await this.pool.query(query);
        }
        
        console.log('✅ All tables created successfully');
    }

    async createIndexes() {
        console.log('📊 Creating indexes...');
        
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)',
            'CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address)',
            'CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions(telegram_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_portfolio_telegram_id ON portfolio_entries(telegram_id)',
            'CREATE INDEX IF NOT EXISTS idx_portfolio_token_address ON portfolio_entries(token_address)',
            'CREATE INDEX IF NOT EXISTS idx_portfolio_current_balance ON portfolio_entries(current_balance)',
            'CREATE INDEX IF NOT EXISTS idx_user_states_expires_at ON user_states(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_temp_sell_expires_at ON temp_sell_data(expires_at)'
        ];

        for (const index of indexes) {
            try {
                await this.pool.query(index);
            } catch (error) {
                console.warn(`⚠️ Index creation warning: ${error.message.split('\n')[0]}`);
            }
        }
        
        console.log('✅ Indexes created successfully');
    }
}

// Run the reset
if (require.main === module) {
    const reset = new DatabaseReset();
    reset.reset().catch(error => {
        console.error('💥 Reset failed:', error);
        process.exit(1);
    });
}

module.exports = DatabaseReset;
