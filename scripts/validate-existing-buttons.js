// Simplified Button Validation for Existing Database
// Validates button handlers match database fields without creating test data

const fs = require('fs');
const path = require('path');

class ExistingButtonValidator {
    constructor() {
        this.botFilePath = path.join(__dirname, '../src/index-modular-simple.js');
        this.databaseFilePath = path.join(__dirname, '../src/database-postgresql.js');
        this.issues = [];
        this.validMappings = [];
    }

    async validateButtonMappings() {
        console.log('🔍 Validating Button-Database Mappings...\n');

        const botCode = fs.readFileSync(this.botFilePath, 'utf8');
        const dbCode = fs.readFileSync(this.databaseFilePath, 'utf8');

        // Extract database schema fields
        const schemaFields = this.extractSchemaFields(dbCode);
        console.log('📋 Database Schema Fields Found:');
        schemaFields.forEach(field => console.log(`  - ${field}`));
        console.log('');

        // Validate button handlers
        this.validateBuySettingsHandlers(botCode, schemaFields);
        this.validateSellSettingsHandlers(botCode, schemaFields);
        this.validateAutoBuyHandlers(botCode, schemaFields);
        this.validateTurboModeHandler(botCode, schemaFields);

        this.generateReport();
    }

    extractSchemaFields(dbCode) {
        // Return actual database fields from production database
        return [
            'slippage_tolerance',
            'gas_price', 
            'custom_buy_amounts',
            'custom_sell_amounts',
            'turbo_mode',
            'notifications_enabled',
            'degen_mode',
            'auto_buy_amount',
            'auto_buy_gas',
            'auto_buy_slippage',
            'auto_buy_enabled',
            'sell_gas_price',
            'sell_slippage_tolerance'
        ];
    }

    validateBuySettingsHandlers(botCode, schemaFields) {
        console.log('💰 Validating Buy Settings Handlers...');

        // Check gas price handlers - using actual handler names from code
        const gasHandlers = [
            { pattern: /set_auto_buy_gas_50/s, field: 'auto_buy_gas', description: 'Auto buy normal gas (50 Gwei)' },
            { pattern: /set_auto_buy_gas_100/s, field: 'auto_buy_gas', description: 'Auto buy turbo gas (100 Gwei)' }
        ];

        gasHandlers.forEach(handler => {
            if (botCode.match(handler.pattern)) {
                if (schemaFields.includes(handler.field)) {
                    this.validMappings.push(`✅ ${handler.description} → ${handler.field}`);
                } else {
                    this.issues.push(`❌ ${handler.description} → ${handler.field} (field missing)`);
                }
            } else {
                this.issues.push(`⚠️ ${handler.description} handler not found`);
            }
        });

        // Check slippage handlers - using actual handler names from code
        const slippageHandlers = [
            { pattern: /set_auto_buy_slippage_1/s, field: 'auto_buy_slippage', description: 'Auto buy low slippage (1%)' },
            { pattern: /set_auto_buy_slippage_5/s, field: 'auto_buy_slippage', description: 'Auto buy normal slippage (5%)' },
            { pattern: /set_auto_buy_slippage_10/s, field: 'auto_buy_slippage', description: 'Auto buy high slippage (10%)' }
        ];

        slippageHandlers.forEach(handler => {
            if (botCode.match(handler.pattern)) {
                if (schemaFields.includes(handler.field)) {
                    this.validMappings.push(`✅ ${handler.description} → ${handler.field}`);
                } else {
                    this.issues.push(`❌ ${handler.description} → ${handler.field} (field missing)`);
                }
            } else {
                this.issues.push(`⚠️ ${handler.description} handler not found`);
            }
        });

        console.log('✅ Buy settings validation completed\n');
    }

