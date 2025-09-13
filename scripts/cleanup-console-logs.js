// Script to replace console statements with proper logging
const fs = require('fs');
const path = require('path');

class ConsoleLogCleaner {
    constructor() {
        this.processedFiles = 0;
        this.replacedStatements = 0;
    }

    cleanFile(filePath) {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Replace console.log with proper logging (keep important ones)
        const originalConsoleCount = (content.match(/console\.(log|error|warn|info)/g) || []).length;
        
        // Remove debug console.log statements but keep important ones
        content = content.replace(/^\s*console\.log\([^)]*\);\s*$/gm, (match) => {
            // Keep console.log statements that seem important
            if (match.includes('ERROR') || 
                match.includes('CRITICAL') || 
                match.includes('SUCCESS') ||
                match.includes('🔍') ||
                match.includes('✅') ||
                match.includes('❌') ||
                match.includes('🚀')) {
                return match;
            }
            modified = true;
            return ''; // Remove debug logs
        });
        
        // Replace remaining console.error with winston logging where winston is available
        if (content.includes("require('winston')") || content.includes('this.logger')) {
            content = content.replace(/console\.error\(/g, 'this.logger?.error(');
            content = content.replace(/console\.warn\(/g, 'this.logger?.warn(');
            content = content.replace(/console\.info\(/g, 'this.logger?.info(');
            modified = true;
        }
        
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            const newConsoleCount = (content.match(/console\.(log|error|warn|info)/g) || []).length;
            const removed = originalConsoleCount - newConsoleCount;
            this.replacedStatements += removed;
            this.processedFiles++;
            console.log(`✅ ${path.basename(filePath)}: Removed ${removed} console statements`);
        }
    }

    cleanDirectory(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            
            if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
                this.cleanDirectory(fullPath);
            } else if (file.isFile() && file.name.endsWith('.js') && !file.name.includes('cleanup')) {
                this.cleanFile(fullPath);
            }
        }
    }

    run(projectRoot) {
        console.log('🧹 Starting console.log cleanup...\n');
        
        this.cleanDirectory(path.join(projectRoot, 'src'));
        
        console.log(`\n📊 CLEANUP SUMMARY:`);
        console.log(`- Files processed: ${this.processedFiles}`);
        console.log(`- Console statements removed: ${this.replacedStatements}`);
        console.log(`✅ Console cleanup complete!`);
    }
}

// Run cleanup
const cleaner = new ConsoleLogCleaner();
cleaner.run(process.cwd());
