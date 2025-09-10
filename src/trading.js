const { ethers } = require('ethers');

class TradingEngine {
    constructor(monorailAPI, walletManager, database) {
        this.monorailAPI = monorailAPI;
        this.walletManager = walletManager;
        this.db = database;
    }

    // Execute buy order
    async executeBuy(telegramId, tokenAddress, monAmount, slippage = 1) {
        try {
            // Validate inputs
            if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
                throw new Error('Invalid token address');
            }

            if (parseFloat(monAmount) <= 0) {
                throw new Error('Amount must be greater than 0');
            }

            // Get user wallet
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                throw new Error('User not found');
            }

            const wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);

            // Check MON balance with buffer for gas fees
            const monBalance = await this.walletManager.getBalance(wallet.address);
            const requiredAmount = parseFloat(monAmount);
            const gasBuffer = 0.05; // Reserve 0.05 MON for gas fees
            const availableForSwap = parseFloat(monBalance) - gasBuffer;
            
            console.log(`Balance check: Available: ${monBalance} MON, Required: ${requiredAmount} MON, Gas buffer: ${gasBuffer} MON`);
            
            if (availableForSwap < requiredAmount) {
                throw new Error(`Insufficient MON balance. Available for swap: ${availableForSwap.toFixed(4)} MON (${monBalance} total - ${gasBuffer} gas buffer), Required: ${requiredAmount} MON`);
            }
            
            if (parseFloat(monBalance) < 0.01) {
                throw new Error(`MON balance too low for any transactions. Current balance: ${monBalance} MON. Need at least 0.01 MON for gas fees.`);
            }

            // Get token information
            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            if (!tokenInfo.success) {
                throw new Error('Token not found or invalid');
            }

            // Get quote
            const quote = await this.monorailAPI.getQuote(
                this.monorailAPI.tokens.MON,
                tokenAddress,
                monAmount,
                wallet.address
            );

            if (!quote.success) {
                throw new Error(`Failed to get quote: ${quote.error}`);
            }

            // Check if token approval is needed (for safety)
            try {
                const approvalStatus = await this.monorailAPI.checkTokenApproval(wallet.address, tokenAddress);
                console.log('Token approval status:', approvalStatus);
            } catch (approvalError) {
                console.log('Could not check approval status:', approvalError.message);
            }

            // Try with higher slippage first to avoid liquidity issues
            let finalSlippage = Math.max(slippage, 5); // Minimum 5% slippage
            console.log(`Using slippage: ${finalSlippage}% (requested: ${slippage}%)`);
            
            // Execute swap with higher gas limit and increased slippage
            const swapResult = await this.monorailAPI.buyToken(
                wallet,
                tokenAddress,
                monAmount,
                finalSlippage,
                { gasLimit: 800000 } // Further increased gas limit
            );

            if (!swapResult.success) {
                // Enhanced error handling for common swap failures
                let errorMessage = swapResult.error || 'Unknown swap error';
                
                if (errorMessage.includes('transaction execution reverted')) {
                    // Check if this is a specific token liquidity issue
                    const tokenSymbol = tokenInfo.token?.symbol || 'Unknown';
                    errorMessage = `❌ Swap failed for ${tokenSymbol}

🔍 **Likely causes:**
• Token has insufficient liquidity on Monad DEX
• Token contract may have trading restrictions
• Price impact too high (>50%)

💡 **Try these solutions:**
1. Use a smaller amount (try 0.01 MON first)
2. Choose a different token with higher liquidity
3. Wait for better market conditions

Current balance: ${monBalance} MON`;
                } else if (errorMessage.includes('insufficient funds')) {
                    errorMessage = `Insufficient MON balance. You need more MON to complete this transaction.`;
                } else if (errorMessage.includes('slippage')) {
                    errorMessage = `Price moved too much during transaction. Try again or increase slippage tolerance.`;
                }
                
                throw new Error(errorMessage);
            }

            return {
                success: true,
                txHash: swapResult.txHash,
                tokenSymbol: tokenInfo.token.symbol,
                tokenAddress: tokenAddress,
                monAmount: monAmount,
                expectedTokenAmount: quote.outputAmount,
                priceImpact: quote.priceImpact,
                pricePerToken: (parseFloat(monAmount) / parseFloat(quote.outputAmount)).toFixed(8),
                gasUsed: swapResult.receipt ? swapResult.receipt.gasUsed.toString() : null,
                effectiveGasPrice: swapResult.receipt && swapResult.receipt.effectiveGasPrice ? 
                    swapResult.receipt.effectiveGasPrice.toString() : null,
                transactionFee: swapResult.receipt && swapResult.receipt.gasUsed && swapResult.receipt.effectiveGasPrice ? 
                    (parseFloat(ethers.formatEther(swapResult.receipt.gasUsed * swapResult.receipt.effectiveGasPrice))).toFixed(6) : null
            };

        } catch (error) {
            console.error('Error executing buy:', error);
            
            // Enhanced error handling for insufficient balance
            let errorMessage = error.message;
            if (error.message && (error.message.includes('insufficient balance') || error.message.includes('Signer had insufficient balance'))) {
                errorMessage = 'insufficient balance';
            } else if (error.code === 'UNKNOWN_ERROR' && error.error && error.error.message && 
                      (error.error.message.includes('insufficient balance') || error.error.message.includes('Signer had insufficient balance'))) {
                errorMessage = 'insufficient balance';
            } else if (error.message && error.message.includes('could not coalesce error') && 
                      error.message.includes('Signer had insufficient balance')) {
                errorMessage = 'insufficient balance';
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // Execute sell order
    async executeSell(telegramId, tokenAddress, tokenAmount, slippage = 1) {
        try {
            console.log(`Executing sell: ${tokenAddress} -> MON, amount: ${tokenAmount}, slippage: ${slippage}%`);

            // Fast pre-flight validation (prevents gas loss)
            const { wallet, approvalStatus } = await this.fastPreflightCheck(telegramId, tokenAddress, tokenAmount);
            
            // Optimized gas strategy for cost efficiency
            const gasPrice = ethers.parseUnits('50', 'gwei'); // 50 gwei for network inclusion
            const gasLimit = 300000; // Optimized gas limit for aggregator
            
            // Execute with optimized transaction sequencing
            const swapResult = await this.monorailAPI.sellTokenOptimized(
                wallet, 
                tokenAddress, 
                tokenAmount, 
                slippage,
                { gasPrice, gasLimit, approvalStatus }
            );
            
            if (!swapResult.success) {
                throw new Error(`Swap failed: ${swapResult.error}`);
            }


            return {
                success: true,
                txHash: swapResult.txHash,
                tokenAddress: tokenAddress,
                tokenAmount: tokenAmount,
                gasUsed: swapResult.receipt ? swapResult.receipt.gasUsed.toString() : null,
                effectiveGasPrice: swapResult.receipt ? swapResult.receipt.effectiveGasPrice.toString() : null,
                transactionFee: swapResult.receipt ? 
                    (parseFloat(ethers.formatEther(swapResult.receipt.gasUsed * swapResult.receipt.effectiveGasPrice))).toFixed(6) : null
            };

        } catch (error) {
            console.error('Error executing sell:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get buy quote
    async getBuyQuote(telegramId, tokenAddress, monAmount) {
        try {
            console.log('getBuyQuote called with:', { tokenAddress, monAmount });
            
            if (!tokenAddress || tokenAddress === 'undefined') {
                return {
                    success: false,
                    error: 'Invalid token address provided'
                };
            }
            
            // Get user wallet for sender parameter
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);

            // Include sender parameter for proper transaction building
            const quote = await this.monorailAPI.getQuote(
                this.monorailAPI.tokens.MON,
                tokenAddress,
                monAmount,
                wallet.address
            );

            if (!quote.success) {
                return quote;
            }

            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            
            return {
                success: true,
                inputAmount: monAmount,
                inputSymbol: 'MON',
                outputAmount: quote.outputAmount,
                outputSymbol: tokenInfo.success ? tokenInfo.token.symbol : 'Unknown',
                priceImpact: quote.priceImpact,
                pricePerToken: (parseFloat(monAmount) / parseFloat(quote.outputAmount)).toFixed(8),
                gasEstimate: quote.gasEstimate
            };

        } catch (error) {
            console.error('Error getting buy quote:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fast pre-flight validation (< 50ms target)
    async fastPreflightCheck(telegramId, tokenAddress, tokenAmount) {
        const amount = parseFloat(tokenAmount);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Invalid sell amount');
        }

        const user = await this.db.getUserByTelegramId(telegramId);
        if (!user) {
            throw new Error('User not found');
        }

        const wallet = await this.walletManager.getWalletWithProvider(user.encrypted_private_key);
        
        // Parallel validation calls for speed
        const [tokenBalance, gasBalance, approvalStatus] = await Promise.all([
            this.monorailAPI.getTokenBalance(wallet.address, tokenAddress),
            wallet.provider.getBalance(wallet.address),
            this.monorailAPI.checkTokenApproval(wallet.address, tokenAddress)
        ]);

        // Fast-fail validation
        if (parseFloat(tokenBalance) < amount) {
            throw new Error(`Insufficient token balance. Have: ${tokenBalance}, Need: ${amount}`);
        }

        const gasRequired = ethers.parseEther('0.01'); // Estimated gas needed
        if (gasBalance < gasRequired) {
            throw new Error('Insufficient MON for gas fees');
        }

        return { wallet, tokenBalance, gasBalance, approvalStatus };
    }

    // Get sell quote for display purposes
    async getSellQuote(telegramId, tokenAddress, tokenAmount) {
        try {
            console.log(`Getting sell quote: ${tokenAddress} -> ${this.monorailAPI.tokens.MON}, amount: ${tokenAmount}`);

            // Fast pre-flight check first
            const { wallet } = await this.fastPreflightCheck(telegramId, tokenAddress, tokenAmount);

            // Get quote with sender parameter for proper transaction building
            const quote = await this.monorailAPI.getQuote(
                tokenAddress,
                this.monorailAPI.tokens.MON,
                tokenAmount.toString(),
                wallet.address
            );

            if (!quote.success) {
                return quote;
            }

            const tokenInfo = await this.monorailAPI.getTokenInfo(tokenAddress);
            
            const outputAmount = parseFloat(quote.outputAmount);
            const inputAmount = parseFloat(tokenAmount);
            
            return {
                success: true,
                inputAmount: tokenAmount,
                inputSymbol: tokenInfo.success ? tokenInfo.token.symbol : 'Unknown',
                outputAmount: quote.outputAmount,
                outputSymbol: 'MON',
                priceImpact: quote.priceImpact,
                pricePerToken: inputAmount > 0 ? (outputAmount / inputAmount).toFixed(8) : '0',
                gasEstimate: quote.gasEstimate
            };

        } catch (error) {
            console.error('Error getting sell quote:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Calculate percentage of token balance to sell
    async calculateSellAmount(telegramId, tokenAddress, percentage) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                throw new Error('User not found');
            }

            const balances = await this.monorailAPI.getWalletBalance(user.wallet_address);
            const tokenBalance = balances.find(token => 
                token.address.toLowerCase() === tokenAddress.toLowerCase()
            );

            if (!tokenBalance) {
                throw new Error('Token not found in wallet');
            }

            const balance = parseFloat(tokenBalance.balanceFormatted || tokenBalance.balance_formatted || tokenBalance.balance || '0');
            
            if (balance === 0 || isNaN(balance)) {
                throw new Error('Invalid token balance');
            }
            
            const sellAmount = (balance * percentage / 100).toFixed(6);
            
            return {
                success: true,
                sellAmount: sellAmount,
                totalBalance: tokenBalance.balanceFormatted || tokenBalance.balance_formatted || tokenBalance.balance,
                percentage: percentage
            };

        } catch (error) {
            console.error('Error calculating sell amount:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Monitor transaction status
    async monitorTransaction(txHash, maxWaitTime = 300000) { // 5 minutes max
        try {
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime) {
                const receipt = await this.walletManager.getTransactionReceipt(txHash);
                
                if (receipt) {
                    return {
                        success: true,
                        status: receipt.status === 1 ? 'confirmed' : 'failed',
                        blockNumber: receipt.blockNumber,
                        gasUsed: receipt.gasUsed.toString(),
                        effectiveGasPrice: receipt.effectiveGasPrice?.toString()
                    };
                }
                
                // Wait 5 seconds before checking again
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            return {
                success: false,
                error: 'Transaction confirmation timeout'
            };

        } catch (error) {
            console.error('Error monitoring transaction:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Validate trading parameters
    validateTradingParams(amount, slippage) {
        const errors = [];

        if (!amount || parseFloat(amount) <= 0) {
            errors.push('Amount must be greater than 0');
        }

        if (slippage < 0.1 || slippage > 50) {
            errors.push('Slippage must be between 0.1% and 50%');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Get gas price recommendations
    async getGasPriceRecommendations() {
        try {
            const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
            const gasPrice = await provider.getGasPrice();
            
            return {
                success: true,
                slow: gasPrice,
                standard: gasPrice * BigInt(110) / BigInt(100), // 10% higher
                fast: gasPrice * BigInt(125) / BigInt(100), // 25% higher
                rapid: gasPrice * BigInt(150) / BigInt(100)  // 50% higher
            };

        } catch (error) {
            console.error('Error getting gas price recommendations:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = TradingEngine;
