#!/usr/bin/env node

/**
 * 🧹 Production Code Cleanup Script
 * Removes console.log statements and other debugging code from production files
 * Area51 Bot - Pre-Launch Cleanup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProductionCleanup {
    constructor() {
        this.stats = {
            filesProcessed: 0,
            consoleLogsRemoved: 0,
            filesModified: 0,
            errors: 0
        };

        this.srcDir = path.join(__dirname, '..', 'src');
        this.excludePatterns = [
            /\.test\.js$/,
            /\.spec\.js$/,
            /node_modules/,
            /\.git/,
            /logs/,
            /backups/,
            /archive/
        ];
    }

    /**
     * Check if file should be processed
     */
    shouldProcessFile(filePath) {
        const relativePath = path.relative(this.srcDir, filePath);

        // Skip excluded patterns
        for (const pattern of this.excludePatterns) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return false;
            }
        }

        // Only process JavaScript files
        return filePath.endsWith('.js');
    }

    /**
     * Remove console.log statements from file content
     */
    cleanConsoleLogs(content, filePath) {
        let cleanedContent = content;
        let removedCount = 0;

        // Patterns to remove (with variations)
        const patterns = [
            // Standard console methods
            /\bconsole\.log\s*\([^)]*\)\s*;?/g,
            /\bconsole\.error\s*\([^)]*\)\s*;?/g,
            /\bconsole\.warn\s*\([^)]*\)\s*;?/g,
            /\bconsole\.info\s*\([^)]*\)\s*;?/g,
            /\bconsole\.debug\s*\([^)]*\)\s*;?/g,

            // Console with template literals and multiple lines
            /console\.log\s*\(\s*`[\s\S]*?`\s*\)\s*;?/g,
            /console\.log\s*\(\s*[\s\S]*?\)\s*;?/g,

            // Console method calls that span multiple lines
            /console\.\w+\s*\([\s\S]*?\)\s*;?/g,

            // Debug console methods
            /\bconsole\.trace\s*\([^)]*\)\s*;?/g,
            /\bconsole\.table\s*\([^)]*\)\s*;?/g,
            /\bconsole\.time\s*\([^)]*\)\s*;?/g,
            /\bconsole\.timeEnd\s*\([^)]*\)\s*;?/g,

            // Commented console logs
            /\/\/\s*console\.\w+.*$/gm,
            /\/\*\s*console\.\w+[\s\S]*?\*\//g,
        ];

        // Apply all patterns
        for (const pattern of patterns) {
            const beforeLength = cleanedContent.length;
            cleanedContent = cleanedContent.replace(pattern, (match) => {
                // Only remove if it's not part of a larger expression or conditional
                if (this.isSafeToRemove(match, cleanedContent)) {
                    removedCount++;
                    console.log(`🧹 Removed from ${path.relative(this.srcDir, filePath)}: ${match.substring(0, 50)}...`);
                    return '';
                }
                return match;
            });
        }

        // Remove empty lines left by removed console statements
        cleanedContent = cleanedContent.replace(/^\s*$/gm, '').replace(/\n\s*\n\s*\n/g, '\n\n');

        return { content: cleanedContent, removedCount };
    }

    /**
     * Check if console statement is safe to remove
     */
    isSafeToRemove(match, fullContent) {
        // Don't remove if it's part of a conditional or assignment
        const contextBefore = fullContent.substring(Math.max(0, fullContent.indexOf(match) - 20), fullContent.indexOf(match));

        // Skip if preceded by assignment, return, if, etc.
        if (/\b(if|for|while|return|const|let|var|=|\?|:)\s*$/.test(contextBefore.trim())) {
            return false;
        }

        // Skip if it's part of a function call parameter
        const bracketCount = (contextBefore.match(/\(/g) || []).length - (contextBefore.match(/\)/g) || []).length;
        if (bracketCount > 0) {
            return false;
        }

        return true;
    }

    /**
     * Process a single file
     */
    processFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const { content: cleanedContent, removedCount } = this.cleanConsoleLogs(content, filePath);

            this.stats.filesProcessed++;

            if (removedCount > 0) {
                // Create backup
                const backupPath = filePath + '.backup';
                fs.writeFileSync(backupPath, content);
                console.log(`💾 Created backup: ${path.relative(this.srcDir, backupPath)}`);

                // Write cleaned content
                fs.writeFileSync(filePath, cleanedContent);

                this.stats.consoleLogsRemoved += removedCount;
                this.stats.filesModified++;

                console.log(`✅ Cleaned ${path.relative(this.srcDir, filePath)}: removed ${removedCount} console statements`);
            }

        } catch (error) {
            this.stats.errors++;
            console.error(`❌ Error processing ${path.relative(this.srcDir, filePath)}:`, error.message);
        }
    }

    /**
     * Recursively process all files in directory
     */
    processDirectory(dirPath) {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                this.processDirectory(fullPath);
            } else if (stat.isFile() && this.shouldProcessFile(fullPath)) {
                this.processFile(fullPath);
            }
        }
    }

    /**
     * Run the cleanup process
     */
    async run() {
        console.log('🚀 Starting Production Code Cleanup...\n');
        console.log(`📁 Processing directory: ${this.srcDir}\n`);

        try {
            this.processDirectory(this.srcDir);

            console.log('\n📊 Cleanup Summary:');
            console.log(`   Files processed: ${this.stats.filesProcessed}`);
            console.log(`   Files modified: ${this.stats.filesModified}`);
            console.log(`   Console statements removed: ${this.stats.consoleLogsRemoved}`);
            console.log(`   Errors: ${this.stats.errors}`);

            if (this.stats.errors === 0 && this.stats.filesModified > 0) {
                console.log('\n✅ Production cleanup completed successfully!');
                console.log('🎯 Your code is now production-ready.');
            } else if (this.stats.errors > 0) {
                console.log('\n⚠️ Cleanup completed with some errors. Please review manually.');
            } else {
                console.log('\nℹ️ No console statements found. Your code was already clean!');
            }

        } catch (error) {
            console.error('❌ Fatal error during cleanup:', error);
            process.exit(1);
        }
    }

    /**
     * Restore backups if needed
     */
    restoreBackups() {
        console.log('🔄 Restoring backups...');

        const findBackups = (dirPath) => {
            const items = fs.readdirSync(dirPath);

            for (const item of items) {
                const fullPath = path.join(dirPath, item);

                if (fullPath.endsWith('.backup')) {
                    const originalPath = fullPath.replace('.backup', '');
                    if (fs.existsSync(originalPath)) {
                        fs.copyFileSync(fullPath, originalPath);
                        fs.unlinkSync(fullPath);
                        console.log(`🔄 Restored: ${path.relative(this.srcDir, originalPath)}`);
                    }
                } else if (fs.statSync(fullPath).isDirectory()) {
                    findBackups(fullPath);
                }
            }
        };

        findBackups(this.srcDir);
        console.log('✅ All backups restored.');
    }
}

// CLI interface
const args = process.argv.slice(2);
const cleanup = new ProductionCleanup();

if (args.includes('--restore')) {
    cleanup.restoreBackups();
} else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🧹 Production Code Cleanup Script

Usage:
  node scripts/cleanup-production.js          # Clean production code
  node scripts/cleanup-production.js --restore # Restore backups
  node scripts/cleanup-production.js --help    # Show this help

Description:
  Removes console.log statements and other debugging code from production files.
  Creates backups automatically before modifying files.

Safety:
  - Only processes .js files in src/ directory
  - Excludes test files and node_modules
  - Creates .backup files before modification
  - Safe regex patterns to avoid breaking code
    `);
} else {
    cleanup.run();
}
