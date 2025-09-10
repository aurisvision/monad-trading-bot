// Test script to verify migration data integrity
const Database = require('../src/database');
const DatabasePostgreSQL = require('../src/database-postgresql');
const fs = require('fs').promises;

class MigrationTester {
    constructor() {
        this.sqliteDb = new Database();
        this.postgresDb = new DatabasePostgreSQL();
        this.results = {
            users: { sqlite: 0, postgres: 0, match: false },
            transactions: { sqlite: 0, postgres: 0, match: false },
            portfolio: { sqlite: 0, postgres: 0, match: false },
            settings: { sqlite: 0, postgres: 0, match: false }
        };
    }

    async initialize() {
        await this.sqliteDb.initialize();
        await this.postgresDb.initialize();
    }

    async testUserMigration() {
        console.log('Testing user data migration...');
        
        // Count SQLite users
        const sqliteUsers = await this.sqliteDb.db.all('SELECT COUNT(*) as count FROM users');
        this.results.users.sqlite = sqliteUsers[0].count;
        
        // Count PostgreSQL users
        const postgresUsers = await this.postgresDb.pool.query('SELECT COUNT(*) as count FROM users');
        this.results.users.postgres = parseInt(postgresUsers.rows[0].count);
        
        this.results.users.match = this.results.users.sqlite === this.results.users.postgres;
        
        // Sample data verification
        if (this.results.users.sqlite > 0) {
            const sqliteSample = await this.sqliteDb.db.get('SELECT * FROM users LIMIT 1');
            const postgresSample = await this.postgresDb.pool.query('SELECT * FROM users LIMIT 1');
            
            if (postgresSample.rows.length > 0) {
                const match = sqliteSample.telegram_id === postgresSample.rows[0].telegram_id;
                console.log(`Sample user match: ${match}`);
            }
        }
        
        console.log(`Users - SQLite: ${this.results.users.sqlite}, PostgreSQL: ${this.results.users.postgres}, Match: ${this.results.users.match}`);
    }

    async testTransactionMigration() {
        console.log('Testing transaction data migration...');
        
        const sqliteTxns = await this.sqliteDb.db.all('SELECT COUNT(*) as count FROM transactions');
        this.results.transactions.sqlite = sqliteTxns[0].count;
        
        const postgresTxns = await this.postgresDb.pool.query('SELECT COUNT(*) as count FROM transactions');
        this.results.transactions.postgres = parseInt(postgresTxns.rows[0].count);
        
        this.results.transactions.match = this.results.transactions.sqlite === this.results.transactions.postgres;
        
        console.log(`Transactions - SQLite: ${this.results.transactions.sqlite}, PostgreSQL: ${this.results.transactions.postgres}, Match: ${this.results.transactions.match}`);
    }

    async testPortfolioMigration() {
        console.log('Testing portfolio data migration...');
        
        const sqlitePortfolio = await this.sqliteDb.db.all('SELECT COUNT(*) as count FROM portfolio_entries');
        this.results.portfolio.sqlite = sqlitePortfolio[0].count;
        
        const postgresPortfolio = await this.postgresDb.pool.query('SELECT COUNT(*) as count FROM portfolio_entries');
        this.results.portfolio.postgres = parseInt(postgresPortfolio.rows[0].count);
        
        this.results.portfolio.match = this.results.portfolio.sqlite === this.results.portfolio.postgres;
        
        console.log(`Portfolio - SQLite: ${this.results.portfolio.sqlite}, PostgreSQL: ${this.results.portfolio.postgres}, Match: ${this.results.portfolio.match}`);
    }

    async testSettingsMigration() {
        console.log('Testing settings data migration...');
        
        const sqliteSettings = await this.sqliteDb.db.all('SELECT COUNT(*) as count FROM user_settings');
        this.results.settings.sqlite = sqliteSettings[0].count;
        
        const postgresSettings = await this.postgresDb.pool.query('SELECT COUNT(*) as count FROM user_settings');
        this.results.settings.postgres = parseInt(postgresSettings.rows[0].count);
        
        this.results.settings.match = this.results.settings.sqlite === this.results.settings.postgres;
        
        console.log(`Settings - SQLite: ${this.results.settings.sqlite}, PostgreSQL: ${this.results.settings.postgres}, Match: ${this.results.settings.match}`);
    }

    async testPerformance() {
        console.log('Testing performance...');
        
        // Test query performance
        const start = Date.now();
        await this.postgresDb.pool.query('SELECT COUNT(*) FROM users');
        const duration = Date.now() - start;
        
        console.log(`PostgreSQL query performance: ${duration}ms`);
        
        // Test connection pool
        const stats = await this.postgresDb.getConnectionStats();
        console.log('Connection pool stats:', stats);
    }

    async generateReport() {
        const allMatch = Object.values(this.results).every(r => r.match);
        
        const report = {
            timestamp: new Date().toISOString(),
            overall_success: allMatch,
            details: this.results,
            summary: {
                total_sqlite_records: Object.values(this.results).reduce((sum, r) => sum + r.sqlite, 0),
                total_postgres_records: Object.values(this.results).reduce((sum, r) => sum + r.postgres, 0)
            }
        };
        
        await fs.writeFile('migration-test-report.json', JSON.stringify(report, null, 2));
        
        console.log('\n=== MIGRATION TEST REPORT ===');
        console.log(`Overall Success: ${allMatch ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Total Records Migrated: ${report.summary.total_postgres_records}`);
        console.log('\nDetailed Results:');
        
        for (const [table, result] of Object.entries(this.results)) {
            const status = result.match ? '✅' : '❌';
            console.log(`${status} ${table}: ${result.sqlite} → ${result.postgres}`);
        }
        
        return allMatch;
    }

    async cleanup() {
        await this.sqliteDb.close();
        await this.postgresDb.close();
    }

    async runFullTest() {
        try {
            await this.initialize();
            
            await this.testUserMigration();
            await this.testTransactionMigration();
            await this.testPortfolioMigration();
            await this.testSettingsMigration();
            await this.testPerformance();
            
            const success = await this.generateReport();
            
            return success;
        } catch (error) {
            console.error('Migration test failed:', error);
            return false;
        } finally {
            await this.cleanup();
        }
    }
}

// Run test if called directly
if (require.main === module) {
    const tester = new MigrationTester();
    tester.runFullTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = MigrationTester;
