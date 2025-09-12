// Area51 Bot Project Cleanup Analysis
// Identifies unused files, duplicate variables, and code duplication

const fs = require('fs');
const path = require('path');

class ProjectCleanupAnalyzer {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
        this.unusedFiles = [];
        this.duplicateVariables = [];
        this.duplicatedCode = [];
        this.mainFiles = [];
        this.scriptFiles = [];
        this.docFiles = [];
    }

    async analyzeProject() {
        console.log('🔍 Starting Project Cleanup Analysis...\n');
        
        await this.scanProjectStructure();
        await this.identifyUnusedFiles();
        await this.checkDuplicateVariables();
        await this.findCodeDuplication();
        
        this.generateCleanupReport();
    }

    async scanProjectStructure() {
        console.log('📂 Scanning Project Structure...');
        
        const srcFiles = this.getFilesInDirectory(path.join(this.projectRoot, 'src'));
        const scriptFiles = this.getFilesInDirectory(path.join(this.projectRoot, 'scripts'));
        const docFiles = this.getFilesInDirectory(path.join(this.projectRoot, 'docs'));
        const rootFiles = this.getFilesInDirectory(this.projectRoot, false);
        
        this.mainFiles = [...srcFiles, ...rootFiles.filter(f => f.endsWith('.js'))];
        this.scriptFiles = scriptFiles;
        this.docFiles = docFiles;
        
        console.log(`  - Main files: ${this.mainFiles.length}`);
        console.log(`  - Script files: ${this.scriptFiles.length}`);
        console.log(`  - Documentation files: ${this.docFiles.length}\n`);
    }

    getFilesInDirectory(dir, recursive = true) {
        const files = [];
        if (!fs.existsSync(dir)) return files;
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.md') || item.endsWith('.sql'))) {
                files.push(fullPath);
            } else if (stat.isDirectory() && recursive && item !== 'node_modules') {
                files.push(...this.getFilesInDirectory(fullPath, recursive));
            }
        }
        return files;
    }

    async identifyUnusedFiles() {
        console.log('🗑️ Identifying Unused Files...');
        
        // Check for unused main files
        const mainEntryPoint = path.join(this.projectRoot, 'src', 'index-modular-simple.js');
        const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));
        
        // Files that should be checked for usage
        const potentiallyUnused = [
            'src/database-postgresql-backup.js',
            'src/cluster.js',
            'production-start.js',
            'reset-database.js'
        ];
        
        for (const file of potentiallyUnused) {
            const fullPath = path.join(this.projectRoot, file);
            if (fs.existsSync(fullPath)) {
                const isUsed = await this.isFileReferenced(file);
                if (!isUsed) {
                    this.unusedFiles.push({
                        file: file,
                        reason: 'Not referenced in main code or package.json',
                        size: fs.statSync(fullPath).size
                    });
                }
            }
        }
        
        // Check for unused scripts
        const scriptUsageMap = {
            'validate-existing-buttons.js': 'Recently used for validation',
            'validate-button-database-mapping.js': 'Validation tool',
            'database-health-check.js': 'Monitoring tool',
            'test-performance.js': 'Performance testing',
            'test-event-driven-cache.js': 'Cache testing',
            'clean-database-schema.sql': 'Database migration',
            'migrate-to-postgresql.js': 'Migration script - can be archived',
            'fix-wallet-decryption.js': 'One-time fix - can be archived',
            'fix-user-states-table.sql': 'One-time fix - can be archived',
            'fix-user-settings-schema.sql': 'One-time fix - can be archived',
            'test-migration.js': 'Migration testing - can be archived',
            'reset-database.sql': 'Dangerous - should be moved to archive'
        };
        
        for (const [script, status] of Object.entries(scriptUsageMap)) {
            const fullPath = path.join(this.projectRoot, 'scripts', script);
            if (fs.existsSync(fullPath)) {
                if (status.includes('can be archived') || status.includes('should be moved')) {
                    this.unusedFiles.push({
                        file: `scripts/${script}`,
                        reason: status,
                        size: fs.statSync(fullPath).size
                    });
                }
            }
        }
        
        console.log(`  Found ${this.unusedFiles.length} potentially unused files\n`);
    }

    async isFileReferenced(filename) {
        const searchFiles = [
            ...this.mainFiles,
            path.join(this.projectRoot, 'package.json')
        ];
        
        for (const file of searchFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                if (content.includes(filename) || content.includes(path.basename(filename, '.js'))) {
                    return true;
                }
            } catch (error) {
                // Skip files that can't be read
            }
        }
        return false;
    }

    async checkDuplicateVariables() {
        console.log('🔄 Checking for Duplicate Variables...');
        
        const mainFile = path.join(this.projectRoot, 'src', 'index-modular-simple.js');
        const dbFile = path.join(this.projectRoot, 'src', 'database-postgresql.js');
        
        if (fs.existsSync(mainFile)) {
            const content = fs.readFileSync(mainFile, 'utf8');
            
            // Check for duplicate handler patterns
            const handlerPatterns = [
                /this\.bot\.action\(['"`]([^'"`]+)['"`]/g,
                /async\s+(\w+)\s*\(/g
            ];
            
            for (const pattern of handlerPatterns) {
                const matches = [...content.matchAll(pattern)];
                const handlers = matches.map(m => m[1]);
                const duplicates = handlers.filter((item, index) => handlers.indexOf(item) !== index);
                
                if (duplicates.length > 0) {
                    this.duplicateVariables.push({
                        type: 'Handler',
                        duplicates: [...new Set(duplicates)],
                        file: 'src/index-modular-simple.js'
                    });
                }
            }
        }
        
        console.log(`  Found ${this.duplicateVariables.length} duplicate variable groups\n`);
    }

    async findCodeDuplication() {
        console.log('📋 Finding Code Duplication...');
        
        const mainFile = path.join(this.projectRoot, 'src', 'index-modular-simple.js');
        
        if (fs.existsSync(mainFile)) {
            const content = fs.readFileSync(mainFile, 'utf8');
            
            // Check for duplicate error handling patterns
            const errorHandlingPattern = /catch\s*\(\s*error\s*\)\s*\{[\s\S]*?\}/g;
            const errorBlocks = [...content.matchAll(errorHandlingPattern)];
            
            if (errorBlocks.length > 5) {
                this.duplicatedCode.push({
                    type: 'Error Handling',
                    count: errorBlocks.length,
                    suggestion: 'Create centralized error handling utility',
                    file: 'src/index-modular-simple.js'
                });
            }
            
            // Check for duplicate database update patterns
            const dbUpdatePattern = /await\s+this\.database\.updateUserSettings\([^)]+\)/g;
            const dbUpdates = [...content.matchAll(dbUpdatePattern)];
            
            if (dbUpdates.length > 10) {
                this.duplicatedCode.push({
                    type: 'Database Updates',
                    count: dbUpdates.length,
                    suggestion: 'Consider creating wrapper methods for common updates',
                    file: 'src/index-modular-simple.js'
                });
            }
            
            // Check for duplicate cache clearing patterns
            const cachePattern = /this\.redis\.del\(/g;
            const cacheClears = [...content.matchAll(cachePattern)];
            
            if (cacheClears.length > 8) {
                this.duplicatedCode.push({
                    type: 'Cache Clearing',
                    count: cacheClears.length,
                    suggestion: 'Create centralized cache management utility',
                    file: 'src/index-modular-simple.js'
                });
            }
        }
        
        console.log(`  Found ${this.duplicatedCode.length} code duplication patterns\n`);
    }

    generateCleanupReport() {
        console.log('📊 PROJECT CLEANUP REPORT');
        console.log('='.repeat(60));
        
        // Unused Files Report
        if (this.unusedFiles.length > 0) {
            console.log('\n🗑️ UNUSED FILES TO REMOVE/ARCHIVE:');
            let totalSize = 0;
            for (const file of this.unusedFiles) {
                console.log(`  ❌ ${file.file}`);
                console.log(`     Reason: ${file.reason}`);
                console.log(`     Size: ${(file.size / 1024).toFixed(1)} KB`);
                totalSize += file.size;
            }
            console.log(`  📊 Total size to clean: ${(totalSize / 1024).toFixed(1)} KB`);
        } else {
            console.log('\n✅ NO UNUSED FILES FOUND');
        }
        
        // Duplicate Variables Report
        if (this.duplicateVariables.length > 0) {
            console.log('\n🔄 DUPLICATE VARIABLES FOUND:');
            for (const dup of this.duplicateVariables) {
                console.log(`  ⚠️ ${dup.type} duplicates in ${dup.file}:`);
                console.log(`     ${dup.duplicates.join(', ')}`);
            }
        } else {
            console.log('\n✅ NO DUPLICATE VARIABLES FOUND');
        }
        
        // Code Duplication Report
        if (this.duplicatedCode.length > 0) {
            console.log('\n📋 CODE DUPLICATION PATTERNS:');
            for (const dup of this.duplicatedCode) {
                console.log(`  🔄 ${dup.type}: ${dup.count} instances in ${dup.file}`);
                console.log(`     Suggestion: ${dup.suggestion}`);
            }
        } else {
            console.log('\n✅ NO SIGNIFICANT CODE DUPLICATION FOUND');
        }
        
        // Cleanup Recommendations
        console.log('\n💡 CLEANUP RECOMMENDATIONS:');
        
        if (this.unusedFiles.length > 0) {
            console.log('  1. Move old migration scripts to archive/ folder');
            console.log('  2. Remove unused backup files');
            console.log('  3. Clean up one-time fix scripts');
        }
        
        if (this.duplicatedCode.length > 0) {
            console.log('  4. Create utility functions for common patterns');
            console.log('  5. Centralize error handling');
            console.log('  6. Implement cache management utility');
        }
        
        console.log('  7. Update .gitignore to exclude temporary files');
        console.log('  8. Add ESLint rules to prevent future duplication');
        
        // Overall Status
        const totalIssues = this.unusedFiles.length + this.duplicateVariables.length + this.duplicatedCode.length;
        
        console.log(`\n📊 CLEANUP SUMMARY:`);
        console.log(`  Unused Files: ${this.unusedFiles.length}`);
        console.log(`  Duplicate Variables: ${this.duplicateVariables.length}`);
        console.log(`  Code Duplication Patterns: ${this.duplicatedCode.length}`);
        console.log(`  Total Issues: ${totalIssues}`);
        
        if (totalIssues === 0) {
            console.log('\n🎉 PROJECT IS CLEAN! No major cleanup needed.');
        } else {
            console.log(`\n⚠️ ${totalIssues} cleanup items identified.`);
        }
    }
}

// Run analysis if called directly
if (require.main === module) {
    const analyzer = new ProjectCleanupAnalyzer();
    
    analyzer.analyzeProject()
        .then(() => {
            console.log('\n✅ Cleanup analysis completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Analysis failed:', error);
            process.exit(1);
        });
}

module.exports = ProjectCleanupAnalyzer;
