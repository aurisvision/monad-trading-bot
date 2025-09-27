#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'ggo04s4ogo00kscg8wso4c8k',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL_MODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
    max: 10
});

async function runFix() {
    console.log('🔧 Starting database schema fix...');
    
    try {
        // Read the SQL file
        const sqlPath = path.join(__dirname, 'fix_access_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('📖 SQL file loaded successfully');
        
        // Connect to database
        const client = await pool.connect();
        console.log('✅ Connected to database');
        
        // Execute the SQL
        await client.query(sql);
        console.log('✅ Database schema fix completed successfully');
        
        // Test the fix
        const testQuery = `
            SELECT 
                (SELECT COUNT(*) FROM access_codes) as access_codes_count,
                (SELECT COUNT(*) FROM user_access) as user_access_count,
                (SELECT COUNT(*) FROM information_schema.columns 
                 WHERE table_name = 'transactions' AND column_name = 'type') as transactions_type_exists
        `;
        
        const result = await client.query(testQuery);
        const stats = result.rows[0];
        
        console.log('📊 Database Status:');
        console.log(`   - Access codes: ${stats.access_codes_count}`);
        console.log(`   - User access records: ${stats.user_access_count}`);
        console.log(`   - Transactions type column: ${stats.transactions_type_exists > 0 ? 'EXISTS' : 'MISSING'}`);
        
        client.release();
        
        console.log('🎉 Database fix completed successfully!');
        console.log('🚀 Bot should now work without database errors');
        
    } catch (error) {
        console.error('❌ Database fix failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the fix
runFix().catch(console.error);