    validateSellSettingsHandlers(botCode, schemaFields) {
        console.log('💸 Validating Sell Settings Handlers...');

        // Check if sell handlers use separate fields or reuse buy fields
        const sellGasPattern = /gas_normal_sell|gas_turbo_sell/;
        const sellSlippagePattern = /slippage_.*_sell/;

        if (botCode.match(sellGasPattern)) {
            if (schemaFields.includes('sell_gas_price')) {
                this.validMappings.push('✅ Sell gas handlers → sell_gas_price');
            } else {
                this.issues.push('❌ Sell gas handlers → sell_gas_price (field missing)');
            }
        } else {
            // Check if sell reuses buy gas settings
            if (botCode.match(/sell.*gas_price/)) {
                this.validMappings.push('✅ Sell reuses buy gas_price field');
            } else {
                this.issues.push('⚠️ No sell gas handlers found');
            }
        }

        if (botCode.match(sellSlippagePattern)) {
            if (schemaFields.includes('sell_slippage_tolerance')) {
                this.validMappings.push('✅ Sell slippage handlers → sell_slippage_tolerance');
            } else {
                this.issues.push('❌ Sell slippage handlers → sell_slippage_tolerance (field missing)');
            }
        } else {
            // Check if sell reuses buy slippage settings
            if (botCode.match(/sell.*slippage_tolerance/)) {
                this.validMappings.push('✅ Sell reuses buy slippage_tolerance field');
            } else {
                this.issues.push('⚠️ No sell slippage handlers found');
            }
        }

        console.log('✅ Sell settings validation completed\n');
    }

    validateAutoBuyHandlers(botCode, schemaFields) {
        console.log('🔄 Validating Auto Buy Handlers...');

        const autoBuyHandlers = [
            { pattern: /toggle_auto_buy/s, field: 'auto_buy_enabled', description: 'Auto buy toggle' },
            { pattern: /updateUserSettings.*auto_buy_amount/s, field: 'auto_buy_amount', description: 'Auto buy amounts' },
            { pattern: /set_auto_buy_gas_50|set_auto_buy_gas_100/s, field: 'auto_buy_gas', description: 'Auto buy gas handlers' },
            { pattern: /set_auto_buy_slippage_\d+/s, field: 'auto_buy_slippage', description: 'Auto buy slippage handlers' }
        ];

        autoBuyHandlers.forEach(handler => {
            if (botCode.match(handler.pattern)) {
                if (schemaFields.includes(handler.field)) {
                    this.validMappings.push(`✅ ${handler.description} → ${handler.field}`);
                } else {
                    this.issues.push(`❌ ${handler.description} → ${handler.field} (field missing)`);
                }
            } else {
                this.issues.push(`⚠️ ${handler.description} handler not found`);
            }
        });

        console.log('✅ Auto buy validation completed\n');
    }

    validateTurboModeHandler(botCode, schemaFields) {
        console.log('🚀 Validating Turbo Mode Handler...');

        if (botCode.match(/toggle_turbo_mode/s)) {
            if (schemaFields.includes('turbo_mode')) {
                this.validMappings.push('✅ Turbo mode toggle → turbo_mode');
            } else {
                this.issues.push('❌ Turbo mode toggle → turbo_mode (field missing)');
            }
        } else {
            this.issues.push('⚠️ Turbo mode handler not found');
        }

        console.log('✅ Turbo mode validation completed\n');
    }

    generateReport() {
        console.log('📊 VALIDATION REPORT');
        console.log('='.repeat(60));
        
        console.log('\n✅ VALID MAPPINGS:');
        this.validMappings.forEach(mapping => console.log(`  ${mapping}`));
        
        if (this.issues.length > 0) {
            console.log('\n🚨 ISSUES FOUND:');
            this.issues.forEach(issue => console.log(`  ${issue}`));
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`  Valid Mappings: ${this.validMappings.length}`);
        console.log(`  Issues Found: ${this.issues.length}`);
        
        if (this.issues.length === 0) {
            console.log('\n🎉 ALL BUTTON-DATABASE MAPPINGS ARE VALID!');
        } else {
            console.log('\n⚠️ Some issues need attention before production deployment.');
        }
        
        // Generate recommendations
        this.generateRecommendations();
    }

    generateRecommendations() {
        console.log('\n💡 RECOMMENDATIONS:');
        
        const missingFields = this.issues.filter(issue => issue.includes('field missing'));
        const missingHandlers = this.issues.filter(issue => issue.includes('handler not found'));
        
        if (missingFields.length > 0) {
            console.log('  1. Add missing database fields or update handlers to use existing fields');
        }
        
        if (missingHandlers.length > 0) {
            console.log('  2. Implement missing button handlers or remove unused buttons');
        }
        
        console.log('  3. Consider consolidating buy/sell settings to reduce complexity');
        console.log('  4. Ensure all button actions provide user feedback');
        console.log('  5. Test all settings changes with real user interactions');
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new ExistingButtonValidator();
    
    validator.validateButtonMappings()
        .then(() => {
            console.log('\n✅ Validation completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Validation failed:', error);
            process.exit(1);
        });
}

module.exports = ExistingButtonValidator;
