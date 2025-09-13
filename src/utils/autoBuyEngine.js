/**
 * Auto Buy Engine
 * Handles automatic token purchases with separate settings from regular buy/sell
 */

class AutoBuyEngine {
    constructor(database, monorailAPI, walletManager, monitoring) {
        this.database = database;
        this.monorailAPI = monorailAPI;
        this.walletManager = walletManager;
        this.monitoring = monitoring;
        
        // Initialize gas/slippage priority system
        const GasSlippagePriority = require('./gasSlippagePriority');
        this.prioritySystem = new GasSlippagePriority(database);
    }

    /**
     * Execute auto buy transaction using separate auto buy settings
     * This is completely independent from regular buy/sell settings
     */
    async executeBuy(telegramId, tokenAddress, buyAmount) {
        try {

            // Get user wallet
            const user = await this.database.getUser(telegramId);
            if (!user) {
                throw new Error('User not found');
            }

            // Get auto buy settings (completely separate from regular settings)
            const autoBuySettings = await this.prioritySystem.getAutoBuySettings(telegramId);
            console.log(`🎯 Auto Buy Settings: Gas=${Math.round(autoBuySettings.gas/1000000000)} Gwei, Slippage=${autoBuySettings.slippage}%, Amount=${autoBuySettings.amount} MON`);

            // Check if auto buy is enabled
            const userSettings = await this.database.getUserSettings(telegramId);
            if (!userSettings?.auto_buy_enabled) {
                console.log('❌ Auto buy is disabled for this user');
                return {
                    success: false,
                    error: 'Auto buy is disabled'
                };
            }

            // Get wallet
            let wallet;
            try {
                wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);
            } catch (walletError) {
                console.error('❌ Wallet error:', walletError);
                return {
                    success: false,
                    error: 'Failed to access wallet'
                };
            }

            // Execute buy transaction with auto buy settings
            const result = await this.monorailAPI.buyToken(
                wallet,
                tokenAddress,
                buyAmount,
                autoBuySettings.slippage,
                {
                    gasPrice: autoBuySettings.gas
                }
            );

            if (result.success && result.transactionHash) {
                console.log(`✅ Auto Buy successful: ${result.transactionHash}`);
                
                // Log transaction only if we have a valid transaction hash
                try {
                    await this.database.addTransaction(telegramId, {
                        txHash: result.transactionHash,
                        type: 'auto_buy',
                        tokenAddress: tokenAddress,
                        amount: buyAmount,
                        gasPrice: autoBuySettings.gas,
                        status: 'pending',
                        network: 'monad'
                    });
                } catch (dbError) {
                    console.error('❌ Failed to log transaction:', dbError);
                    // Don't fail the entire operation if logging fails
                }

                return {
                    success: true,
                    transactionHash: result.transactionHash
                };
            } else {
                console.error('❌ Auto Buy failed:', result.error || 'No transaction hash received');
                console.log('🔍 Full result object:', JSON.stringify(result, null, 2));
                return {
                    success: false,
                    error: result.error || 'Transaction failed - no hash received'
                };
            }

        } catch (error) {
            console.error('❌ Auto Buy executeBuy error:', error);
            if (this.monitoring) {
                this.monitoring.logError('Auto buy executeBuy failed', error, { telegramId, tokenAddress, buyAmount });
            }
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute auto buy transaction using separate auto buy settings
     * This is completely independent from regular buy/sell settings
     */
    async executeAutoBuy(telegramId, tokenAddress) {
        try {

            // Get user wallet
            const user = await this.database.getUserByTelegramId(telegramId);
            if (!user) {
                throw new Error('User not found');
            }

            // Get auto buy settings (completely separate from regular settings)
            const autoBuySettings = await this.prioritySystem.getAutoBuySettings(telegramId);
            console.log(`🎯 Auto Buy Settings: Gas=${Math.round(autoBuySettings.gas/1000000000)} Gwei, Slippage=${autoBuySettings.slippage}%, Amount=${autoBuySettings.amount} MON`);

            // Check if auto buy is enabled
            const userSettings = await this.database.getUserSettings(telegramId);
            if (!userSettings?.auto_buy_enabled) {
                console.log('❌ Auto buy is disabled for this user');
                return {
                    success: false,
                    error: 'Auto buy is disabled'
                };
            }

            // Get wallet
            let wallet;
            try {
                wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);
            } catch (walletError) {
                if (walletError.message.includes('Wallet decryption failed')) {
                    return {
                        success: false,
                        error: 'Wallet decryption failed. Please regenerate your wallet.'
                    };
                }
                throw walletError;
            }

            // Check MON balance
            const balanceData = await this.monorailAPI.getMONBalance(wallet.address);
            const monBalance = parseFloat(balanceData.balance || '0');
            
            if (monBalance < autoBuySettings.amount) {
                console.log(`❌ Insufficient MON balance: ${monBalance} < ${autoBuySettings.amount}`);
                return {
                    success: false,
                    error: `Insufficient MON balance. Required: ${autoBuySettings.amount}, Available: ${monBalance.toFixed(4)}`
                };
            }

            // Execute auto buy with dedicated settings
            const swapResult = await this.monorailAPI.buyToken(
                wallet,
                tokenAddress,
                autoBuySettings.amount,
                autoBuySettings.slippage,
                { gasPrice: autoBuySettings.gas } // Use auto buy gas setting
            );

            if (!swapResult.success) {
                throw new Error(`Auto buy swap failed: ${swapResult.error}`);
            }

            // Log successful auto buy
            console.log(`✅ Auto Buy successful: ${autoBuySettings.amount} MON -> Token, TX: ${swapResult.txHash}`);

            // Record transaction
            if (swapResult.txHash) {
                try {
                    await this.database.recordTransaction(
                        telegramId,
                        swapResult.txHash,
                        'auto_buy',
                        tokenAddress,
                        swapResult.tokenSymbol || 'Unknown',
                        autoBuySettings.amount,
                        swapResult.pricePerToken || 0,
                        autoBuySettings.amount,
                        swapResult.gasUsed || 0,
                        swapResult.gasPriceUsed || autoBuySettings.gas
                    );
                } catch (dbError) {
                    console.error('Failed to record auto buy transaction:', dbError);
                }
            }

            return {
                success: true,
                txHash: swapResult.txHash,
                amount: autoBuySettings.amount,
                tokenAddress: tokenAddress,
                gasUsed: swapResult.gasUsed,
                explorerUrl: swapResult.txHash ? `https://testnet.monadexplorer.com/tx/${swapResult.txHash}` : null
            };

        } catch (error) {
            console.error('❌ Auto buy execution failed:', error.message);
            this.monitoring.logError('Auto buy execution failed', error, { telegramId, tokenAddress });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if auto buy should trigger for a token
     */
    async shouldTriggerAutoBuy(telegramId, tokenAddress) {
        try {
            const userSettings = await this.database.getUserSettings(telegramId);
            
            // Check if auto buy is enabled
            if (!userSettings?.auto_buy_enabled) {
                return false;
            }

            // Add any additional trigger conditions here
            // For example: price thresholds, volume conditions, etc.
            
            return true;

        } catch (error) {
            console.error('Error checking auto buy trigger:', error);
            return false;
        }
    }

    /**
     * Get auto buy status for a user
     */
    async getAutoBuyStatus(telegramId) {
        try {
            const userSettings = await this.database.getUserSettings(telegramId);
            const autoBuySettings = await this.prioritySystem.getAutoBuySettings(telegramId);

            return {
                enabled: userSettings?.auto_buy_enabled || false,
                amount: autoBuySettings.amount,
                gas: Math.round(autoBuySettings.gas / 1000000000), // Convert to Gwei
                slippage: autoBuySettings.slippage
            };

        } catch (error) {
            console.error('Error getting auto buy status:', error);
            return {
                enabled: false,
                amount: 0.1,
                gas: 50,
                slippage: 5
            };
        }
    }
}

module.exports = AutoBuyEngine;
