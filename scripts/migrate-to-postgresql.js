// Migration script from SQLite to PostgreSQL with data preservation
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class DatabaseMigration {
    constructor() {
        // SQLite source
        this.sqlitePath = process.env.SQLITE_PATH || './data/area51.db';
        
        // PostgreSQL target
        this.pgPool = new Pool({
            user: process.env.POSTGRES_USER || 'area51_user',
            password: process.env.POSTGRES_PASSWORD,
            host: process.env.POSTGRES_HOST || 'localhost',
            port: process.env.POSTGRES_PORT || 5432,
            database: process.env.POSTGRES_DB || 'area51_bot'
        });
        
        this.batchSize = 1000;
    }

    async migrate() {
        console.log('🔄 Starting database migration from SQLite to PostgreSQL...');
        
        try {
            // 1. Verify source database exists
            if (!fs.existsSync(this.sqlitePath)) {
                console.log('⚠️  SQLite database not found, creating fresh PostgreSQL setup');
                await this.setupFreshDatabase();
                return;
            }

            // 2. Connect to both databases
            const sqlite = await this.connectSQLite();
            await this.testPostgreSQLConnection();

            // 3. Create PostgreSQL schema
            await this.createPostgreSQLSchema();

            // 4. Migrate data table by table
            await this.migrateUsers(sqlite);
            await this.migrateUserSettings(sqlite);
            await this.migrateTransactions(sqlite);
            await this.migratePortfolioEntries(sqlite);
            await this.migrateUserStates(sqlite);
            await this.migrateTempSellData(sqlite);

            // 5. Verify migration
            await this.verifyMigration(sqlite);

            // 6. Close connections
            sqlite.close();
            await this.pgPool.end();

            console.log('✅ Migration completed successfully!');
            console.log('📝 Next steps:');
            console.log('   1. Update .env to use PostgreSQL');
            console.log('   2. Replace database.js with database-postgresql.js');
            console.log('   3. Install new dependencies: npm install pg redis');
            console.log('   4. Test the application');

        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }

    async connectSQLite() {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.sqlitePath, (err) => {
                if (err) reject(err);
                else {
                    console.log('📁 Connected to SQLite database');
                    resolve(db);
                }
            });
        });
    }

    async testPostgreSQLConnection() {
        const client = await this.pgPool.connect();
        console.log('🐘 Connected to PostgreSQL database');
        client.release();
    }

    async setupFreshDatabase() {
        console.log('🆕 Setting up fresh PostgreSQL database...');
        const DatabasePostgreSQL = require('../src/database-postgresql');
        const db = new DatabasePostgreSQL();
        await db.init();
        await db.close();
        console.log('✅ Fresh PostgreSQL database ready');
    }

    async createPostgreSQLSchema() {
        console.log('🏗️  Creating PostgreSQL schema...');
        const DatabasePostgreSQL = require('../src/database-postgresql');
        const db = new DatabasePostgreSQL();
        await db.createTables();
        await db.createIndexes();
        await db.close();
        console.log('✅ PostgreSQL schema created');
    }

    async migrateUsers(sqlite) {
        console.log('👥 Migrating users...');
        
        const users = await this.getSQLiteData(sqlite, 'SELECT * FROM users');
        console.log(`Found ${users.length} users to migrate`);

        for (let i = 0; i < users.length; i += this.batchSize) {
            const batch = users.slice(i, i + this.batchSize);
            
            for (const user of batch) {
                await this.pgPool.query(`
                    INSERT INTO users 
                    (telegram_id, wallet_address, encrypted_private_key, encrypted_mnemonic, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (telegram_id) DO NOTHING
                `, [
                    user.telegram_id,
                    user.wallet_address,
                    user.encrypted_private_key,
                    user.mnemonic, // SQLite column name
                    user.created_at,
                    user.updated_at
                ]);
            }
            
            console.log(`✅ Migrated ${Math.min(i + this.batchSize, users.length)}/${users.length} users`);
        }
    }

    async migrateUserSettings(sqlite) {
        console.log('⚙️  Migrating user settings...');
        
        const settings = await this.getSQLiteData(sqlite, 'SELECT * FROM user_settings');
        console.log(`Found ${settings.length} user settings to migrate`);

        for (const setting of settings) {
            await this.pgPool.query(`
                INSERT INTO user_settings 
                (telegram_id, buy_slippage, sell_slippage, auto_buy_enabled, auto_sell_enabled,
                 auto_sell_profit_target, custom_buy_amounts, custom_sell_percentages, gas_priority)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (telegram_id) DO NOTHING
            `, [
                setting.telegram_id,
                setting.buy_slippage,
                setting.sell_slippage,
                setting.auto_buy_enabled,
                setting.auto_sell_enabled,
                setting.auto_sell_profit_target,
                setting.custom_buy_amounts,
                setting.custom_sell_percentages,
                setting.gas_priority
            ]);
        }
        
        console.log(`✅ Migrated ${settings.length} user settings`);
    }

    async migrateTransactions(sqlite) {
        console.log('💳 Migrating transactions...');
        
        const transactions = await this.getSQLiteData(sqlite, 'SELECT * FROM transactions');
        console.log(`Found ${transactions.length} transactions to migrate`);

        for (let i = 0; i < transactions.length; i += this.batchSize) {
            const batch = transactions.slice(i, i + this.batchSize);
            
            for (const tx of batch) {
                await this.pgPool.query(`
                    INSERT INTO transactions 
                    (telegram_id, tx_hash, type, token_address, token_symbol, amount,
                     price_per_token, total_value, gas_used, gas_price, status, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT DO NOTHING
                `, [
                    tx.telegram_id,
                    tx.tx_hash,
                    tx.type,
                    tx.token_address,
                    tx.token_symbol,
                    tx.amount,
                    tx.price_per_token,
                    tx.total_value,
                    tx.gas_used,
                    tx.gas_price,
                    tx.status,
                    tx.created_at
                ]);
            }
            
            console.log(`✅ Migrated ${Math.min(i + this.batchSize, transactions.length)}/${transactions.length} transactions`);
        }
    }

    async migratePortfolioEntries(sqlite) {
        console.log('📊 Migrating portfolio entries...');
        
        const entries = await this.getSQLiteData(sqlite, 'SELECT * FROM portfolio_entries');
        console.log(`Found ${entries.length} portfolio entries to migrate`);

        for (const entry of entries) {
            await this.pgPool.query(`
                INSERT INTO portfolio_entries 
                (telegram_id, token_address, token_symbol, total_bought, total_sold,
                 average_buy_price, current_balance, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (telegram_id, token_address) DO NOTHING
            `, [
                entry.telegram_id,
                entry.token_address,
                entry.token_symbol,
                entry.total_bought,
                entry.total_sold,
                entry.average_buy_price,
                entry.current_balance,
                entry.created_at,
                entry.updated_at
            ]);
        }
        
        console.log(`✅ Migrated ${entries.length} portfolio entries`);
    }

    async migrateUserStates(sqlite) {
        console.log('🔄 Migrating user states...');
        
        const states = await this.getSQLiteData(sqlite, 'SELECT * FROM user_states');
        console.log(`Found ${states.length} user states to migrate`);

        for (const state of states) {
            await this.pgPool.query(`
                INSERT INTO user_states (telegram_id, state, data, created_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (telegram_id) DO NOTHING
            `, [
                state.telegram_id,
                state.state,
                state.data,
                state.created_at
            ]);
        }
        
        console.log(`✅ Migrated ${states.length} user states`);
    }

    async migrateTempSellData(sqlite) {
        console.log('🔄 Migrating temporary sell data...');
        
        try {
            const tempData = await this.getSQLiteData(sqlite, 'SELECT * FROM temp_sell_data');
            console.log(`Found ${tempData.length} temp sell data entries to migrate`);

            for (const data of tempData) {
                await this.pgPool.query(`
                    INSERT INTO temp_sell_data 
                    (id, telegram_id, token_address, token_symbol, amount, quote_data, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO NOTHING
                `, [
                    data.id,
                    data.telegram_id,
                    data.token_address,
                    data.token_symbol,
                    data.amount,
                    data.quote_data,
                    data.created_at
                ]);
            }
            
            console.log(`✅ Migrated ${tempData.length} temp sell data entries`);
        } catch (error) {
            console.log('⚠️  Temp sell data table not found in SQLite, skipping...');
        }
    }

    async getSQLiteData(sqlite, query) {
        return new Promise((resolve, reject) => {
            sqlite.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async verifyMigration(sqlite) {
        console.log('🔍 Verifying migration...');
        
        const tables = ['users', 'user_settings', 'transactions', 'portfolio_entries'];
        
        for (const table of tables) {
            const sqliteCount = await this.getSQLiteCount(sqlite, table);
            const pgCount = await this.getPostgreSQLCount(table);
            
            console.log(`📊 ${table}: SQLite=${sqliteCount}, PostgreSQL=${pgCount}`);
            
            if (sqliteCount !== pgCount) {
                console.warn(`⚠️  Count mismatch in ${table} table`);
            }
        }
        
        console.log('✅ Migration verification completed');
    }

    async getSQLiteCount(sqlite, table) {
        return new Promise((resolve, reject) => {
            sqlite.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
                if (err) resolve(0); // Table might not exist
                else resolve(row.count);
            });
        });
    }

    async getPostgreSQLCount(table) {
        try {
            const result = await this.pgPool.query(`SELECT COUNT(*) as count FROM ${table}`);
            return parseInt(result.rows[0].count);
        } catch (error) {
            return 0;
        }
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new DatabaseMigration();
    migration.migrate().catch(console.error);
}

module.exports = DatabaseMigration;
