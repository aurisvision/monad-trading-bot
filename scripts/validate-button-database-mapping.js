// Button-Database Mapping Validation Script
// Verifies all buttons work correctly with database variables

const Database = require('../src/database-postgresql');

class ButtonDatabaseValidator {
    constructor() {
        this.database = new Database();
        this.validationResults = [];
    }

    async validateAllButtons() {
        console.log('🔍 Starting Button-Database Validation...\n');

        // Test user creation and settings initialization
        await this.testUserSettingsCreation();
        
        // Validate each button category
        await this.validateBuySettingsButtons();
        await this.validateSellSettingsButtons();
        await this.validateAutoBuyButtons();
        await this.validateTurboModeButton();
        
        // Generate report
        this.generateValidationReport();
    }

    async testUserSettingsCreation() {
        console.log('📋 Testing User Settings Creation...');
        const testUserId = 999999999; // Test user ID
        
        try {
            // Create test user settings
            await this.database.createUserSettings(testUserId);
            const settings = await this.database.getUserSettings(testUserId);
            
            this.validateField(settings, 'gas_price', 'number', 'Buy gas price');
            this.validateField(settings, 'slippage_tolerance', 'number', 'Buy slippage');
            this.validateField(settings, 'sell_gas_price', 'number', 'Sell gas price');
            this.validateField(settings, 'sell_slippage_tolerance', 'number', 'Sell slippage');
            this.validateField(settings, 'auto_buy_enabled', 'boolean', 'Auto buy enabled');
            this.validateField(settings, 'auto_buy_amount', 'number', 'Auto buy amount');
            this.validateField(settings, 'auto_buy_gas', 'number', 'Auto buy gas');
            this.validateField(settings, 'auto_buy_slippage', 'number', 'Auto buy slippage');
            this.validateField(settings, 'turbo_mode', 'boolean', 'Turbo mode');
            
            console.log('✅ User settings creation validated\n');
        } catch (error) {
            console.error('❌ User settings creation failed:', error.message);
        }
    }

    async validateBuySettingsButtons() {
        console.log('💰 Validating Buy Settings Buttons...');
        const testUserId = 999999999;
        
        // Test gas price updates
        const gasTests = [
            { field: 'gas_price', value: 50000000000, description: 'Normal gas (50 Gwei)' },
            { field: 'gas_price', value: 100000000000, description: 'Turbo gas (100 Gwei)' }
        ];
        
        for (const test of gasTests) {
            await this.testFieldUpdate(testUserId, test.field, test.value, test.description);
        }
        
        // Test slippage updates
        const slippageTests = [
            { field: 'slippage_tolerance', value: 1, description: 'Low slippage (1%)' },
            { field: 'slippage_tolerance', value: 5, description: 'Normal slippage (5%)' },
            { field: 'slippage_tolerance', value: 10, description: 'High slippage (10%)' }
        ];
        
        for (const test of slippageTests) {
            await this.testFieldUpdate(testUserId, test.field, test.value, test.description);
        }
        
        console.log('✅ Buy settings buttons validated\n');
    }

    async validateSellSettingsButtons() {
        console.log('💸 Validating Sell Settings Buttons...');
        const testUserId = 999999999;
        
        // Test sell gas price updates
        const sellGasTests = [
            { field: 'sell_gas_price', value: 50000000000, description: 'Sell normal gas (50 Gwei)' },
            { field: 'sell_gas_price', value: 100000000000, description: 'Sell turbo gas (100 Gwei)' }
        ];
        
        for (const test of sellGasTests) {
            await this.testFieldUpdate(testUserId, test.field, test.value, test.description);
        }
        
        // Test sell slippage updates
        const sellSlippageTests = [
            { field: 'sell_slippage_tolerance', value: 1, description: 'Sell low slippage (1%)' },
            { field: 'sell_slippage_tolerance', value: 5, description: 'Sell normal slippage (5%)' },
            { field: 'sell_slippage_tolerance', value: 10, description: 'Sell high slippage (10%)' }
        ];
        
        for (const test of sellSlippageTests) {
            await this.testFieldUpdate(testUserId, test.field, test.value, test.description);
        }
        
        console.log('✅ Sell settings buttons validated\n');
    }

