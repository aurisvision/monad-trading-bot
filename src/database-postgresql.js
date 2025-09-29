// PostgreSQL Database Implementation for Area51 Bot
// Designed for 10,000+ concurrent users with connection pooling and caching

const { Pool } = require('pg');
const Redis = require('redis');

class DatabasePostgreSQL {
    constructor(monitoring = null, redisClient = null) {
        this.monitoring = monitoring;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // 5 seconds
        this.healthCheckInterval = null;
        this.isConnected = false;
        
        // PostgreSQL connection pool configuration - Optimized for 100 concurrent users
        this.pool = new Pool({
            user: process.env.POSTGRES_USER || 'area51_user',
            host: process.env.POSTGRES_HOST || 'localhost',
            database: process.env.POSTGRES_DB || process.env.POSTGRES_DB_NAME || 'postgres',
            password: String(process.env.POSTGRES_PASSWORD || ''),
            port: parseInt(process.env.POSTGRES_PORT) || 5432,
            max: 25, // Increased from 20 to support 100 concurrent users
            min: 5,  // Minimum connections to keep alive
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 3000, // Reduced from 5000 for faster timeouts
            acquireTimeoutMillis: 2000,    // Added acquire timeout
            query_timeout: 5000,
            statement_timeout: 5000,
            ssl: this.getSSLConfig()
        });

        // Use shared Redis client or null
        this.redis = redisClient;
        this.cacheEnabled = process.env.CACHE_ENABLED === 'true' && this.redis !== null;
        
        // Event-driven caching for static data (User & Settings)
        // TTL only for dynamic data (Portfolio & Transactions)
        this.cacheTTL = {
            portfolio: 180, // 3 minutes - portfolio updates frequently
            transactions: 60, // 1 minute - transaction lists change often
            default: 300    // 5 minutes fallback for other data
        };
        
        // Cache keys for static data (no TTL) - Match CacheService key structure
        this.staticCacheKeys = {
            user: 'area51:user:',
            settings: 'area51:user_settings:'
        };
    }

    // 🔒 SSL Configuration for secure database connections
    getSSLConfig() {
        const sslMode = process.env.POSTGRES_SSL_MODE || 'prefer';
        
        // Development mode or disabled SSL - allow non-SSL connections
        if (sslMode === 'disable' || process.env.NODE_ENV === 'development') {
            console.warn('⚠️  WARNING: SSL disabled for database connection');
            return false;
        }
        
        
        // Handle different SSL modes
        switch (sslMode) {
            case 'disable':
                console.warn('⚠️  WARNING: SSL disabled for database connection');
                return false;
            
            case 'require':
                console.log('✅ SSL enabled for database connection');
                return { 
                    rejectUnauthorized: false,
                    checkServerIdentity: () => undefined,
                    sslmode: 'require'
                };
            
            case 'prefer':
            default:
                // Try SSL first, fallback to non-SSL if server doesn't support it
                console.log('ℹ️  SSL preferred for database connection (with fallback)');
                return { 
                    rejectUnauthorized: false,
                    sslmode: 'prefer' 
                };
        }
    }

