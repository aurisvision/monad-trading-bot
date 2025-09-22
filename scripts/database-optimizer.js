#!/usr/bin/env node

/**
 * 🗄️ Database Performance Optimization Script
 * Analyzes and optimizes database indexes for better performance
 * Area51 Bot - Pre-Launch Database Tuning
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

class DatabaseOptimizer {
    constructor() {
        this.pool = null;
        this.performanceReport = {
            currentIndexes: [],
            recommendedIndexes: [],
            slowQueries: [],
            optimizationSuggestions: [],
            executionTime: 0
        };
    }

    /**
     * Connect to database
     */
    async connect() {
        try {
            this.pool = new Pool({
                user: process.env.POSTGRES_USER || 'postgres',
                host: process.env.POSTGRES_HOST || 'localhost',
                database: process.env.POSTGRES_DB_NAME || 'area51_bot',
                password: process.env.POSTGRES_PASSWORD || '',
                port: parseInt(process.env.POSTGRES_PORT) || 5432,
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
                ssl: process.env.POSTGRES_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false
            });

            await this.pool.query('SELECT 1');
            console.log('✅ Connected to database successfully');
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            return false;
        }
    }

    /**
     * Analyze current database schema and indexes
     */
    async analyzeCurrentSchema() {
        console.log('\n📊 Analyzing current database schema...\n');

        try {
            // Get all tables
            const tablesQuery = `
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY tablename;
            `;
            const tablesResult = await this.pool.query(tablesQuery);
            const tables = tablesResult.rows.map(row => row.tablename);

            console.log(`📋 Found ${tables.length} tables:`);
            tables.forEach(table => console.log(`   - ${table}`));

            // Analyze indexes for each table
            for (const table of tables) {
                await this.analyzeTableIndexes(table);
            }

            // Analyze query performance
            await this.analyzeQueryPerformance();

        } catch (error) {
            console.error('❌ Schema analysis failed:', error.message);
            this.performanceReport.optimizationSuggestions.push({
                type: 'error',
                message: `Schema analysis failed: ${error.message}`,
                priority: 'high'
            });
        }
    }

    /**
     * Analyze indexes for a specific table
     */
    async analyzeTableIndexes(tableName) {
        try {
            // Get existing indexes (fixed query for compatibility)
            const indexesQuery = `
                SELECT
                    indexname,
                    indexdef,
                    pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as size
                FROM pg_indexes
                WHERE tablename = $1
                ORDER BY indexname;
            `;
            const indexesResult = await this.pool.query(indexesQuery, [tableName]);

            console.log(`\n📊 Table: ${tableName}`);
            console.log(`   Indexes: ${indexesResult.rows.length}`);

            indexesResult.rows.forEach(index => {
                console.log(`   - ${index.indexname}: ${index.size}`);
                this.performanceReport.currentIndexes.push({
                    table: tableName,
                    index: index.indexname,
                    definition: index.indexdef,
                    size: index.size
                });
            });

            // Analyze table structure and recommend indexes
            await this.analyzeTableStructure(tableName);

        } catch (error) {
            console.error(`❌ Failed to analyze indexes for ${tableName}:`, error.message);
        }
    }

    /**
     * Analyze table structure and recommend indexes
     */
    async analyzeTableStructure(tableName) {
        try {
            // Get table columns and their usage patterns
            const columnsQuery = `
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_name = $1
                AND table_schema = 'public'
                ORDER BY ordinal_position;
            `;
            const columnsResult = await this.pool.query(columnsQuery, [tableName]);

            const recommendations = [];

            // Analyze based on table type and column patterns
            switch (tableName) {
                case 'users':
                    recommendations.push({
                        table: tableName,
                        columns: ['telegram_id'],
                        type: 'unique',
                        reason: 'Primary user lookup optimization'
                    });
                    recommendations.push({
                        table: tableName,
                        columns: ['created_at'],
                        type: 'btree',
                        reason: 'User registration analytics'
                    });
                    break;

                case 'transactions':
                    recommendations.push({
                        table: tableName,
                        columns: ['user_id', 'created_at'],
                        type: 'btree',
                        reason: 'Transaction history queries'
                    });
                    recommendations.push({
                        table: tableName,
                        columns: ['token_address'],
                        type: 'btree',
                        reason: 'Token-specific transaction lookups'
                    });
                    recommendations.push({
                        table: tableName,
                        columns: ['status'],
                        type: 'btree',
                        reason: 'Transaction status filtering'
                    });
                    break;

                case 'user_states':
                    recommendations.push({
                        table: tableName,
                        columns: ['user_id'],
                        type: 'btree',
                        reason: 'User state management'
                    });
                    recommendations.push({
                        table: tableName,
                        columns: ['state'],
                        type: 'btree',
                        reason: 'State-based queries'
                    });
                    break;

                case 'rate_limits':
                    recommendations.push({
                        table: tableName,
                        columns: ['user_id', 'operation'],
                        type: 'btree',
                        reason: 'Rate limit checks'
                    });
                    recommendations.push({
                        table: tableName,
                        columns: ['expires_at'],
                        type: 'btree',
                        reason: 'Cleanup expired limits'
                    });
                    break;

                case 'system_metrics':
                    recommendations.push({
                        table: tableName,
                        columns: ['timestamp', 'metric_type'],
                        type: 'btree',
                        reason: 'Metrics analytics queries'
                    });
                    break;
            }

            // Check for missing indexes
            for (const rec of recommendations) {
                const indexExists = await this.checkIndexExists(tableName, rec.columns);
                if (!indexExists) {
                    console.log(`   ⚠️  Missing recommended index: ${rec.columns.join('_')} (${rec.reason})`);
                    this.performanceReport.recommendedIndexes.push(rec);
                } else {
                    console.log(`   ✅ Index exists: ${rec.columns.join('_')}`);
                }
            }

        } catch (error) {
            console.error(`❌ Failed to analyze table structure for ${tableName}:`, error.message);
        }
    }

    /**
     * Check if index exists for given columns
     */
    async checkIndexExists(tableName, columns) {
        try {
            const indexQuery = `
                SELECT 1
                FROM pg_indexes
                WHERE tablename = $1
                AND (
                    indexdef LIKE '%' || $2 || '%'
                    OR indexdef LIKE '%' || $3 || '%'
                )
                LIMIT 1;
            `;

            const columnString = columns.join(', ');
            const result = await this.pool.query(indexQuery, [tableName, columns[0], columnString]);
            return result.rows.length > 0;

        } catch (error) {
            console.error(`❌ Failed to check index existence:`, error.message);
            return false;
        }
    }

    /**
     * Analyze query performance
     */
    async analyzeQueryPerformance() {
        console.log('\n⚡ Analyzing query performance...\n');

        try {
            // Get slow queries (if pg_stat_statements is available)
            const slowQueriesQuery = `
                SELECT
                    query,
                    calls,
                    total_time,
                    mean_time,
                    rows
                FROM pg_stat_statements
                WHERE mean_time > 100  -- Queries taking more than 100ms on average
                ORDER BY mean_time DESC
                LIMIT 10;
            `;

            try {
                const slowQueriesResult = await this.pool.query(slowQueriesQuery);
                console.log(`🐌 Found ${slowQueriesResult.rows.length} slow queries:`);

                slowQueriesResult.rows.forEach((query, index) => {
                    console.log(`   ${index + 1}. ${query.mean_time.toFixed(2)}ms avg - ${query.calls} calls`);
                    console.log(`      ${query.query.substring(0, 100)}...`);

                    this.performanceReport.slowQueries.push({
                        query: query.query,
                        meanTime: query.mean_time,
                        calls: query.calls,
                        totalTime: query.total_time,
                        rows: query.rows
                    });
                });
            } catch (error) {
                console.log('   ℹ️  pg_stat_statements not available (performance monitoring extension)');
                this.performanceReport.optimizationSuggestions.push({
                    type: 'extension',
                    message: 'Consider enabling pg_stat_statements for query performance monitoring',
                    priority: 'medium'
                });
            }

            // Analyze table bloat
            await this.analyzeTableBloat();

        } catch (error) {
            console.error('❌ Query performance analysis failed:', error.message);
        }
    }

    /**
     * Analyze table bloat
     */
    async analyzeTableBloat() {
        try {
            const bloatQuery = `
                SELECT
                    schemaname,
                    tablename,
                    n_dead_tup,
                    n_live_tup,
                    CASE
                        WHEN n_live_tup > 0
                        THEN round((n_dead_tup::float / n_live_tup::float) * 100, 2)
                        ELSE 0
                    END as bloat_ratio
                FROM pg_stat_user_tables
                WHERE n_dead_tup > 0
                ORDER BY bloat_ratio DESC
                LIMIT 5;
            `;

            const bloatResult = await this.pool.query(bloatQuery);

            if (bloatResult.rows.length > 0) {
                console.log('\n📈 Table bloat analysis:');
                bloatResult.rows.forEach(row => {
                    if (row.bloat_ratio > 20) {
                        console.log(`   ⚠️  ${row.tablename}: ${row.bloat_ratio}% bloat (${row.n_dead_tup} dead tuples)`);
                        this.performanceReport.optimizationSuggestions.push({
                            type: 'maintenance',
                            table: row.tablename,
                            message: `High table bloat detected (${row.bloat_ratio}%). Consider VACUUM FULL.`,
                            priority: 'medium'
                        });
                    }
                });
            }

        } catch (error) {
            console.log('   ℹ️  Table bloat analysis not available');
        }
    }

    /**
     * Create recommended indexes
     */
    async createRecommendedIndexes() {
        console.log('\n🔧 Creating recommended indexes...\n');

        for (const rec of this.performanceReport.recommendedIndexes) {
            try {
                const indexName = `${rec.table}_${rec.columns.join('_')}_idx`;
                const indexQuery = `CREATE INDEX CONCURRENTLY ${indexName} ON ${rec.table} (${rec.columns.join(', ')});`;

                console.log(`   📝 Creating index: ${indexName}`);
                await this.pool.query(indexQuery);

                console.log(`   ✅ Index created successfully`);

                this.performanceReport.optimizationSuggestions.push({
                    type: 'success',
                    message: `Created index ${indexName} on ${rec.table}`,
                    priority: 'low'
                });

            } catch (error) {
                console.error(`   ❌ Failed to create index on ${rec.table}:`, error.message);
                this.performanceReport.optimizationSuggestions.push({
                    type: 'error',
                    message: `Failed to create index on ${rec.table}: ${error.message}`,
                    priority: 'high'
                });
            }
        }
    }

    /**
     * Generate optimization report
     */
    generateReport() {
        console.log('\n📋 Database Optimization Report');
        console.log('=' .repeat(50));

        console.log(`\n📊 Current Indexes: ${this.performanceReport.currentIndexes.length}`);
        this.performanceReport.currentIndexes.forEach(index => {
            console.log(`   - ${index.table}.${index.index} (${index.size})`);
        });

        console.log(`\n🎯 Recommended Indexes: ${this.performanceReport.recommendedIndexes.length}`);
        this.performanceReport.recommendedIndexes.forEach(rec => {
            console.log(`   - ${rec.table}: ${rec.columns.join(', ')} (${rec.reason})`);
        });

        console.log(`\n🐌 Slow Queries: ${this.performanceReport.slowQueries.length}`);
        this.performanceReport.slowQueries.forEach(query => {
            console.log(`   - ${query.meanTime.toFixed(2)}ms avg (${query.calls} calls)`);
        });

        console.log(`\n💡 Optimization Suggestions:`);
        this.performanceReport.optimizationSuggestions.forEach(suggestion => {
            const priorityIcon = suggestion.priority === 'high' ? '🔴' :
                               suggestion.priority === 'medium' ? '🟡' : '🟢';
            console.log(`   ${priorityIcon} ${suggestion.message}`);
        });

        // Save detailed report
        const reportPath = path.join(__dirname, '..', 'database-optimization-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(this.performanceReport, null, 2));
        console.log(`\n💾 Detailed report saved to: ${reportPath}`);
    }

    /**
     * Run the optimization process
     */
    async run(shouldCreateIndexes = false) {
        const startTime = Date.now();

        console.log('🚀 Starting Database Performance Optimization...\n');

        try {
            // Connect to database
            if (!(await this.connect())) {
                throw new Error('Database connection failed');
            }

            // Analyze current state
            await this.analyzeCurrentSchema();

            // Create indexes if requested
            if (shouldCreateIndexes) {
                await this.createRecommendedIndexes();
            }

            // Generate report
            this.generateReport();

            const endTime = Date.now();
            this.performanceReport.executionTime = endTime - startTime;

            console.log(`\n✅ Optimization completed in ${(endTime - startTime) / 1000}s`);

        } catch (error) {
            console.error('❌ Optimization failed:', error);
        } finally {
            if (this.pool) {
                await this.pool.end();
            }
        }
    }
}

// CLI interface
const args = process.argv.slice(2);
const optimizer = new DatabaseOptimizer();

if (args.includes('--create-indexes')) {
    console.log('⚠️  WARNING: This will create indexes on your production database.');
    console.log('   Make sure you understand the impact and have tested in staging first.');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...');

    setTimeout(() => {
        optimizer.run(true);
    }, 5000);
} else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🗄️ Database Performance Optimization Script

Usage:
  node scripts/database-optimizer.js                    # Analyze only
  node scripts/database-optimizer.js --create-indexes  # Analyze and create indexes
  node scripts/database-optimizer.js --help            # Show this help

Description:
  Analyzes database performance and recommends optimizations.
  Can automatically create recommended indexes when --create-indexes is used.

Features:
  - Index analysis and recommendations
  - Query performance monitoring
  - Table bloat detection
  - Automatic index creation (with warning)

Output:
  - Console report with findings and recommendations
  - JSON report saved to database-optimization-report.json

Safety:
  - Uses CONCURRENTLY for index creation (non-blocking)
  - Requires explicit --create-indexes flag
  - Provides detailed before/after analysis
    `);
} else {
    optimizer.run(false);
}
