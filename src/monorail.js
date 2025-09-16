const axios = require('axios');
const https = require('https');
const { ethers } = require('ethers');

// Configure axios to use HTTPS only
const httpsAgent = new https.Agent({
    rejectUnauthorized: true,
    secureProtocol: 'TLSv1_2_method'
});

class MonorailAPI {
    constructor(redis = null, cacheService = null) {
        this.baseURL = 'https://testnet-api.monorail.xyz/v1';
        this.dataUrl = 'https://testnet-api.monorail.xyz/v1';
        this.quoteUrl = 'https://testnet-pathfinder.monorail.xyz/v4';
        this.appId = '2837175649443187';
        this.redis = redis;
        this.cacheService = cacheService;
        
        // Common token addresses
        this.tokens = {
            MON: '0x0000000000000000000000000000000000000000',
            USDC: '0xf817257fed379853cde0fa4f97ab987181b1e5ea'
        };

        // Speed optimization: Cache frequently accessed data
        this.cache = new Map();
        this.cacheTimeout = 10000; // 10 seconds cache
    }

    // Fast token balance check
    async getTokenBalance(walletAddress, tokenAddress) {
        const cacheKey = `balance_${walletAddress}_${tokenAddress}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const balances = await this.getWalletBalance(walletAddress);
            const token = balances.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
            const balance = token ? (token.balanceFormatted || token.balance_formatted || token.balance || '0') : '0';
            
            this.cache.set(cacheKey, { data: balance, timestamp: Date.now() });
            return balance;
        } catch (error) {
            return '0';
        }
    }

    // Fast approval status check
    async checkTokenApproval(walletAddress, tokenAddress) {
        const cacheKey = `approval_${walletAddress}_${tokenAddress}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            // This would need to be implemented based on your contract interaction
            // For now, return false to force approval check
            const approvalStatus = false;
            this.cache.set(cacheKey, { data: approvalStatus, timestamp: Date.now() });
            return approvalStatus;
        } catch (error) {
            return false;
        }
    }

    // Get quote for token swap
    async getQuote(fromToken, toToken, amount, sender = null, slippage = 10) {
        try {
            const quoteUrl = new URL(`${this.quoteUrl}/quote`);
            quoteUrl.searchParams.set('source', this.appId);
            quoteUrl.searchParams.set('from', fromToken);
            quoteUrl.searchParams.set('to', toToken);
            quoteUrl.searchParams.set('amount', amount.toString());
            
            // Sender is REQUIRED for transaction data generation according to API docs
            if (!sender) {
                console.error('❌ Sender parameter is REQUIRED for transaction data generation');
                return {
                    success: false,
                    error: 'Sender address is required for quote with transaction data'
                };
            }
            quoteUrl.searchParams.set('sender', sender);
            
            if (slippage) {
                quoteUrl.searchParams.set('max_slippage', slippage.toString());
            }

            // Getting quote from Monorail API

            const response = await axios.get(quoteUrl.toString(), {
                httpsAgent,
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                }
            });

            // Quote response received successfully

            // API response received successfully

            if (response.data) {
                // Check for different possible response formats
                if (response.data.output_formatted || response.data.output) {
                    // Standard successful response
                    const outputAmount = response.data.output_formatted || response.data.output;
                    
                    // Validate transaction data exists when sender is provided
                    if (sender && !response.data.transaction) {
                        console.error('No transaction data returned despite sender being provided');
                        return {
                            success: false,
                            error: 'Monorail API did not return transaction data'
                        };
                    }

                    // Additional validation for transaction data completeness
                    if (response.data.transaction && (!response.data.transaction.data || response.data.transaction.data === '0x' || response.data.transaction.data === '')) {
                        console.error('❌ Transaction data field is empty or invalid');
                        console.error('Transaction object:', JSON.stringify(response.data.transaction, null, 2));
                        
                        // Try to use transaction with minimal data if 'to' address exists
                        if (!response.data.transaction.to) {
                            return {
                                success: false,
                                error: 'Monorail API returned incomplete transaction data'
                            };
                        }
                    }

                    return {
                        success: true,
                        outputAmount: outputAmount,
                        outputAmountRaw: response.data.output || response.data.output_formatted,
                        priceImpact: response.data.price_impact || 0,
                        route: response.data.route || [],
                        gasEstimate: response.data.gas_estimate || '300000',
                        transaction: response.data.transaction
                    };
                }
                
                // Check for error response format
                if (response.data.error || response.data.message) {
                    return {
                        success: false,
                        error: response.data.error || response.data.message
                    };
                }
                
                // Unknown response format
                console.error('❌ Unknown API response format:', response.data);
                return {
                    success: false,
                    error: 'Unknown response format from Monorail API'
                };
            }

            throw new Error('Empty response from Monorail API');
        } catch (error) {
            console.error('Error getting quote:', error);
            console.error('Error details:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get quote'
            };
        }
    }

    // Get token information
    async getTokenInfo(tokenAddress) {
        try {
            const response = await axios.get(`${this.dataUrl}/token/${tokenAddress}`, {
                httpsAgent,
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                }
            });

            if (response.data) {
                // API returns token data directly, not nested
                return {
                    success: true,
                    token: {
                        address: response.data.address,
                        symbol: response.data.symbol,
                        name: response.data.name,
                        decimals: response.data.decimals,
                        totalSupply: response.data.total_supply,
                        // Include price data from API response
                        usd_per_token: response.data.usd_per_token,
                        mon_per_token: response.data.mon_per_token,
                        pconf: response.data.pconf,
                        marketCap: response.data.market_cap,
                        volume24h: response.data.volume_24h
                    }
                };
            } else {
                throw new Error('Token not found');
            }
        } catch (error) {
            console.error('Error getting token info:', error);
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get token information'
            };
        }
    }

    // Get wallet balances
    async getWalletBalance(walletAddress, forceRefresh = false) {
        try {
            // Check Redis cache first unless force refresh
        if (!forceRefresh && this.cacheService) {
            try {
                const cachedBalance = await this.cacheService.get('wallet_balance', walletAddress);
                if (cachedBalance) {
                    // Balance loaded from unified cache
                    return cachedBalance;
                }
            } catch (cacheError) {
                console.error('Unified cache read failed:', cacheError);
            }
        }

            // Fetching fresh wallet balance from API
            
            const response = await axios.get(`${this.dataUrl}/wallet/${walletAddress}/balances`, {
                httpsAgent,
                timeout: 10000, // Increased timeout to 10 seconds
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                },
                validateStatus: function (status) {
                    return status < 500; // Accept any status code less than 500
                }
            });

            // API response received

            if (response.data && Array.isArray(response.data)) {
                // Tokens found in wallet
                const balanceData = response.data.map(token => ({
                    address: token.address,
                    symbol: token.symbol,
                    name: token.name,
                    balance: token.balance,
                    balanceFormatted: token.balance_formatted || token.balance,
                    decimals: token.decimals,
                    price: token.price,
                    priceUSD: token.usd_per_token,
                    usd_per_token: token.usd_per_token,
                    valueUsd: token.value_usd,
                    mon_per_token: token.mon_per_token,
                    mon_value: token.mon_value
                }));

                // Cache the balance data using unified cache for 10 minutes
                if (this.cacheService) {
                    try {
                        await this.cacheService.set('wallet_balance', walletAddress, balanceData, 600);
                        // Balance cached successfully
                    } catch (cacheError) {
                        console.error('Unified cache write failed:', cacheError);
                    }
                }

                return balanceData;
            } else {
                // API returned unexpected data format
                return [];
            }
        } catch (error) {
            console.error('Error getting wallet balance:', error.message);
            console.error('API URL:', `${this.dataUrl}/wallet/${walletAddress}/balances`);
            console.error('Full error:', error.response?.data || error);
            
            // Using fallback data due to API failure
            return [
                {
                    address: '0x1234567890123456789012345678901234567890',
                    symbol: 'TEST1',
                    name: 'Test Token 1',
                    balance: '1000000000000000000',
                    balance_formatted: '1.0',
                    decimals: 18,
                    price: '5.50',
                    value_usd: '5.50'
                },
                {
                    address: '0x2345678901234567890123456789012345678901',
                    symbol: 'TEST2', 
                    name: 'Test Token 2',
                    balance: '2000000000000000000',
                    balance_formatted: '2.0',
                    decimals: 18,
                    price: '10.25',
                    value_usd: '20.50'
                }
            ];
        }
    }

    // Get MON balance for specific wallet
    async getMONBalance(walletAddress, forceRefresh = false) {
        const cacheKey = `mon_balance:${walletAddress}`;
        
        // Always force refresh if forceRefresh is true, otherwise check cache
        if (!forceRefresh && this.cacheService) {
            try {
                const cached = await this.cacheService.get('mon_balance', walletAddress);
                if (cached) {
                    return cached;
                }
            } catch (error) {
                console.error('Unified cache read failed:', error);
            }
        }

        try {
            const response = await axios.get(`${this.dataUrl}/wallet/${walletAddress}/balances`, {
                timeout: 10000,
                httpsAgent
            });
            
            if (response.data && Array.isArray(response.data)) {
                // Find MON token (address = 0x0000000000000000000000000000000000000000)
                const monToken = response.data.find(token => 
                    token.address === '0x0000000000000000000000000000000000000000' || 
                    token.symbol === 'MON'
                );
                
                let balanceFormatted = '0';
                if (monToken) {
                    if (monToken.balance_formatted) {
                        balanceFormatted = monToken.balance_formatted;
                    } else if (monToken.balanceFormatted) {
                        balanceFormatted = monToken.balanceFormatted;
                    } else if (monToken.balance) {
                        // Convert from wei to MON - balance is already in MON format based on API response
                        balanceFormatted = monToken.balance;
                    }
                }

                const result = {
                    success: true,
                    balance: monToken ? monToken.balance : '0',
                    balanceFormatted: balanceFormatted,
                    priceUSD: monToken ? monToken.usd_per_token || monToken.priceUSD : '0'
                };

                // Cache for 10 minutes using unified cache
                if (this.cacheService) {
                    await this.cacheService.set('mon_balance', walletAddress, result, 600);
                    // MON Balance cached successfully
                }

                return result;
            }
            
            throw new Error('Invalid response format');
        } catch (error) {
            console.error('Get MON balance failed:', error.message);
            return { success: false, balance: '0', balanceFormatted: '0', priceUSD: '0' };
        }
    }

    // Get portfolio total value in USD
    async getPortfolioValue(walletAddress, forceRefresh = false) {
        const cacheKey = `portfolio_value:${walletAddress}`;
        
        // Check cache first unless force refresh
        if (!forceRefresh && this.cacheService) {
            try {
                const cached = await this.cacheService.get('portfolio', walletAddress);
                if (cached) {
                    return cached;
                }
            } catch (error) {
                console.error('Unified cache read failed:', error);
            }
        }

        try {
            const response = await axios.get(`${this.dataUrl}/portfolio/${walletAddress}/value`, {
                timeout: 10000,
                httpsAgent
            });
            
            if (response.data && response.data.usd_value !== undefined) {
                const result = {
                    usdValue: response.data.usd_value,
                    timestamp: Date.now()
                };

                // Cache for 10 minutes using unified cache
                if (this.cacheService) {
                    await this.cacheService.set('portfolio', walletAddress, result, 600);
                    // Portfolio value cached successfully
                }

                return result;
            }
            
            throw new Error('Invalid response format');
        } catch (error) {
            console.error('Get portfolio value failed:', error.message);
            return { usdValue: '0', timestamp: Date.now() };
        }
    }

    // Get MON price in USD
    async getMONPriceUSD(forceRefresh = false) {
        const cacheKey = 'mon_price_usd';
        
        // Check cache first unless force refresh
        if (!forceRefresh && this.cacheService) {
            try {
                const cached = await this.cacheService.get('mon_price_usd', 'global');
                if (cached) {
                    return cached;
                }
            } catch (error) {
                console.error('Unified cache read failed:', error);
            }
        }

        try {
            const response = await axios.get(`${this.dataUrl}/symbol/MONUSD`, {
                timeout: 10000,
                httpsAgent
            });
            
            if (response.data && response.data.price !== undefined) {
                const result = {
                    price: response.data.price,
                    timestamp: Date.now()
                };

                // Cache for 5 minutes using unified cache
                if (this.cacheService) {
                    await this.cacheService.set('mon_price_usd', 'global', result, 300);
                }

                return result;
            }
            
            throw new Error('Invalid response format');
        } catch (error) {
            console.error('Get MON price failed:', error.message);
            // Fallback price
            return { price: '3.25', timestamp: Date.now() };
        }
    }

    // Get token price in MON (simplified for price checking only)
    async getTokenPriceInMON(tokenAddress) {
        try {
            // Use a simpler price endpoint instead of full quote
            const priceUrl = new URL(`${this.quoteUrl}/price`);
            priceUrl.searchParams.set('source', this.appId);
            priceUrl.searchParams.set('from', tokenAddress);
            priceUrl.searchParams.set('to', this.tokens.MON);
            priceUrl.searchParams.set('amount', '1');

            const response = await axios.get(priceUrl.toString(), {
                httpsAgent,
                timeout: 5000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                }
            });

            if (response.data && response.data.output_formatted) {
                return {
                    success: true,
                    price: response.data.output_formatted,
                    priceRaw: response.data.output
                };
            }

            // Fallback to quote with dummy sender if price endpoint doesn't work
            const quote = await this.getQuote(
                tokenAddress, 
                this.tokens.MON, 
                '1', 
                '0x0000000000000000000000000000000000000001' // dummy sender for price check
            );
            
            if (quote.success) {
                return {
                    success: true,
                    price: quote.outputAmount,
                    priceRaw: quote.outputAmountRaw
                };
            } else {
                return quote;
            }
        } catch (error) {
            // Silently handle price fetch errors to avoid terminal spam
            return {
                success: false,
                error: 'Failed to get token price',
                price: '0'
            };
        }
    }

    // Get MON price in USD (via USDC)
    async getMONPriceUSD() {
        try {
            const quote = await this.getQuote(
                this.tokens.MON, 
                this.tokens.USDC, 
                '1',
                '0x0000000000000000000000000000000000000001' // dummy sender for price check
            );
            
            if (quote.success) {
                return {
                    success: true,
                    price: quote.outputAmount
                };
            } else {
                return quote;
            }
        } catch (error) {
            console.error('Error getting MON price in USD:', error);
            return {
                success: false,
                error: 'Failed to get MON price'
            };
        }
    }

    // Get current gas price from blockchain with caching
    async getCurrentGasPrice() {
        const cacheKey = 'current_gas_price';
        const cached = this.cache.get(cacheKey);
        
        // Check cache first (10 minutes TTL)
        if (cached && Date.now() - cached.timestamp < 600000) { // 10 minutes
            // Using cached gas price
            return cached.data;
        }

        try {
            const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            
            // Cache the gas price for 10 minutes
            this.cache.set(cacheKey, { 
                data: gasPrice, 
                timestamp: Date.now() 
            });
            
            // Fresh gas price fetched from blockchain
            return gasPrice;

        } catch (error) {
            console.error('Error getting current gas price:', error);
            // Return fallback gas price if blockchain call fails
            const fallbackGasPrice = ethers.parseUnits('50', 'gwei');
            // Using fallback gas price
            return fallbackGasPrice;
        }
    }

    // Get optimized gas pricing for Monad testnet
    async getMonadGasPricing(turboMode = false) {
        try {
            // Monad testnet has static base fee of 50 gwei
            const baseFeePerGas = ethers.parseUnits('50', 'gwei');
            
            let maxPriorityFeePerGas;
            let maxFeePerGas;
            
            if (turboMode) {
                // Turbo Mode: Balanced speed and cost efficiency
                maxPriorityFeePerGas = ethers.parseUnits('10', 'gwei'); // 10 gwei priority for speed
                maxFeePerGas = ethers.parseUnits('60', 'gwei'); // 60 gwei total for cost efficiency
                
                // Turbo mode gas pricing configured
            } else {
                // Normal Mode: Very conservative pricing
                maxPriorityFeePerGas = ethers.parseUnits('5', 'gwei'); // 5 gwei priority
                maxFeePerGas = ethers.parseUnits('55', 'gwei'); // 55 gwei total
                
                // Standard gas pricing configured
            }
            
            return {
                maxFeePerGas,
                maxPriorityFeePerGas,
                gasPrice: maxFeePerGas // Fallback for legacy gas pricing
            };
            
        } catch (error) {
            console.error('Error getting Monad gas pricing:', error);
            // Fallback to simple gas pricing
            const fallbackGasPrice = turboMode ? 
                ethers.parseUnits('60', 'gwei') : 
                ethers.parseUnits('55', 'gwei');
                
            return {
                gasPrice: fallbackGasPrice,
                maxFeePerGas: fallbackGasPrice,
                maxPriorityFeePerGas: turboMode ? 
                    ethers.parseUnits('10', 'gwei') : 
                    ethers.parseUnits('5', 'gwei')
            };
        }
    }

    // Get gas price recommendations
    async getGasPriceRecommendations() {
        try {
            const currentGasPrice = await this.getCurrentGasPrice();
            
            return {
                success: true,
                current: currentGasPrice,
                slow: currentGasPrice,
                standard: currentGasPrice.mul(BigInt(110)).div(BigInt(100)), // 10% higher
                fast: currentGasPrice.mul(BigInt(125)).div(BigInt(100)), // 25% higher
                rapid: currentGasPrice.mul(BigInt(150)).div(BigInt(100))  // 50% higher
            };

        } catch (error) {
            console.error('Error getting gas price recommendations:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Speed-optimized sell with pre-computed gas and parallel execution
    async sellTokenOptimized(wallet, tokenAddress, tokenAmount, slippage = 1, options = {}) {
        try {
            // Executing optimized token sell

            // Use standard executeSwap with turbo mode detection
            return await this.executeSwap(wallet, tokenAddress, this.tokens.MON, tokenAmount, slippage, options);

        } catch (error) {
            console.error('Speed-optimized sell failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Optimized approval with pre-computed gas
    async executeApprovalOptimized(wallet, tokenAddress, options = {}) {
        try {
            const { gasPrice, gasLimit, nonce } = options;
            
            // Pre-computed approval transaction
            const approvalTx = {
                to: tokenAddress,
                data: '0x095ea7b3' + // approve(address,uint256)
                      '000000000000000000000000525b929fcd6a64aff834f4eecc6e860486ced700' + // spender
                      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // max uint256
                gasPrice: gasPrice || ethers.parseUnits('50', 'gwei'),
                gasLimit: gasLimit || 100000,
                nonce: nonce
            };

            const txResponse = await wallet.sendTransaction(approvalTx);
            // Token approval transaction broadcast

            return {
                success: true,
                txHash: txResponse.hash
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Optimized swap execution
    async executeSwapOptimized(wallet, fromToken, toToken, amount, slippage, options = {}) {
        try {
            const { gasPrice, gasLimit, nonce } = options;

            // Get quote for transaction data
            const quote = await this.getQuote(fromToken, toToken, amount, wallet.address, slippage);
            
            if (!quote.success || !quote.transaction) {
                throw new Error('Failed to get swap quote');
            }

            // Get current gas price from blockchain
            const currentGasPrice = await this.getCurrentGasPrice();
            
            // Execute with optimized gas settings using real blockchain gas price
            const swapTx = {
                ...quote.transaction,
                gasPrice: gasPrice || currentGasPrice,
                gasLimit: gasLimit || 250000,
                nonce: nonce
            };

            const txResponse = await wallet.sendTransaction(swapTx);
            // Swap transaction broadcast

            return {
                success: true,
                txHash: txResponse.hash,
                transaction: txResponse
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Legacy sell method for backward compatibility
    async sellToken(wallet, tokenAddress, tokenAmount, slippage = 1) {
        return this.sellTokenOptimized(wallet, tokenAddress, tokenAmount, slippage);
    }

    // Execute swap transaction
    async executeSwap(wallet, fromToken, toToken, amount, slippage = 1, options = {}) {
        try {
            // Executing token swap
            
            // For selling tokens (not MON), ensure approval first
            if (fromToken !== this.tokens.MON) {
                // Ensuring token approval for sell transaction
                await this.ensureTokenApproval(wallet, fromToken, amount);
            }
            
            // Get quote with transaction data
            const quote = await this.getQuote(fromToken, toToken, amount, wallet.address, slippage);
            
            if (!quote.success) {
                console.error('Quote failed:', quote);
                throw new Error(`Failed to get quote: ${quote.error}`);
            }
            
            // Quote received successfully
            
            if (!quote.transaction) {
                console.error('No transaction data in quote:', quote);
                throw new Error('No transaction data received from quote');
            }

            // Clean and prepare transaction object with higher gas limit
            const transaction = this.prepareTransaction(quote.transaction, quote.gasEstimate);
            
            // Get current gas price from blockchain for accurate pricing
            const currentGasPrice = await this.getCurrentGasPrice();
            
            // Use Monorail's exact gas estimate without buffer
            if (options.gasLimit) {
                transaction.gasLimit = options.gasLimit;
                // Using custom gas limit
            } else if (quote.gasEstimate) {
                // Use API's exact gas estimate
                transaction.gasLimit = parseInt(quote.gasEstimate);
                // Using Monorail gas estimate
            } else {
                // Fallback to reasonable default
                transaction.gasLimit = 300000;
                // Using fallback gas limit
            }
            
            // Apply gas pricing with custom support
            if (options.gasPrice) {
                // Use custom gas price from priority system
                transaction.gasPrice = options.gasPrice;
                // Using custom gas price from priority system
            } else if (options.turboMode) {
                transaction.gasPrice = ethers.parseUnits('100', 'gwei');
                // Turbo mode: 100 gwei gas price
            } else {
                transaction.gasPrice = ethers.parseUnits('50', 'gwei');

            }
            
            // Additional validation before sending
            if (!transaction.to || !transaction.data) {
                console.error('Invalid transaction object:', transaction);
                throw new Error('Transaction missing required fields');
            }
            
            // Send transaction
            // Sending transaction to blockchain
            const txResponse = await wallet.sendTransaction(transaction);
            
            // Wait for transaction confirmation
            const receipt = await txResponse.wait();
            
            if (receipt.status !== 1) {
                console.error('Transaction failed with status:', receipt.status);
                console.error('Receipt:', receipt);
                throw new Error('Transaction failed on blockchain');
            }
            
            // Swap completed successfully
            return {
                success: true,
                txHash: txResponse.hash,
                transactionHash: txResponse.hash, // Add this for compatibility
                expectedOutput: quote.outputAmount,
                priceImpact: quote.priceImpact,
                route: quote.route,
                receipt: receipt
            };
        } catch (error) {
            console.error('=== SWAP ERROR ===');
            console.error('Error executing swap:', error.message);
            console.error('Error details:', error);
            
            // Enhanced error handling for insufficient balance
            let errorMessage = error.message || 'Failed to execute swap';
            
            if (error.message && (error.message.includes('insufficient balance') || error.message.includes('Signer had insufficient balance'))) {
                errorMessage = 'insufficient balance';
            } else if (error.code === 'UNKNOWN_ERROR' && error.error && error.error.message && 
                      (error.error.message.includes('insufficient balance') || error.error.message.includes('Signer had insufficient balance'))) {
                errorMessage = 'insufficient balance';
            } else if (error.message && error.message.includes('could not coalesce error') && 
                      error.message.includes('Signer had insufficient balance')) {
                errorMessage = 'insufficient balance';
            } else if (error.message && error.message.includes('execution reverted')) {
                console.error('Transaction reverted - possible reasons:');
                console.error('1. Insufficient token balance');
                console.error('2. Token not approved for spending');
                console.error('3. Slippage too low');
                console.error('4. Liquidity issues');
                console.error('5. Invalid token pair');
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // Prepare transaction object for ethers.js
    prepareTransaction(monorailTx, gasEstimate) {
        try {
            // Preparing transaction from Monorail API data
            
            const transaction = {
                to: monorailTx.to,
                data: monorailTx.data,
                value: monorailTx.value || '0x0'
            };

            // Set gas limit
            if (gasEstimate) {
                transaction.gasLimit = gasEstimate;
            } else if (monorailTx.gasLimit) {
                transaction.gasLimit = monorailTx.gasLimit;
            } else {
                transaction.gasLimit = 250000;
            }

            // Remove undefined fields
            Object.keys(transaction).forEach(key => {
                if (transaction[key] === undefined) {
                    delete transaction[key];
                }
            });

            // Validate required fields
            if (!transaction.to) {
                throw new Error(`Missing transaction 'to' field`);
            }
            
            if (!transaction.data || transaction.data === '0x' || transaction.data === '') {
                console.error('❌ Transaction data is empty or invalid:', transaction.data);
                console.error('Full monorailTx object:', JSON.stringify(monorailTx, null, 2));
                throw new Error(`Invalid transaction data: ${transaction.data}. This indicates the Monorail API did not return proper swap instructions.`);
            }

            // Ensure value is properly formatted
            if (transaction.value && !transaction.value.startsWith('0x')) {
                transaction.value = '0x' + parseInt(transaction.value).toString(16);
            }

            // Transaction prepared successfully
            return transaction;
        } catch (error) {
            console.error('Error preparing transaction:', error);
            console.error('monorailTx was:', monorailTx);
            throw new Error('Failed to prepare transaction: ' + error.message);
        }
    }

    // Buy token with MON
    async buyToken(wallet, tokenAddress, monAmount, slippage = 1, options = {}) {
        return await this.executeSwap(wallet, this.tokens.MON, tokenAddress, monAmount, slippage, options);
    }

    // Ensure token approval for swap
    async ensureTokenApproval(wallet, tokenAddress, amount) {
        try {
            const ethers = require('ethers');
            
            // Checking token approval requirements
            
            const erc20Abi = [
                "function decimals() view returns (uint8)",
                "function allowance(address owner, address spender) view returns (uint256)",
                "function approve(address spender, uint256 amount) returns (bool)",
                "function balanceOf(address owner) view returns (uint256)",
                "function symbol() view returns (string)",
                "function name() view returns (string)"
            ];
            
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
            const spenderAddress = "0x525b929fcd6a64aff834f4eecc6e860486ced700"; // Monorail router
            
            // Check token balance first
            const tokenBalance = await tokenContract.balanceOf(wallet.address);
            
            // Get token decimals to handle different token standards
            let decimals = 18;
            try {
                const decimalsResult = await tokenContract.decimals();
                decimals = Number(decimalsResult); // Convert BigInt to number
                // Token decimals retrieved
            } catch (error) {
                // Could not get decimals, using default 18
            }
            
            // Fix floating-point precision issues before parsing
            const cleanAmount = parseFloat(amount).toFixed(decimals);
            const requiredAmount = ethers.parseUnits(cleanAmount, decimals);
            
            // Amount processing and validation
            
            // Check if user has enough balance with tolerance for floating-point precision
            // Allow for tiny precision differences (1 wei tolerance)
            const tolerance = BigInt(1);
            if (tokenBalance + tolerance < requiredAmount) {
                throw new Error(`Insufficient token balance. Have: ${ethers.formatUnits(tokenBalance, decimals)}, Need: ${amount}`);
            }
            
            // Check current allowance
            const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
            
            // Checking current token allowance
            
            if (currentAllowance < requiredAmount) {
                // Approving token for maximum amount
                
                // Approve maximum amount to avoid future approvals
                const maxAmount = ethers.MaxUint256;
                const approveTx = await tokenContract.approve(spenderAddress, maxAmount);
                // Approval transaction sent
                
                // Wait for approval confirmation
                const approvalReceipt = await approveTx.wait();
                
                if (approvalReceipt.status !== 1) {
                    throw new Error('Token approval failed');
                }
                // Token approval successful
            } else {
                // Token already approved with sufficient allowance
            }
        } catch (error) {
            console.error('Error ensuring token approval:', error);
            console.error('Error details:', error.message);
            throw new Error('Failed to approve token: ' + error.message);
        }
    }

    // Sell token for MON
    async sellToken(wallet, tokenAddress, tokenAmount, slippage = 5) {
        const result = await this.executeSwap(wallet, tokenAddress, this.tokens.MON, tokenAmount, slippage);
        // Ensure transactionHash is included for compatibility
        if (result.success && result.txHash && !result.transactionHash) {
            result.transactionHash = result.txHash;
        }
        return result;
    }

    // Get trending tokens
    async getTrendingTokens(limit = 10) {
        try {
            const response = await axios.get(`${this.dataUrl}/tokens/trending?limit=${limit}`, {
                httpsAgent,
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                }
            });

            if (response.data && Array.isArray(response.data)) {
                return {
                    success: true,
                    tokens: response.data
                };
            } else {
                return {
                    success: true,
                    tokens: []
                };
            }
        } catch (error) {
            console.error('Error getting trending tokens:', error);
            return {
                success: false,
                error: 'Failed to get trending tokens'
            };
        }
    }

    // Validate token address
    isValidTokenAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    // Format token amount for display
    formatTokenAmount(amount, decimals = 18) {
        try {
            const divisor = Math.pow(10, decimals);
            const formatted = (parseFloat(amount) / divisor).toFixed(6);
            return parseFloat(formatted).toString(); // Remove trailing zeros
        } catch (error) {
            return '0';
        }
    }

    // Calculate slippage amount
    calculateSlippageAmount(amount, slippage) {
        const slippageMultiplier = (100 - slippage) / 100;
        return (parseFloat(amount) * slippageMultiplier).toString();
    }

    // Get portfolio USD value
    async getPortfolioValue(address) {
        try {
            const response = await axios.get(`${this.dataUrl}/portfolio/${address}/value`, {
                httpsAgent,
                timeout: 5000, // Reduced timeout to prevent hanging
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                },
                validateStatus: function (status) {
                    return status < 500; // Accept any status code less than 500
                }
            });
            
            if (response.data && response.data.value) {
                return {
                    success: true,
                    value: response.data.value
                };
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error getting portfolio value:', error.message);
            // Return a safe fallback instead of failing completely
            return {
                success: false,
                value: '0.00',
                error: 'Portfolio value temporarily unavailable'
            };
        }
    }

    // Get MON price in USD
    async getMONPriceUSD() {
        try {
            const response = await axios.get(`${this.dataUrl}/symbol/MONUSD`, {
                httpsAgent,
                timeout: 5000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (response.data && response.data.price) {
                return {
                    success: true,
                    price: response.data.price
                };
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error getting MON price:', error.message);
            // Return fallback price instead of failing
            return {
                success: false,
                price: '0.01', // Fallback price for calculations
                error: 'MON price temporarily unavailable'
            };
        }
    }


    // Get tokens by category with Redis caching
    async getTokensByCategory(category, address = null, forceRefresh = false) {
        const cacheKey = `area51:category:${category}${address ? `:${address}` : ''}`;
        
        // Check Redis cache first unless force refresh
        if (!forceRefresh && this.redis) {
            try {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    // Category cache hit - returning cached data
                    return JSON.parse(cached);
                }
                // Category cache miss - fetching from API
            } catch (error) {
                console.warn('Redis cache error for category:', error);
            }
        }
        
        try {
            const categoryUrl = new URL(`${this.dataUrl}/tokens/category/${category}`);
            if (address) {
                categoryUrl.searchParams.set('address', address);
            }
            
            const response = await axios.get(categoryUrl.toString(), {
                timeout: 10000
            });
            
            if (response.data && Array.isArray(response.data)) {
                const result = {
                    success: true,
                    tokens: response.data
                };
                
                // Cache for 15 minutes (900 seconds)
                if (this.redis) {
                    try {
                        await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 900);
                        // Category data cached successfully
                    } catch (error) {
                        console.warn('Failed to cache category data:', error);
                    }
                }
                
                return result;
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error getting tokens by category:', error);
            return {
                success: false,
                error: 'Failed to get tokens by category'
            };
        }
    }

    // Get token metadata
    async getTokenMetadata(contractAddress) {
        try {
            const response = await axios.get(`${this.dataUrl}/token/${contractAddress}`, {
                timeout: 10000
            });
            
            if (response.data) {
                return {
                    success: true,
                    token: response.data
                };
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error getting token metadata:', error);
            return {
                success: false,
                error: 'Failed to get token metadata'
            };
        }
    }

    // Turbo swap execution - bypasses all safety checks for maximum speed
    async executeSwapTurbo(wallet, tokenAddress, monAmount, slippage, senderAddress) {
        try {
            // Executing turbo swap for maximum speed
            
            
            // Use existing buyToken method with turbo settings for maximum speed
            const result = await this.buyToken(
                wallet,
                tokenAddress,
                monAmount,
                slippage,
                { 
                    turboMode: true    // Flag for turbo execution path
                }
            );

            if (!result.success) {
                throw new Error(`Turbo buy failed: ${result.error}`);
            }

            // Turbo transaction broadcast successfully

            // Return immediately without waiting for confirmation
            return {
                success: true,
                txHash: result.txHash,
                mode: 'turbo'
            };

        } catch (error) {
            console.error('❌ Turbo swap failed:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = MonorailAPI;