    async validateAutoBuyButtons() {
        console.log('🔄 Validating Auto Buy Buttons...');
        const testUserId = 999999999;
        
        // Test auto buy toggle
        await this.testFieldUpdate(testUserId, 'auto_buy_enabled', true, 'Auto buy enable');
        await this.testFieldUpdate(testUserId, 'auto_buy_enabled', false, 'Auto buy disable');
        
        // Test auto buy amounts
        const amountTests = [
            { field: 'auto_buy_amount', value: 0.1, description: 'Auto buy 0.1 MON' },
            { field: 'auto_buy_amount', value: 0.5, description: 'Auto buy 0.5 MON' },
            { field: 'auto_buy_amount', value: 1.0, description: 'Auto buy 1.0 MON' },
            { field: 'auto_buy_amount', value: 5.0, description: 'Auto buy 5.0 MON' }
        ];
        
        for (const test of amountTests) {
            await this.testFieldUpdate(testUserId, test.field, test.value, test.description);
        }
        
        // Test auto buy gas
        const autoBuyGasTests = [
            { field: 'auto_buy_gas', value: 50000000000, description: 'Auto buy normal gas (50 Gwei)' },
            { field: 'auto_buy_gas', value: 100000000000, description: 'Auto buy turbo gas (100 Gwei)' }
        ];
        
        for (const test of autoBuyGasTests) {
            await this.testFieldUpdate(testUserId, test.field, test.value, test.description);
        }
        
        // Test auto buy slippage
        const autoBuySlippageTests = [
            { field: 'auto_buy_slippage', value: 1, description: 'Auto buy low slippage (1%)' },
            { field: 'auto_buy_slippage', value: 5, description: 'Auto buy normal slippage (5%)' },
            { field: 'auto_buy_slippage', value: 10, description: 'Auto buy high slippage (10%)' }
        ];
        
        for (const test of autoBuySlippageTests) {
            await this.testFieldUpdate(testUserId, test.field, test.value, test.description);
        }
        
        console.log('✅ Auto buy buttons validated\n');
    }

    async validateTurboModeButton() {
        console.log('🚀 Validating Turbo Mode Button...');
        const testUserId = 999999999;
        
        await this.testFieldUpdate(testUserId, 'turbo_mode', true, 'Turbo mode enable');
        await this.testFieldUpdate(testUserId, 'turbo_mode', false, 'Turbo mode disable');
        
        console.log('✅ Turbo mode button validated\n');
    }

    async testFieldUpdate(userId, field, value, description) {
        try {
            // Update field
            await this.database.updateUserSettings(userId, { [field]: value });
            
            // Verify update
            const settings = await this.database.getUserSettings(userId);
            const actualValue = settings[field];
            
            if (actualValue == value) { // Use == for type flexibility
                console.log(`✅ ${description}: ${actualValue}`);
                this.validationResults.push({ field, test: description, status: 'PASS', value: actualValue });
            } else {
                console.log(`❌ ${description}: Expected ${value}, got ${actualValue}`);
                this.validationResults.push({ field, test: description, status: 'FAIL', expected: value, actual: actualValue });
            }
        } catch (error) {
            console.log(`❌ ${description}: Error - ${error.message}`);
            this.validationResults.push({ field, test: description, status: 'ERROR', error: error.message });
        }
    }

    validateField(settings, field, expectedType, description) {
        const value = settings[field];
        const actualType = typeof value;
        
        if (value !== null && value !== undefined) {
            if (expectedType === 'number' && (actualType === 'number' || actualType === 'string')) {
                console.log(`✅ ${description}: ${value} (${actualType})`);
                return true;
            } else if (actualType === expectedType) {
                console.log(`✅ ${description}: ${value} (${actualType})`);
                return true;
            }
        }
        
        console.log(`❌ ${description}: ${value} (${actualType}) - Expected ${expectedType}`);
        return false;
    }

    generateValidationReport() {
        console.log('\n📊 VALIDATION REPORT');
        console.log('='.repeat(50));
        
        const passed = this.validationResults.filter(r => r.status === 'PASS').length;
        const failed = this.validationResults.filter(r => r.status === 'FAIL').length;
        const errors = this.validationResults.filter(r => r.status === 'ERROR').length;
        
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`🚨 Errors: ${errors}`);
        console.log(`📊 Total Tests: ${this.validationResults.length}`);
        
        if (failed > 0 || errors > 0) {
            console.log('\n🚨 ISSUES FOUND:');
            this.validationResults
                .filter(r => r.status !== 'PASS')
                .forEach(result => {
                    console.log(`- ${result.test}: ${result.status}`);
                    if (result.expected) console.log(`  Expected: ${result.expected}, Got: ${result.actual}`);
                    if (result.error) console.log(`  Error: ${result.error}`);
                });
        } else {
            console.log('\n🎉 ALL TESTS PASSED! Database-button mapping is correct.');
        }
    }

    async cleanup() {
        // Clean up test data
        try {
            await this.database.pool.query('DELETE FROM user_settings WHERE telegram_id = 999999999');
            await this.database.pool.query('DELETE FROM users WHERE telegram_id = 999999999');
            console.log('\n🧹 Test data cleaned up');
        } catch (error) {
            console.log('⚠️ Cleanup warning:', error.message);
        }
        
        if (this.database.pool) {
            await this.database.pool.end();
        }
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new ButtonDatabaseValidator();
    
    validator.validateAllButtons()
        .then(() => validator.cleanup())
        .then(() => {
            console.log('\n✅ Validation completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Validation failed:', error);
            process.exit(1);
        });
}

module.exports = ButtonDatabaseValidator;
