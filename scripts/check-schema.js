require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'area51_bot',
    password: process.env.DB_PASSWORD || 'postgres',
    port: 5432
});

async function checkSchema() {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns 
            WHERE table_name = 'user_settings' 
            AND column_name IN ('custom_buy_amounts', 'custom_sell_percentages')
            ORDER BY column_name;
        `);
        
        console.log('Current column types:');
        result.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
        });
        
        // Fix if needed
        if (result.rows.some(row => row.data_type === 'json' || row.data_type === 'jsonb')) {
            console.log('\nFixing column types...');
            
            await pool.query('ALTER TABLE user_settings ALTER COLUMN custom_buy_amounts TYPE TEXT;');
            await pool.query('ALTER TABLE user_settings ALTER COLUMN custom_sell_percentages TYPE TEXT;');
            
            console.log('✅ Column types fixed to TEXT');
        } else {
            console.log('✅ Column types are correct (TEXT)');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkSchema();
