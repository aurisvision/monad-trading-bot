require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'area51_bot',
    password: process.env.DB_PASSWORD || 'postgres',
    port: 5432
});

async function fixDefaultValue() {
    try {
        // Fix the default value
        await pool.query(`ALTER TABLE user_settings ALTER COLUMN custom_buy_amounts SET DEFAULT '0.1,0.5,1,5';`);
        console.log('✅ Fixed default value for custom_buy_amounts');
        
        // Update existing records that have wrong values
        const result = await pool.query(`
            UPDATE user_settings 
            SET custom_buy_amounts = '0.1,0.5,1,5' 
            WHERE custom_buy_amounts = '[]' OR custom_buy_amounts IS NULL;
        `);
        console.log(`✅ Updated ${result.rowCount} existing records`);
        
        // Verify the fix
        const check = await pool.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns 
            WHERE table_name = 'user_settings' 
            AND column_name = 'custom_buy_amounts';
        `);
        
        console.log('Current schema:', check.rows[0]);
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

fixDefaultValue();
