#!/usr/bin/env node
/**
 * Project Cleanup Script for Area51 Telegram Trading Bot
 * Removes unused files, optimizes structure, and improves maintainability
 */

const fs = require('fs').promises;
const path = require('path');

class ProjectCleanup {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
        this.removedFiles = [];
        this.cleanedFiles = [];
        this.errors = [];
    }

    /**
     * Main cleanup execution
     */
    async execute() {
        console.log('🧹 Starting Area51 Bot Project Cleanup...\n');

        try {
            // Step 1: Remove unused files
            await this.removeUnusedFiles();
            
            // Step 2: Clean up imports
            await this.cleanupImports();
            
            // Step 3: Optimize file structure
            await this.optimizeStructure();
            
            // Step 4: Generate cleanup report
            await this.generateReport();

            console.log('\n✅ Project cleanup completed successfully!');
            
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
            throw error;
        }
    }

    /**
     * Remove unused and empty files
     */
    async removeUnusedFiles() {
        console.log('🗑️  Removing unused files...');

        const filesToRemove = [
            // Empty monitoring files
            'src/monitoring/ComprehensiveTracker.js',
            'src/monitoring/DatabaseTracker.js',
            'src/monitoring/TrackingDashboard.js',
            'src/monitoring/BotTracker.js',
            'src/monitoring/ApiTracker.js',
            'src/monitoring/CacheTracker.js',
            
            // Unused cluster files (if confirmed unused)
            'src/services/RedisClusterManager.js',
            
            // Empty handler files
            'src/handlers/UnifiedTradingHandlers.js',
            
            // Archive files that are no longer needed
            'src/services/archive/CacheClusterAdapter.js',
            'src/services/archive/CacheTransitionAdapter.js',
            'src/services/archive/DevelopmentCacheCluster.js'
        ];

        for (const filePath of filesToRemove) {
            const fullPath = path.join(this.projectRoot, filePath);
            
            try {
                const stats = await fs.stat(fullPath);
                
                // Check if file is empty or very small (likely unused)
                if (stats.size === 0 || stats.size === 1) {
                    await fs.unlink(fullPath);
                    this.removedFiles.push(filePath);
                    console.log(`   ✅ Removed empty file: ${filePath}`);
                } else {
                    // Check if file is actually used in the project
                    const isUsed = await this.isFileUsed(filePath);
                    if (!isUsed) {
                        await fs.unlink(fullPath);
                        this.removedFiles.push(filePath);
                        console.log(`   ✅ Removed unused file: ${filePath}`);
                    }
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    this.errors.push(`Failed to remove ${filePath}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Check if a file is actually used in the project
     */
    async isFileUsed(filePath) {
        const fileName = path.basename(filePath, '.js');
        const searchPatterns = [
            `require('${filePath.replace(/\\/g, '/')}')`,
            `require('./${filePath.replace(/\\/g, '/')}')`,
            `require('../${filePath.replace(/\\/g, '/')}')`,
            `require('../../${filePath.replace(/\\/g, '/')}')`,
            `require('./${fileName}')`,
            `require('../${fileName}')`,
            `require('../../${fileName}')`,
            `new ${fileName}`,
            `${fileName}(`
        ];

        try {
            const srcDir = path.join(this.projectRoot, 'src');
            const files = await this.getAllJSFiles(srcDir);

            for (const file of files) {
                const content = await fs.readFile(file, 'utf8');
                
                for (const pattern of searchPatterns) {
                    if (content.includes(pattern)) {
                        return true;
                    }
                }
            }
            
            return false;
        } catch (error) {
            console.warn(`Warning: Could not check usage for ${filePath}: ${error.message}`);
            return true; // Err on the side of caution
        }
    }

    /**
     * Get all JavaScript files recursively
     */
    async getAllJSFiles(dir) {
        const files = [];
        
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    const subFiles = await this.getAllJSFiles(fullPath);
                    files.push(...subFiles);
                } else if (entry.name.endsWith('.js')) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory doesn't exist or can't be read
        }
        
        return files;
    }

    /**
     * Clean up unused imports
     */
    async cleanupImports() {
        console.log('🔧 Cleaning up unused imports...');

        const mainFile = path.join(this.projectRoot, 'src', 'index-modular-simple.js');
        
        try {
            let content = await fs.readFile(mainFile, 'utf8');
            let modified = false;

            // Remove commented out imports
            const commentedImports = [
                /\/\/ const ComprehensiveTracker = require\('\.\/monitoring\/ComprehensiveTracker'\);?\n/g,
                /\/\/ const DatabaseTracker = require\('\.\/monitoring\/DatabaseTracker'\);?\n/g,
                /\/\/ const CacheTracker = require\('\.\/monitoring\/CacheTracker'\);?\n/g,
                /\/\/ const ApiTracker = require\('\.\/monitoring\/ApiTracker'\);?\n/g,
                /\/\/ const BotTracker = require\('\.\/monitoring\/BotTracker'\);?\n/g,
                /\/\/ const TrackingDashboard = require\('\.\/monitoring\/TrackingDashboard'\);?\n/g
            ];

            for (const pattern of commentedImports) {
                if (pattern.test(content)) {
                    content = content.replace(pattern, '');
                    modified = true;
                }
            }

            if (modified) {
                await fs.writeFile(mainFile, content, 'utf8');
                this.cleanedFiles.push('src/index-modular-simple.js');
                console.log('   ✅ Cleaned up commented imports in main file');
            }

        } catch (error) {
            this.errors.push(`Failed to cleanup imports: ${error.message}`);
        }
    }

    /**
     * Optimize file structure
     */
    async optimizeStructure() {
        console.log('📁 Optimizing file structure...');

        // Remove empty directories
        const dirsToCheck = [
            'src/monitoring',
            'src/services/archive',
            'src/core'
        ];

        for (const dir of dirsToCheck) {
            const fullPath = path.join(this.projectRoot, dir);
            
            try {
                const entries = await fs.readdir(fullPath);
                if (entries.length === 0) {
                    await fs.rmdir(fullPath);
                    console.log(`   ✅ Removed empty directory: ${dir}`);
                }
            } catch (error) {
                // Directory doesn't exist or not empty
            }
        }
    }

    /**
     * Generate cleanup report
     */
    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            removedFiles: this.removedFiles,
            cleanedFiles: this.cleanedFiles,
            errors: this.errors,
            summary: {
                totalRemovedFiles: this.removedFiles.length,
                totalCleanedFiles: this.cleanedFiles.length,
                totalErrors: this.errors.length
            }
        };

        const reportPath = path.join(this.projectRoot, 'cleanup-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

        console.log('\n📊 Cleanup Summary:');
        console.log(`   📁 Files removed: ${report.summary.totalRemovedFiles}`);
        console.log(`   🔧 Files cleaned: ${report.summary.totalCleanedFiles}`);
        console.log(`   ❌ Errors: ${report.summary.totalErrors}`);
        
        if (report.summary.totalErrors > 0) {
            console.log('\n⚠️  Errors encountered:');
            report.errors.forEach(error => console.log(`   - ${error}`));
        }

        console.log(`\n📄 Full report saved to: cleanup-report.json`);
    }
}

// Execute cleanup if run directly
if (require.main === module) {
    const cleanup = new ProjectCleanup();
    cleanup.execute().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = ProjectCleanup;
