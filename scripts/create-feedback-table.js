const fs = require('fs');
const path = require('path');
const Database = require('../src/database-postgresql');

async function createFeedbackTable() {
    const database = new Database();
    
    try {
        console.log('🔄 Initializing database...');
        await database.initialize();
        
        console.log('📄 Reading migration file...');
        const migrationPath = path.join(__dirname, '../database/migrations/create_feedback_table.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('🚀 Running feedback table migration...');
        await database.query(migrationSQL);
        
        console.log('✅ Feedback table created successfully!');
        
        // Verify table creation
        const verifyQuery = `
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'feedback' 
            ORDER BY ordinal_position;
        `;
        
        const result = await database.query(verifyQuery);
        console.log('📊 Table structure verified:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
        // Check indexes
        const indexQuery = `
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'feedback';
        `;
        
        const indexResult = await database.query(indexQuery);
        console.log('🔍 Indexes created:');
        indexResult.rows.forEach(row => {
            console.log(`  - ${row.indexname}`);
        });
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await database.close();
        console.log('🔌 Database connection closed.');
    }
}

// Run the migration
createFeedbackTable();