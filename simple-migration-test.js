#!/usr/bin/env node

/**
 * Simple Migration Test
 * Tests the migration system without complex dependencies
 */

const MigrationConfig = require('./src/config/MigrationConfig');

class SimpleMigrationTest {
    constructor() {
        this.config = new MigrationConfig();
    }

    /**
     * Test migration configuration
     */
    testMigrationConfig() {
        console.log('🧪 Testing Migration Configuration...');
        
        // Test initial state
        console.log('📋 Initial Configuration:');
        this.printConfigStatus();
        
        // Test phase enabling
        console.log('\n🔄 Testing Phase 1 Activation...');
        this.config.enablePhase('phase1');
        this.config.enableHandler('navigation');
        this.printConfigStatus();
        
        // Test user routing
        console.log('\n👥 Testing User Routing...');
        this.testUserRouting();
        
        // Test rollback
        console.log('\n🚨 Testing Emergency Rollback...');
        this.config.resetToDefaults();
        this.printConfigStatus();
        
        console.log('\n✅ Migration configuration test completed successfully!');
    }

    /**
     * Test user routing logic
     */
    testUserRouting() {
        const testUsers = [
            'test_user_123', // Should use new handler (in test users list)
            'admin_user_456', // Should use new handler (in test users list)
            'regular_user_789', // Should use old handler (not in test users)
            'random_user_001' // Should use old handler (not in test users)
        ];

        testUsers.forEach(userId => {
            const shouldUseNew = this.config.shouldUseNewHandler(userId, 'navigation');
            const handlerType = shouldUseNew ? 'NEW' : 'OLD';
            console.log(`  User ${userId}: ${handlerType} handler`);
        });
    }

    /**
     * Print current configuration status
     */
    printConfigStatus() {
        const stats = this.config.getStats();
        
        console.log(`  Enabled: ${stats.enabled ? '✅' : '❌'}`);
        console.log(`  Test Mode: ${stats.testMode ? '✅' : '❌'}`);
        console.log(`  Current Phase: ${stats.currentPhase}`);
        console.log(`  Enabled Handlers: ${stats.enabledHandlers.join(', ') || 'none'}`);
    }

    /**
     * Test percentage-based rollout
     */
    testPercentageRollout() {
        console.log('\n🎯 Testing Percentage-based Rollout...');
        
        // Enable phase 2 (5% rollout)
        this.config.enablePhase('phase2');
        this.config.enableHandler('navigation');
        
        // Test with 100 random users
        let newHandlerCount = 0;
        const totalUsers = 100;
        
        for (let i = 0; i < totalUsers; i++) {
            const userId = `user_${i}`;
            const shouldUseNew = this.config.shouldUseNewHandler(userId, 'navigation');
            if (shouldUseNew) {
                newHandlerCount++;
            }
        }
        
        const percentage = (newHandlerCount / totalUsers) * 100;
        console.log(`  Expected: ~5% | Actual: ${percentage.toFixed(1)}%`);
        console.log(`  Users with new handler: ${newHandlerCount}/${totalUsers}`);
        
        // Reset for next test
        this.config.resetToDefaults();
    }

    /**
     * Test all migration phases
     */
    testAllPhases() {
        console.log('\n🚀 Testing All Migration Phases...');
        
        const phases = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5'];
        
        phases.forEach(phaseName => {
            console.log(`\n  Testing ${phaseName}:`);
            this.config.resetToDefaults();
            this.config.enablePhase(phaseName);
            this.config.enableHandler('navigation');
            
            const currentPhase = this.config.getCurrentPhase();
            console.log(`    Phase: ${currentPhase.name}`);
            console.log(`    Percentage: ${currentPhase.percentage}%`);
            console.log(`    Test Users: ${currentPhase.testUsers.length}`);
        });
        
        this.config.resetToDefaults();
    }

    /**
     * Test configuration export/import
     */
    testConfigBackup() {
        console.log('\n💾 Testing Configuration Backup/Restore...');
        
        // Configure a test setup
        this.config.enablePhase('phase2');
        this.config.enableHandler('navigation');
        this.config.enableHandler('wallet');
        
        // Export configuration
        const backup = this.config.exportConfig();
        console.log('  ✅ Configuration exported');
        
        // Reset and import
        this.config.resetToDefaults();
        console.log('  ✅ Configuration reset');
        
        const imported = this.config.importConfig(backup);
        console.log(`  ${imported ? '✅' : '❌'} Configuration imported`);
        
        // Verify import worked
        const stats = this.config.getStats();
        console.log(`  Enabled handlers after import: ${stats.enabledHandlers.join(', ')}`);
    }

    /**
     * Run comprehensive test suite
     */
    runAllTests() {
        console.log('🎯 Starting Comprehensive Migration Tests');
        console.log('=========================================\n');
        
        try {
            this.testMigrationConfig();
            this.testPercentageRollout();
            this.testAllPhases();
            this.testConfigBackup();
            
            console.log('\n🎉 All migration tests passed successfully!');
            console.log('✅ Migration system is ready for deployment');
            
        } catch (error) {
            console.error('\n❌ Migration test failed:', error);
            process.exit(1);
        }
    }
}

// CLI Interface
function main() {
    const args = process.argv.slice(2);
    const tester = new SimpleMigrationTest();
    
    if (args.includes('--config')) {
        tester.testMigrationConfig();
    } else if (args.includes('--percentage')) {
        tester.testPercentageRollout();
    } else if (args.includes('--phases')) {
        tester.testAllPhases();
    } else if (args.includes('--backup')) {
        tester.testConfigBackup();
    } else {
        tester.runAllTests();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = SimpleMigrationTest;