    async initialize() {
        try {
            // Test PostgreSQL connection with timeout

            const connectionPromise = this.pool.connect();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('PostgreSQL connection timeout')), 8000);
            });
            
            const client = await Promise.race([connectionPromise, timeoutPromise]);
            
            if (this.monitoring) {
                this.monitoring.logInfo('PostgreSQL connected successfully');
            } else {

            }
            client.release();

            // Redis is managed externally, just log status
            if (this.cacheEnabled && this.redis) {
                if (this.monitoring) {
                    this.monitoring.logInfo('Redis cache available for database operations');
                } else {

                }
            }


            await this.createTables();
            await this.createIndexes();
            await this.createIndexes();

        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async createTables() {
        const queries = [
            // Users table with optimizations
            `CREATE TABLE IF NOT EXISTS users (
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
            
            // User settings with JSON for flexibility
            `CREATE TABLE IF NOT EXISTS user_settings (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                gas_price BIGINT DEFAULT 50000000000,
                slippage_tolerance DECIMAL(5,2) DEFAULT 5.0,
                sell_gas_price BIGINT DEFAULT 50000000000,
                sell_slippage_tolerance DECIMAL(5,2) DEFAULT 5.0,
                auto_buy_enabled BOOLEAN DEFAULT false,
                auto_buy_amount DECIMAL(10,4) DEFAULT 0.1,
                auto_buy_gas BIGINT DEFAULT 50000000000,
                auto_buy_slippage DECIMAL(5,2) DEFAULT 5.0,
                custom_buy_amounts TEXT DEFAULT '0.1,0.5,1,5',
                custom_sell_percentages TEXT DEFAULT '25,50,75,100',
                turbo_mode BOOLEAN DEFAULT false,
                turbo_mode_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                gas_settings_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                slippage_settings_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Transactions with partitioning support
            `CREATE TABLE IF NOT EXISTS transactions (
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
            
            // Portfolio entries with better data types
            `CREATE TABLE IF NOT EXISTS portfolio_entries (
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
            
            // User states with TTL
            `CREATE TABLE IF NOT EXISTS user_states (
                telegram_id BIGINT UNIQUE NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                state VARCHAR(50),
                data JSONB,
                expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (telegram_id)
            )`,
            
            // Temporary sell data with automatic cleanup
            `CREATE TABLE IF NOT EXISTS temp_sell_data (
                id VARCHAR(100) PRIMARY KEY,
                telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
                token_address VARCHAR(42) NOT NULL,
                token_symbol VARCHAR(20),
                amount DECIMAL(36,18) NOT NULL,
                quote_data JSONB,
                expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

            // System metrics for monitoring
            `CREATE TABLE IF NOT EXISTS system_metrics (
                id BIGSERIAL PRIMARY KEY,
                metric_name VARCHAR(50) NOT NULL,
                metric_value DECIMAL(20,8) NOT NULL,
                metadata JSONB DEFAULT '{}',
                recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

            // Rate limiting table
            `CREATE TABLE IF NOT EXISTS rate_limits (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                action VARCHAR(50) NOT NULL,
                count INTEGER DEFAULT 1,
                window_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(telegram_id, action, window_start)
            )`,

            // Access codes table for bot entry control
            `CREATE TABLE IF NOT EXISTS access_codes (
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
            )`,

            // User access tracking table
            `CREATE TABLE IF NOT EXISTS user_access (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                used_code VARCHAR(20) NOT NULL,
                access_granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
                user_info JSONB,
                revoked_at TIMESTAMP NULL,
                is_active BOOLEAN NOT NULL DEFAULT true,
                
                CONSTRAINT fk_user_access_code FOREIGN KEY (used_code) REFERENCES access_codes(code)
            )`
        ];

        for (const query of queries) {
            await this.query(query);
        }
    }

    async createIndexes() {
        // Check if tables exist before creating indexes
        try {
            const tableCheck = await this.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'transactions', 'portfolio_entries', 'user_states', 'temp_sell_data', 'user_settings')
            `);
            
            if (tableCheck.rows.length === 0) {

                return;
            }

        } catch (error) {
            console.warn('⚠️ Could not check table existence, attempting index creation anyway');
        }

        const indexes = [
            // Critical indexes for 100 concurrent users - High Priority
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_telegram_active ON users(telegram_id) WHERE is_active = true',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_recent ON transactions(telegram_id, created_at DESC)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_user_balance ON portfolio_entries(telegram_id) WHERE current_balance > 0',
            
            // Existing performance indexes - Medium Priority
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wallet_address ON users(wallet_address)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_activity ON users(last_activity)',
            
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_telegram_id ON transactions(telegram_id)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON transactions(status)',
            
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_telegram_id ON portfolio_entries(telegram_id)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_token_address ON portfolio_entries(token_address)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_updated_at ON portfolio_entries(updated_at DESC)',
            
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_states_expires_at ON user_states(expires_at)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temp_sell_expires_at ON temp_sell_data(expires_at)',
            
            // Composite indexes for complex queries
            // Note: idx_transactions_user_type disabled until 'type' column is confirmed in all environments
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_user_token ON portfolio_entries(telegram_id, token_address)',
            
            // JSONB indexes for fast JSON queries
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temp_sell_quote_data ON temp_sell_data USING GIN(quote_data)',
            
            // Access Code System indexes for performance
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_active ON access_codes(is_active)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_type ON access_codes(code_type)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_expires ON access_codes(expires_at)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_created_by ON access_codes(created_by)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_codes_created_at ON access_codes(created_at)',
            
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_telegram_id ON user_access(telegram_id)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_code ON user_access(used_code)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_active ON user_access(is_active)',
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_access_granted_at ON user_access(access_granted_at)'
        ];

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const index of indexes) {
            try {
                await this.query(index);
                successCount++;
            } catch (error) {
                // Handle different types of errors gracefully
                if (error.message.includes('already exists') || 
                    error.message.includes('relation') && error.message.includes('already exists')) {
                    skipCount++;
                } else if (error.message.includes('permission denied') || 
                          error.message.includes('must be owner')) {
                    console.warn(`⚠️ Permission issue creating index: ${error.message.split('\n')[0]}`);
                    errorCount++;
                } else if (error.message.includes('does not exist')) {
                    console.warn(`⚠️ Table does not exist for index: ${error.message.split('\n')[0]}`);
                    errorCount++;
                } else {
                    console.warn(`⚠️ Index creation warning: ${error.message.split('\n')[0]}`);
                    errorCount++;
                }
            }
        }

        // Don't throw error if some indexes failed - database can still function
        if (successCount > 0 || skipCount > 0) {
            console.log('✅ Database indexes ready (some may have been skipped due to permissions)');
        }
    }

    // Core query methods with connection pooling
    async query(text, params = []) {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            // Log slow queries
            if (duration > 1000) {
                console.warn(`Slow query (${duration}ms):`, text.substring(0, 100));
            }
            
            return result;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    async getOne(text, params = []) {
        const result = await this.query(text, params);
        return result.rows[0] || null;
    }

    async getMany(text, params = []) {
        const result = await this.query(text, params);
        return result.rows;
    }

    // Cache helper methods
    async getFromCache(key) {
        if (!this.cacheEnabled) return null;
        try {
            const cached = await this.redis.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('Cache get error:', error);
            return null;
        }
    }

    // Set cache with TTL for dynamic data only
    async setCache(key, value, ttl = null) {
        if (!this.cacheEnabled) return;
        
        // TTL only for dynamic data (portfolio, transactions)
        if (!ttl) {
            if (key.includes('portfolio:')) ttl = this.cacheTTL.portfolio;
            else if (key.includes('transactions:')) ttl = this.cacheTTL.transactions;
            else ttl = this.cacheTTL.default;
        }
        
        try {
            if (typeof this.redis.setEx === 'function') {
                await this.redis.setEx(key, ttl, JSON.stringify(value));
            } else if (typeof this.redis.set === 'function') {
                await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
            } else if (typeof this.redis.setex === 'function') {
                await this.redis.setex(key, ttl, JSON.stringify(value));
            } else {
                console.warn('No compatible Redis SET method available for cache');
            }
        } catch (error) {
            console.warn('Cache set error:', error);
        }
    }

    // Set static cache without TTL (for user data & settings)
    async setStaticCache(key, value) {
        if (!this.cacheEnabled) return;
        
        try {
            if (typeof this.redis.set === 'function') {
                await this.redis.set(key, JSON.stringify(value));
            } else {
                console.warn('No compatible Redis SET method available for static cache');
            }
        } catch (error) {
            console.warn('Static cache set error:', error);
        }
    }

    // Invalidate static cache (manual cache invalidation)
    async invalidateStaticCache(telegramId, type) {
        if (!this.cacheEnabled) return;
        
        try {
            const key = `${this.staticCacheKeys[type]}${telegramId}`;
            await this.redis.del(key);

        } catch (error) {
            console.warn(`Static cache invalidation error for ${type}:`, error);
        }
    }

    async deleteCache(key) {
        if (!this.cacheEnabled) return;
        try {
            await this.redis.del(key);
        } catch (error) {
            console.warn('Cache delete error:', error);
        }
    }

    // User management with caching - Create user without wallet first
    async createUser(telegramId, username = null) {
        // Generate default username if not provided
        const defaultUsername = username || `user_${telegramId}`;
        
        // Check if user already exists
        const existingUser = await this.getUser(telegramId);
        if (existingUser) {
            return existingUser;
        }
        
        // Create user with placeholder wallet data to satisfy NOT NULL constraints
        const query = `
            INSERT INTO users (telegram_id, username, wallet_address, encrypted_private_key, encrypted_mnemonic, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            RETURNING *`;
        
        const result = await this.getOne(query, [
            telegramId, 
            defaultUsername, 
            'pending_wallet_creation', // Placeholder for wallet_address
            'pending_key_creation',    // Placeholder for encrypted_private_key
            null                       // mnemonic can be null
        ]);
        
        // Create default settings
        await this.createUserSettings(telegramId);
        
        // Cache the user (static cache - no TTL)
        const userCacheKey = `${this.staticCacheKeys.user}${telegramId}`;
        await this.setStaticCache(userCacheKey, result);
        
        return result;
    }

    async getUser(telegramId) {
        // Try cache first (static cache)
        const cacheKey = `${this.staticCacheKeys.user}${telegramId}`;
        let user = await this.getFromCache(cacheKey);
        
        if (!user) {
            const query = 'SELECT * FROM users WHERE telegram_id = $1';
            user = await this.getOne(query, [telegramId]);
            
            if (user) {
                // Cache without TTL (static cache)
                await this.setStaticCache(cacheKey, user);
            }
        }
        
        return user;
    }

    async updateUserWallet(telegramId, walletAddress, encryptedPrivateKey, encryptedMnemonic) {
        const query = `
            UPDATE users 
            SET wallet_address = $1, encrypted_private_key = $2, encrypted_mnemonic = $3, 
                updated_at = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP
            WHERE telegram_id = $4
            RETURNING *`;
        
        const result = await this.getOne(query, [walletAddress, encryptedPrivateKey, encryptedMnemonic, telegramId]);
        
        // Event-driven cache update (invalidate then set new data)
        if (result) {
            await this.invalidateStaticCache(telegramId, 'user');
            const userCacheKey = `${this.staticCacheKeys.user}${telegramId}`;
            await this.setStaticCache(userCacheKey, result);
        }
        
        return result;
    }

    // User settings with JSON support
    async createUserSettings(telegramId) {
        const query = `
            INSERT INTO user_settings (
                telegram_id, 
                gas_price, 
                sell_gas_price,
                auto_buy_gas, 
                slippage_tolerance,
                sell_slippage_tolerance,
                auto_buy_slippage,
                auto_buy_enabled,
                auto_buy_amount,
                turbo_mode
            ) 
            VALUES ($1, 50000000000, 50000000000, 50000000000, 5.0, 5.0, 5.0, false, 0.1, false) 
            ON CONFLICT (telegram_id) DO NOTHING
            RETURNING *`;
        return await this.getOne(query, [telegramId]);
    }

    async getUserSettings(telegramId) {
        // Try Redis cache first if available
        if (this.cacheService) {
            try {
                const cachedSettings = await this.cacheService.get('user_settings', telegramId);
                if (cachedSettings) {
                    return cachedSettings;
                }
            } catch (cacheError) {
                console.error('Cache read error for user settings:', cacheError);
            }
        }
        
        // Fallback to legacy cache
        const cacheKey = `${this.staticCacheKeys.settings}${telegramId}`;
        let settings = await this.getFromCache(cacheKey);
        
        if (!settings) {
            const query = 'SELECT * FROM user_settings WHERE telegram_id = $1';
            settings = await this.getOne(query, [telegramId]);
            
            if (!settings) {
                settings = await this.createUserSettings(telegramId);
            }
            
            if (settings) {
                // Cache in both systems
                if (this.cacheService) {
                    try {
                        await this.cacheService.set('user_settings', telegramId, settings);
                    } catch (cacheError) {
                        console.error('Cache set error for user settings:', cacheError);
                    }
                }
                await this.setStaticCache(cacheKey, settings);
            }
        }
        
        return settings;
    }

    async updateUserSettings(telegramId, settings) {
        const updateFields = [];
        const values = [];
        let paramIndex = 1;

        // Build dynamic query based on provided settings
        for (const [key, value] of Object.entries(settings)) {
            updateFields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }

        if (updateFields.length === 0) {
            return null;
        }

        values.push(telegramId);
        const query = `
            UPDATE user_settings 
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = $${paramIndex}
            RETURNING *`;

        const result = await this.getOne(query, values);
        
        // Instant cache update - set new data immediately
        if (result && this.cacheService) {
            await this.cacheService.set('user_settings', telegramId, result);
            if (this.monitoring) {
                this.monitoring.logInfo('User settings cache updated instantly', { 
                    telegramId, 
                    updatedFields: Object.keys(settings)
                });
            }
        } else {
            // Fallback: Invalidate settings cache
            await this.invalidateStaticCache(telegramId, 'settings');
        }
        
        return result;
    }

    // Transaction management with batch operations
    async addTransaction(telegramId, txData) {
        const query = `
            INSERT INTO transactions 
            (telegram_id, tx_hash, type, token_address, token_symbol, amount, 
             price_per_token, total_value, gas_used, gas_price, status, block_number, network) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`;
        
        const params = [
            telegramId, txData.txHash, txData.type, txData.tokenAddress,
            txData.tokenSymbol, txData.amount, txData.pricePerToken,
            txData.totalValue, txData.gasUsed, txData.gasPrice, 
            txData.status, txData.blockNumber, txData.network || 'monad'
        ];
        
        return await this.getOne(query, params);
    }

    async updateTransactionStatus(txHash, status, blockNumber = null, confirmedAt = null) {
        const query = `
            UPDATE transactions 
            SET status = $1, block_number = $2, confirmed_at = $3
            WHERE tx_hash = $4
            RETURNING *`;
        
        return await this.getOne(query, [status, blockNumber, confirmedAt, txHash]);
    }

    async getUserTransactions(telegramId, limit = 50, offset = 0) {
        const cacheKey = `transactions:${telegramId}:${limit}:${offset}`;
        let transactions = await this.getFromCache(cacheKey);
        
        if (!transactions) {
            const query = `
                SELECT * FROM transactions 
                WHERE telegram_id = $1 
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3`;
            
            transactions = await this.getMany(query, [telegramId, limit, offset]);
            await this.setCache(cacheKey, transactions, 60); // 1 minute cache
        }
        
        return transactions;
    }

    // Portfolio management with atomic updates
    async updatePortfolioEntry(telegramId, tokenAddress, tokenSymbol, buyAmount, buyPrice) {
        const query = `
            INSERT INTO portfolio_entries 
            (telegram_id, token_address, token_symbol, total_bought, average_buy_price, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (telegram_id, token_address)
            DO UPDATE SET
                total_bought = portfolio_entries.total_bought + EXCLUDED.total_bought,
                average_buy_price = (
                    (portfolio_entries.total_bought * portfolio_entries.average_buy_price + 
                     EXCLUDED.total_bought * EXCLUDED.average_buy_price) /
                    (portfolio_entries.total_bought + EXCLUDED.total_bought)
                ),
                token_symbol = EXCLUDED.token_symbol,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *`;
        
        const result = await this.getOne(query, [telegramId, tokenAddress, tokenSymbol, buyAmount, buyPrice]);
        
        // Invalidate portfolio cache
        await this.deleteCache(`portfolio:${telegramId}`);
        
        return result;
    }

    async getPortfolioEntries(telegramId) {
        const cacheKey = `portfolio:${telegramId}`;
        let portfolio = await this.getFromCache(cacheKey);
        
        if (!portfolio) {
            const query = `
                SELECT * FROM portfolio_entries 
                WHERE telegram_id = $1 
                ORDER BY updated_at DESC`;
            
            portfolio = await this.getMany(query, [telegramId]);
            await this.setCache(cacheKey, portfolio, 120); // 2 minutes cache
        }
        
        return portfolio;
    }

    // User states with TTL
    async setUserState(telegramId, state, data = null) {
        // First try to update existing record
        const updateQuery = `
            UPDATE user_states 
            SET state = $2, state_data = $3, expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour', created_at = CURRENT_TIMESTAMP
            WHERE telegram_id = $1
            RETURNING *`;
        
        const serializedData = data ? JSON.stringify(data) : null;
        let result = await this.getOne(updateQuery, [telegramId, state, serializedData]);
        
        // If no record exists, insert new one
        if (!result) {
            const insertQuery = `
                INSERT INTO user_states (telegram_id, state, state_data, expires_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 hour')
                RETURNING *`;
            result = await this.getOne(insertQuery, [telegramId, state, serializedData]);
        }
        
        return result;
    }

    async getUserState(telegramId) {
        const query = `
            SELECT * FROM user_states 
            WHERE telegram_id = $1 AND expires_at > CURRENT_TIMESTAMP`;
        
        const result = await this.getOne(query, [telegramId]);
        
        if (result && result.state_data) {
            try {
                // Check if state_data is already an object or needs parsing
                if (typeof result.state_data === 'string') {
                    // Clean the string before parsing
                    const cleanData = result.state_data.trim();
                    if (cleanData.startsWith('{') || cleanData.startsWith('[')) {
                        try {
                            result.data = JSON.parse(cleanData);
                        } catch (error) {
                            console.error('Error parsing user state data:', error);
                            // Keep data as string if JSON parsing fails
                            result.data = cleanData;
                        }
                    } else {
                        result.data = cleanData;
                    }
                } else {
                    result.data = result.state_data;
                }
            } catch (error) {
                console.error('Error parsing user state data:', error);
                // Keep data as string if JSON parsing fails
                result.data = typeof result.state_data === 'string' ? result.state_data : null;
            }
        }
        return result;
    }

    async clearUserState(telegramId) {
        const query = `DELETE FROM user_states WHERE telegram_id = $1`;
        return await this.query(query, [telegramId]);
    }

    /**
     * Clear all user states (for bot restart cleanup)
     */
    async clearAllUserStates() {
        const query = `DELETE FROM user_states WHERE expires_at < CURRENT_TIMESTAMP + INTERVAL '1 hour'`;
        try {
            const result = await this.query(query);
            return result.rowCount || 0;
        } catch (error) {
            console.error('Error clearing all user states:', error);
            return 0;
        }
    }

    // Temporary sell data with automatic cleanup
    async storeTempSellData(id, telegramId, tokenAddress, tokenSymbol, amount, quoteData) {
        const query = `
            INSERT INTO temp_sell_data 
            (id, telegram_id, token_address, token_symbol, amount, quote_data, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
            RETURNING *`;
        
        return await this.getOne(query, [id, telegramId, tokenAddress, tokenSymbol, amount, JSON.stringify(quoteData)]);
    }

    async getTempSellData(id) {
        const query = `
            SELECT * FROM temp_sell_data 
            WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP`;
        
        const result = await this.getOne(query, [id]);
        
        if (result && result.quote_data) {
            try {
                result.quote_data = JSON.parse(result.quote_data);
            } catch (error) {
                console.error('Error parsing quote data:', error);
                result.quote_data = null;
            }
        }
        
        return result;
    }

    async deleteTempSellData(id) {
        const query = 'DELETE FROM temp_sell_data WHERE id = $1';
        return await this.query(query, [id]);
    }

    // Cleanup expired data (run periodically)
    async cleanupExpiredData() {
        const queries = [
            'DELETE FROM user_states WHERE expires_at < CURRENT_TIMESTAMP',
            'DELETE FROM temp_sell_data WHERE expires_at < CURRENT_TIMESTAMP',
            'DELETE FROM rate_limits WHERE window_start < CURRENT_TIMESTAMP - INTERVAL \'1 hour\''
        ];
        
        for (const query of queries) {
            try {
                const result = await this.query(query);
                if (result.rowCount > 0) {

                }
            } catch (error) {
                console.error('Cleanup error:', error);
            }
        }
    }

    // Health check and monitoring
    async healthCheck() {
        try {
            const dbResult = await this.query('SELECT 1 as healthy');
            const redisHealthy = this.cacheEnabled ? await this.redis.ping() === 'PONG' : true;
            
            return {
                database: dbResult.rows[0]?.healthy === 1,
                cache: redisHealthy,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                database: false,
                cache: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Database health monitoring and reconnection
    async startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.checkDatabaseHealth();
            } catch (error) {
                if (this.monitoring) {
                    this.monitoring.logError('Health check failed', error);
                }
                await this.handleConnectionFailure();
            }
        }, 30000); // Check every 30 seconds
        
        if (this.monitoring) {
            this.monitoring.logInfo('Database health monitoring started');
        }
    }

    async checkDatabaseHealth() {
        try {
            const result = await this.pool.query('SELECT 1 as health_check');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            return result.rows[0]?.health_check === 1;
        } catch (error) {
            this.isConnected = false;
            throw error;
        }
    }

    async handleConnectionFailure() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            if (this.monitoring) {
                this.monitoring.logError('Max reconnection attempts reached', null, {
                    attempts: this.reconnectAttempts
                });
            }
            return;
        }

        this.reconnectAttempts++;
        
        if (this.monitoring) {
            this.monitoring.logWarn('Database connection failed, attempting reconnection', {
                attempt: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts
            });
        }

        setTimeout(async () => {
            try {
                // Create new pool
                await this.pool.end();
                this.pool = new Pool({
                    user: process.env.POSTGRES_USER || 'area51_user',
                    host: process.env.POSTGRES_HOST || 'localhost',
                    database: process.env.POSTGRES_DB || process.env.POSTGRES_DB_NAME || 'postgres',
                    password: String(process.env.POSTGRES_PASSWORD || ''),
                    port: parseInt(process.env.POSTGRES_PORT) || 5432,
                    max: 20,
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 5000,
                });

                await this.checkDatabaseHealth();
                
                if (this.monitoring) {
                    this.monitoring.logInfo('Database reconnection successful', {
                        attempt: this.reconnectAttempts
                    });
                }
            } catch (error) {
                if (this.monitoring) {
                    this.monitoring.logError('Database reconnection failed', error, {
                        attempt: this.reconnectAttempts
                    });
                }
                await this.handleConnectionFailure();
            }
        }, this.reconnectDelay * this.reconnectAttempts); // Exponential backoff
    }

    async stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            
            if (this.monitoring) {
                this.monitoring.logInfo('Database health monitoring stopped');
            }
        }
    }

    // Enhanced query method with retry logic
    async queryWithRetry(text, params = [], maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (!this.isConnected) {
                    await this.checkDatabaseHealth();
                }
                
                return await this.pool.query(text, params);
            } catch (error) {
                lastError = error;
                
                if (this.monitoring) {
                    this.monitoring.logWarn('Query failed, retrying', {
                        attempt,
                        maxRetries,
                        error: error.message
                    });
                }
                
                if (attempt < maxRetries) {
                    await this.handleConnectionFailure();
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        
        throw lastError;
    }

    // Execute single query and return one result
    async getOne(query, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(query, params);
            return result.rows[0] || null;
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Database getOne error', error, { query, params });
            }
            throw error;
        } finally {
            client.release();
        }
    }

    // Execute query and return all results
    async getAll(query, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(query, params);
            return result.rows || [];
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Database getAll error', error, { query, params });
            }
            throw error;
        } finally {
            client.release();
        }
    }

    // Add missing methods for metrics
    async getUserCount() {
        try {
            const result = await this.getAll('SELECT COUNT(*) as count FROM users');
            return parseInt(result[0].count) || 0;
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Get user count failed', error);
            }
            return 0;
        }
    }

    async getActiveUserCount() {
        try {
            const result = await this.getAll(`
                SELECT COUNT(*) as count FROM users 
                WHERE last_activity > NOW() - INTERVAL '24 hours'
            `);
            return parseInt(result[0].count) || 0;
        } catch (error) {
            if (this.monitoring) {
                this.monitoring.logError('Get active user count failed', error);
            }
            return 0;
        }
    }

    async getConnectionStats() {
        try {
            if (this.pool) {
                return {
                    total: this.pool.totalCount || 0,
                    active: this.pool.idleCount || 0,
                    waiting: this.pool.waitingCount || 0
                };
            }
            return { total: 0, active: 0, waiting: 0 };
        } catch (error) {
            return { total: 0, active: 0, waiting: 0 };
        }
    }

    async getUserByTelegramId(telegramId) {
        return await this.getUser(telegramId);
    }

    async getUserByWalletAddress(walletAddress) {
        const query = 'SELECT * FROM users WHERE wallet_address = $1';
        return await this.getOne(query, [walletAddress]);
    }

    async deleteUser(telegramId) {
        // Get user data first to find wallet address
        const userData = await this.getUserByTelegramId(telegramId);
        
        const query = 'DELETE FROM users WHERE telegram_id = $1';
        const result = await this.query(query, [telegramId]);
        
        // Clear all user-related cache entries
        if (this.cacheService) {
            try {
                // Clear user-specific cache entries
                await this.cacheService.delete('user', telegramId);
                await this.cacheService.delete('user_settings', telegramId);
                await this.cacheService.delete('user_state', telegramId);
                await this.cacheService.delete('session', telegramId);
                await this.cacheService.delete('main_menu', telegramId);
                
                // Clear wallet-related cache if we have wallet address
                if (userData?.wallet_address) {
                    const walletAddress = userData.wallet_address;
                    // wallet_balance removed - using mon_balance only
                    await this.cacheService.delete('portfolio', walletAddress);
                    await this.cacheService.delete('mon_balance', walletAddress);
                }
                
                console.log('✅ User cache cleared successfully', { telegramId });
            } catch (cacheError) {
                console.warn('⚠️ Cache clearing failed (non-critical)', { error: cacheError.message });
            }
        } else {
            // Fallback to legacy cache invalidation
            await this.invalidateStaticCache(telegramId, 'user');
            await this.invalidateStaticCache(telegramId, 'settings');
            
            // Clear additional cache keys manually
            if (userData && userData.wallet_address) {
                // wallet_balance removed - using mon_balance only
            }
            await this.deleteCache(`area51:portfolio:${telegramId}`);
            await this.deleteCache(`area51:main_menu:${telegramId}`);
            await this.deleteCache(`area51:user_state:${telegramId}`);
        }
        
        return result;
    }

    // Get user transaction count for trust level calculation
    async getUserTransactionCount(telegramId) {
        const query = `
            SELECT COUNT(*) as transaction_count 
            FROM transactions 
            WHERE telegram_id = $1 AND status = 'completed'`;
        
        try {
            const result = await this.getOne(query, [telegramId]);
            return parseInt(result?.transaction_count || 0);
        } catch (error) {
            console.warn('Failed to get user transaction count:', error);
            return 0; // Default to 0 on error
        }
    }

    // Track user activity for monitoring
    async trackUserActivity(telegramId) {
        const query = `
            UPDATE users 
            SET last_activity = CURRENT_TIMESTAMP 
            WHERE telegram_id = $1`;
        
        try {
            await this.query(query, [telegramId]);
            
            // Invalidate user cache to ensure fresh data
            await this.invalidateStaticCache(telegramId, 'user');
        } catch (error) {
            // Don't throw error for activity tracking
            if (this.monitoring) {
                this.monitoring.logWarn('User activity tracking failed', { telegramId, error: error.message });
            } else {
                console.warn('User activity tracking failed:', error);
            }
        }
    }

    // ===== ACCESS CODE SYSTEM METHODS =====
    
    /**
     * Get access code data
     */
    async getAccessCode(code) {
        const query = `
            SELECT * FROM access_codes 
            WHERE code = $1`;
        
        try {
            return await this.getOne(query, [code]);
        } catch (error) {
            console.error('Error getting access code:', error);
            return null;
        }
    }

    /**
     * Create new access code
     */
    async createAccessCode(code, codeType, maxUses = null, expiresAt = null, createdBy = null) {
        const query = `
            INSERT INTO access_codes (code, code_type, max_uses, expires_at, created_by, is_active)
            VALUES ($1, $2, $3, $4, $5, true)
            RETURNING *`;
        
        try {
            // Convert createdBy to number if it's a string number, otherwise keep as null
            const createdByValue = createdBy && !isNaN(createdBy) ? parseInt(createdBy) : null;
            return await this.getOne(query, [code, codeType, maxUses, expiresAt, createdByValue]);
        } catch (error) {
            console.error('Error creating access code:', error);
            throw error;
        }
    }

    /**
     * Check if user has access
     */
    async getUserAccess(telegramId) {
        const query = `
            SELECT * FROM user_access 
            WHERE telegram_id = $1 AND is_active = true`;
        
        try {
            return await this.getOne(query, [telegramId]);
        } catch (error) {
            console.error('Error getting user access:', error);
            return null;
        }
    }

    /**
     * Grant access to user
     */
    async grantUserAccess(telegramId, code, userInfo = {}) {
        const query = `
            INSERT INTO user_access (telegram_id, used_code, access_granted_at, user_info, is_active)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3, true)
            ON CONFLICT (telegram_id) 
            DO UPDATE SET 
                used_code = EXCLUDED.used_code,
                access_granted_at = EXCLUDED.access_granted_at,
                user_info = EXCLUDED.user_info,
                is_active = EXCLUDED.is_active
            RETURNING *`;
        
        try {
            return await this.getOne(query, [telegramId, code, JSON.stringify(userInfo)]);
        } catch (error) {
            console.error('Error granting user access:', error);
            throw error;
        }
    }

    /**
     * Increment code usage count
     */
    async incrementCodeUsage(code) {
        const query = `
            UPDATE access_codes 
            SET used_count = used_count + 1
            WHERE code = $1 
            AND (max_uses IS NULL OR used_count < max_uses)
            AND is_active = true
            RETURNING *`;
        
        try {
            const result = await this.getOne(query, [code]);
            
            if (!result) {
                // Check why the update failed
                const codeCheck = await this.getOne(
                    'SELECT * FROM access_codes WHERE code = $1', 
                    [code]
                );
                
                if (!codeCheck) {
                    throw new Error('Code does not exist');
                } else if (!codeCheck.is_active) {
                    throw new Error('Code is inactive');
                } else if (codeCheck.max_uses && codeCheck.used_count >= codeCheck.max_uses) {
                    throw new Error('Code usage limit exceeded');
                }
            }
            
            return result;
        } catch (error) {
            console.error('Error incrementing code usage:', error);
            throw error;
        }
    }

    /**
     * Get all access codes (for admin)
     */
    async getAllAccessCodes() {
        const query = `
            SELECT ac.*, 
                   COUNT(ua.telegram_id) as users_count
            FROM access_codes ac
            LEFT JOIN user_access ua ON ac.code = ua.used_code
            GROUP BY ac.id, ac.code, ac.code_type, ac.max_uses, ac.used_count, 
                     ac.expires_at, ac.created_at, ac.created_by, ac.is_active
            ORDER BY ac.created_at DESC`;
        
        try {
            return await this.getAll(query);
        } catch (error) {
            console.error('Error getting all access codes:', error);
            return [];
        }
    }

    /**
     * Deactivate access code
     */
    async deactivateAccessCode(code) {
        const query = `
            UPDATE access_codes 
            SET is_active = false 
            WHERE code = $1
            RETURNING *`;
        
        try {
            return await this.getOne(query, [code]);
        } catch (error) {
            console.error('Error deactivating access code:', error);
            throw error;
        }
    }

    // Graceful shutdown
    async close() {
        try {
            await this.stopHealthMonitoring();
            
            if (this.cacheEnabled && this.redis) {
                await this.redis.quit();

            }
            
            if (this.pool) {
                await this.pool.end();

            }
        } catch (error) {
            console.error('Error during database shutdown:', error);
        }
    }
}

module.exports = DatabasePostgreSQL;
