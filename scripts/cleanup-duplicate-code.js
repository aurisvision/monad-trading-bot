// Script to identify and clean up duplicate code patterns
const fs = require('fs');
const path = require('path');

class DuplicateCodeCleaner {
    constructor() {
        this.duplicatePatterns = [];
        this.consoleLogCount = 0;
        this.markupImportCount = 0;
    }

    // Analyze duplicate patterns
    analyzeDuplicates(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            
            if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
                this.analyzeDuplicates(fullPath);
            } else if (file.isFile() && file.name.endsWith('.js')) {
                this.analyzeFile(fullPath);
            }
        }
    }

    analyzeFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Count console.log statements
        const consoleMatches = content.match(/console\.(log|error|warn|info)/g);
        if (consoleMatches) {
            this.consoleLogCount += consoleMatches.length;
        }
        
        // Count Markup imports
        const markupMatches = content.match(/const.*Markup.*require.*telegraf/g);
        if (markupMatches) {
            this.markupImportCount += markupMatches.length;
        }
        
        // Find duplicate error handling patterns
        const errorPatterns = content.match(/catch\s*\([^)]*\)\s*{[^}]*console\.error/g);
        if (errorPatterns && errorPatterns.length > 1) {
            this.duplicatePatterns.push({
                file: filePath,
                pattern: 'error_handling',
                count: errorPatterns.length
            });
        }
    }

    generateCleanupPlan() {
        console.log('🧹 DUPLICATE CODE CLEANUP PLAN');
        console.log('=' .repeat(50));
        
        console.log(`\n📊 STATISTICS:`);
        console.log(`- Console statements found: ${this.consoleLogCount}`);
        console.log(`- Markup imports found: ${this.markupImportCount}`);
        console.log(`- Files with duplicate patterns: ${this.duplicatePatterns.length}`);
        
        console.log(`\n🎯 CLEANUP ACTIONS:`);
        
        if (this.consoleLogCount > 50) {
            console.log(`1. ⚠️  Replace ${this.consoleLogCount} console statements with proper logging`);
        }
        
        if (this.markupImportCount > 5) {
            console.log(`2. 🔄 Centralize ${this.markupImportCount} Markup imports using TelegramUtils`);
        }
        
        if (this.duplicatePatterns.length > 0) {
            console.log(`3. 🛠️  Refactor duplicate error handling patterns:`);
            this.duplicatePatterns.forEach(pattern => {
                console.log(`   - ${path.basename(pattern.file)}: ${pattern.count} duplicates`);
            });
        }
        
        console.log(`\n💡 RECOMMENDATIONS:`);
        console.log(`- Create centralized logging utility`);
        console.log(`- Use TelegramUtils for all Markup operations`);
        console.log(`- Implement standardized error handling`);
        console.log(`- Remove debug console.log statements`);
        
        console.log(`\n✅ Analysis complete!`);
    }
}

// Run analysis
const cleaner = new DuplicateCodeCleaner();
const projectRoot = path.join(process.cwd(), 'src');
cleaner.analyzeDuplicates(projectRoot);
cleaner.generateCleanupPlan();
