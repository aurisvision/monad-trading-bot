#!/usr/bin/env node

/**
 * Database Connection Check and Fix Script
 * This script diagnoses and fixes database connection issues in production
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Configuration from environment variables
const config = {
    host: process.env.POSTGRES_HOST || 'ggo04s4ogo00kscg8wso4c8k',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '***REMOVED***',
    ssl: process.env.POSTGRES_SSL_MODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECT_TIMEOUT) || 60000,
    query_timeout: parseInt(process.env.POSTGRES_COMMAND_TIMEOUT) || 30000,
    application_name: process.env.POSTGRES_APPLICATION_NAME || 'area51_bot_diagnostic',
    max: 5, // Reduced for diagnostic
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 60000,
};

console.log('🔍 PostgreSQL Connection Diagnostic Tool');
console.log('=========================================');
console.log(`Host: ${config.host}`);
console.log(`Port: ${config.port}`);
console.log(`Database: ${config.database}`);
console.log(`User: ${config.user}`);
console.log(`SSL: ${config.ssl ? 'enabled' : 'disabled'}`);
console.log(`Application Name: ${config.application_name}`);
console.log('=========================================\n');

async function testDatabaseConnection() {
    let pool = null;
    let client = null;
    
    try {
        console.log('🔄 Creating PostgreSQL connection pool...');
        
        // Create connection pool
        pool = new Pool(config);
        
        // Set up event listeners
        pool.on('connect', (client) => {
            console.log('✅ New client connected to PostgreSQL');
        });

        pool.on('error', (err, client) => {
            console.error('❌ Unexpected error on idle client:', err.message);
        });

        // Test connection
        console.log('🔄 Testing database connection...');
        client = await pool.connect();
        console.log('✅ Database connection successful');

        // Test basic query
        console.log('🔄 Testing basic query...');
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('✅ Basic query successful');
        console.log(`   Current Time: ${result.rows[0].current_time}`);
        console.log(`   PostgreSQL Version: ${result.rows[0].pg_version}`);

        // Check database name
        console.log('🔄 Checking current database...');
        const dbResult = await client.query('SELECT current_database() as db_name');
        console.log(`✅ Connected to database: ${dbResult.rows[0].db_name}`);

        // Check if we're in the right database
        if (dbResult.rows[0].db_name !== config.database) {
            console.log(`⚠️ Warning: Expected database '${config.database}' but connected to '${dbResult.rows[0].db_name}'`);
        }

        return { pool, client, success: true };

    } catch (error) {
        console.error('\n❌ Database connection test failed:');
        console.error('Error:', error.message);
        console.error('Code:', error.code);
        console.error('Stack:', error.stack);
        
        if (client) {
            client.release();
        }
        if (pool) {
            await pool.end();
        }
        
        return { success: false, error };
    }
}

async function checkTableStructure(client) {
    console.log('\n🔍 Checking table structure...');
    
    try {
        // Check if users table exists and has required columns
        const usersCheck = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);

        if (usersCheck.rows.length === 0) {
            console.log('❌ Users table does not exist');
            return false;
        }

        console.log('📊 Users table structure:');
        usersCheck.rows.forEach(row => {
            console.log(`   ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });

        // Check for critical columns
        const columnNames = usersCheck.rows.map(row => row.column_name);
        const requiredColumns = ['encrypted_private_key', 'encrypted_mnemonic', 'username', 'last_activity', 'is_active'];
        
        console.log('\n🔍 Checking required columns:');
        const missingColumns = [];
        
        requiredColumns.forEach(col => {
            if (columnNames.includes(col)) {
                console.log(`   ✅ ${col}: EXISTS`);
            } else {
                console.log(`   ❌ ${col}: MISSING`);
                missingColumns.push(col);
            }
        });

        // Check transactions table
        const transactionsCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'transactions'
        `);

        const transactionColumns = transactionsCheck.rows.map(row => row.column_name);
        console.log('\n🔍 Checking transactions table:');
        if (transactionColumns.includes('type')) {
            console.log('   ✅ transactions.type: EXISTS');
        } else {
            console.log('   ❌ transactions.type: MISSING');
            missingColumns.push('transactions.type');
        }

        // Check access code tables
        const accessCodesCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('access_codes', 'user_access')
        `);

        console.log('\n🔍 Checking access code tables:');
        const accessTables = accessCodesCheck.rows.map(row => row.table_name);
        
        if (accessTables.includes('access_codes')) {
            console.log('   ✅ access_codes: EXISTS');
        } else {
            console.log('   ❌ access_codes: MISSING');
            missingColumns.push('access_codes table');
        }

        if (accessTables.includes('user_access')) {
            console.log('   ✅ user_access: EXISTS');
            
            // Check user_access.used_at column
            const userAccessCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'user_access' AND column_name = 'used_at'
            `);
            
            if (userAccessCheck.rows.length > 0) {
                console.log('   ✅ user_access.used_at: EXISTS');
            } else {
                console.log('   ❌ user_access.used_at: MISSING');
                missingColumns.push('user_access.used_at');
            }
        } else {
            console.log('   ❌ user_access: MISSING');
            missingColumns.push('user_access table');
        }

        return missingColumns.length === 0;

    } catch (error) {
        console.error('❌ Error checking table structure:', error.message);
        return false;
    }
}

async function runMigration(client) {
    console.log('\n🔄 Running database migration...');
    
    try {
        // Read migration file
        const migrationPath = path.join(__dirname, 'complete_migration.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');
        
        console.log('📄 Migration file loaded, executing...');
        
        // Execute migration
        await client.query(migrationSQL);
        
        console.log('✅ Migration executed successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        return false;
    }
}

async function testApplicationQueries(client) {
    console.log('\n🔄 Testing application-specific queries...');
    
    try {
        // Test the exact query that's failing in the application
        console.log('🔄 Testing user creation query...');
        
        const testQuery = `
            SELECT encrypted_private_key, encrypted_mnemonic 
            FROM users 
            WHERE telegram_id = $1
        `;
        
        // This should not fail even if no user exists
        const result = await client.query(testQuery, [999999999]);
        console.log('✅ User query test successful');
        
        // Test wallet creation simulation
        console.log('🔄 Testing wallet creation simulation...');
        
        const insertQuery = `
            INSERT INTO users (telegram_id, username, wallet_address, encrypted_private_key, encrypted_mnemonic, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (telegram_id) DO NOTHING
            RETURNING *
        `;
        
        const testResult = await client.query(insertQuery, [
            999999999,
            'test_user',
            'test_wallet_address',
            'test_encrypted_key',
            'test_encrypted_mnemonic'
        ]);
        
        console.log('✅ Wallet creation simulation successful');
        
        // Clean up test data
        await client.query('DELETE FROM users WHERE telegram_id = $1', [999999999]);
        console.log('✅ Test data cleaned up');
        
        return true;
        
    } catch (error) {
        console.error('❌ Application query test failed:', error.message);
        console.error('This is likely the root cause of the production issue');
        return false;
    }
}

async function main() {
    console.log('Starting database diagnostic...\n');
    
    // Test connection
    const connectionResult = await testDatabaseConnection();
    
    if (!connectionResult.success) {
        console.log('\n🔧 Troubleshooting suggestions:');
        console.log('1. Check if PostgreSQL container is running');
        console.log('2. Verify network connectivity between containers');
        console.log('3. Check database credentials');
        console.log('4. Verify database host name resolution');
        console.log('5. Check if PostgreSQL is accepting connections on port 5432');
        process.exit(1);
    }
    
    const { pool, client } = connectionResult;
    
    try {
        // Check table structure
        const structureOK = await checkTableStructure(client);
        
        if (!structureOK) {
            console.log('\n⚠️ Database structure issues detected, running migration...');
            const migrationSuccess = await runMigration(client);
            
            if (!migrationSuccess) {
                console.log('❌ Migration failed, manual intervention required');
                process.exit(1);
            }
            
            // Re-check structure after migration
            const structureOKAfterMigration = await checkTableStructure(client);
            if (!structureOKAfterMigration) {
                console.log('❌ Structure still incorrect after migration');
                process.exit(1);
            }
        }
        
        // Test application queries
        const queriesOK = await testApplicationQueries(client);
        
        if (!queriesOK) {
            console.log('❌ Application queries failed, check application code');
            process.exit(1);
        }
        
        console.log('\n🎉 All database tests passed successfully!');
        console.log('✅ Database is working correctly in production environment');
        
    } finally {
        if (client) {
            client.release();
        }
        if (pool) {
            await pool.end();
        }
    }
    
    console.log('\n🏁 Database diagnostic completed successfully');
    process.exit(0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the diagnostic
main().catch(console.error);
