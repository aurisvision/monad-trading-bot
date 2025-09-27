#!/usr/bin/env node

/**
 * Production Tests Runner
 * Runs all critical tests before deployment
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Area51 Bot - Production Tests Runner');
console.log('=======================================\n');

const tests = [
    {
        name: 'Database Connection & Schema Test',
        script: 'database/check_and_fix_database.js',
        critical: true
    },
    {
        name: 'Redis Connection Test',
        script: 'database/check_and_fix_redis.js',
        critical: true
    }
];

async function runTest(test) {
    return new Promise((resolve) => {
        console.log(`🔄 Running: ${test.name}`);
        console.log('─'.repeat(50));
        
        const child = spawn('node', [test.script], {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ${test.name}: PASSED\n`);
                resolve({ success: true, test });
            } else {
                console.log(`❌ ${test.name}: FAILED (Exit code: ${code})\n`);
                resolve({ success: false, test, code });
            }
        });
        
        child.on('error', (error) => {
            console.error(`💥 ${test.name}: ERROR - ${error.message}\n`);
            resolve({ success: false, test, error });
        });
    });
}

async function runAllTests() {
    const results = [];
    let allPassed = true;
    
    console.log('Starting production tests...\n');
    
    for (const test of tests) {
        const result = await runTest(test);
        results.push(result);
        
        if (!result.success && test.critical) {
            allPassed = false;
        }
    }
    
    // Summary
    console.log('🏁 TEST RESULTS SUMMARY');
    console.log('═'.repeat(50));
    
    results.forEach(result => {
        const status = result.success ? '✅ PASSED' : '❌ FAILED';
        const critical = result.test.critical ? ' (CRITICAL)' : '';
        console.log(`${status} - ${result.test.name}${critical}`);
    });
    
    console.log('═'.repeat(50));
    
    if (allPassed) {
        console.log('🎉 ALL TESTS PASSED - READY FOR PRODUCTION DEPLOYMENT!');
        console.log('✅ Database schema is correct');
        console.log('✅ Redis connection is working');
        console.log('✅ All critical systems operational');
        console.log('\n🚀 You can now deploy to production with confidence!');
        process.exit(0);
    } else {
        console.log('🚨 CRITICAL TESTS FAILED - DO NOT DEPLOY TO PRODUCTION!');
        console.log('❌ Fix the issues above before deployment');
        console.log('\n📋 Next steps:');
        console.log('1. Review the error messages above');
        console.log('2. Run the migration scripts if needed');
        console.log('3. Check container connectivity');
        console.log('4. Re-run this test script');
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run all tests
runAllTests().catch(console.error);
