// Project Cleanup Analysis Script
const fs = require('fs');
const path = require('path');

class ProjectCleanup {
    constructor() {
        this.unusedFiles = [];
        this.emptyFiles = [];
        this.duplicateImports = [];
        this.emptyDirectories = [];
    }

    // Check for empty files
    checkEmptyFiles(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            
            if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
                this.checkEmptyFiles(fullPath);
            } else if (file.isFile() && file.name.endsWith('.js')) {
                const content = fs.readFileSync(fullPath, 'utf8').trim();
                if (content === '' || content.length < 10) {
                    this.emptyFiles.push(fullPath);
                }
            }
        }
    }

    // Check for duplicate Markup imports
    checkDuplicateImports(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            
            if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
                this.checkDuplicateImports(fullPath);
            } else if (file.isFile() && file.name.endsWith('.js')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                const markupImports = content.match(/const.*Markup.*require.*telegraf/g);
                if (markupImports && markupImports.length > 0) {
                    this.duplicateImports.push({
                        file: fullPath,
                        imports: markupImports
                    });
                }
            }
        }
    }

    // Check for empty directories
    checkEmptyDirectories(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
            if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
                const fullPath = path.join(dir, file.name);
                const contents = fs.readdirSync(fullPath);
                
                if (contents.length === 0) {
                    this.emptyDirectories.push(fullPath);
                } else {
                    this.checkEmptyDirectories(fullPath);
                }
            }
        }
    }

    // Run full analysis
    analyze(projectRoot) {
        console.log('🔍 Starting project cleanup analysis...\n');
        
        this.checkEmptyFiles(projectRoot);
        this.checkDuplicateImports(projectRoot);
        this.checkEmptyDirectories(projectRoot);
        
        this.generateReport();
    }

    generateReport() {
        console.log('📊 PROJECT CLEANUP ANALYSIS REPORT');
        console.log('=' .repeat(50));
        
        console.log('\n🗑️ EMPTY FILES:');
        if (this.emptyFiles.length === 0) {
            console.log('✅ No empty files found');
        } else {
            this.emptyFiles.forEach(file => {
                console.log(`❌ ${file}`);
            });
        }
        
        console.log('\n📁 EMPTY DIRECTORIES:');
        if (this.emptyDirectories.length === 0) {
            console.log('✅ No empty directories found');
        } else {
            this.emptyDirectories.forEach(dir => {
                console.log(`❌ ${dir}`);
            });
        }
        
        console.log('\n🔄 DUPLICATE MARKUP IMPORTS:');
        if (this.duplicateImports.length === 0) {
            console.log('✅ No duplicate imports found');
        } else {
            this.duplicateImports.forEach(item => {
                console.log(`📄 ${item.file}`);
                item.imports.forEach(imp => {
                    console.log(`   - ${imp}`);
                });
            });
        }
        
        console.log('\n💡 RECOMMENDATIONS:');
        if (this.emptyFiles.length > 0) {
            console.log('- Remove empty files or add proper content');
        }
        if (this.emptyDirectories.length > 0) {
            console.log('- Remove empty directories');
        }
        if (this.duplicateImports.length > 0) {
            console.log('- Consider centralizing Markup imports in a shared utility');
        }
        
        console.log('\n✅ Analysis complete!');
    }
}

// Run analysis
const cleanup = new ProjectCleanup();
const projectRoot = process.cwd();
cleanup.analyze(projectRoot);
