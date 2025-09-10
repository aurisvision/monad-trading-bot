const axios = require('axios');
const https = require('https');
const { ethers } = require('ethers');

// Configure axios to use HTTPS only
const httpsAgent = new https.Agent({
    rejectUnauthorized: true,
    secureProtocol: 'TLSv1_2_method'
});

class MonorailAPI {
    constructor(redis = null) {
        this.baseURL = 'https://testnet-api.monorail.xyz/v1';
        this.dataUrl = 'https://testnet-api.monorail.xyz/v1';
        this.quoteURL = 'https://testnet-pathfinder.monorail.xyz/v4';
        this.appId = '2837175649443187';
        this.redis = redis;
        
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

            // Log for debugging sell quotes
            console.log('📡 Quote URL:', quoteUrl.toString());
            console.log('🔑 Using App ID:', this.appId);

            const response = await axios.get(quoteUrl.toString(), {
                httpsAgent,
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0'
                }
            });

            console.log('✅ Quote response status:', response.status);
            
            // Debug transaction data specifically
            if (response.data && response.data.transaction) {
                console.log('✅ Transaction data received:');
                console.log('- to:', response.data.transaction.to);
                console.log('- data exists:', !!response.data.transaction.data);
                console.log('- data length:', response.data.transaction.data ? response.data.transaction.data.length : 0);
                console.log('- value:', response.data.transaction.value);
                
                if (!response.data.transaction.data || response.data.transaction.data === '0x') {
                    console.error('❌ Transaction data is empty!');
                    console.log('Full response:', JSON.stringify(response.data, null, 2));
                }
            } else {
                console.error('❌ No transaction data in response');
                console.log('Full response:', JSON.stringify(response.data, null, 2));
            }

            if (response.data && response.data.output_formatted) {
                // Validate transaction data exists when sender is provided
                if (sender && !response.data.transaction) {
                    console.error('No transaction data returned despite sender being provided');
                    console.error('Full API response:', JSON.stringify(response.data, null, 2));
                    return {
                        success: false,
                        error: 'Monorail API did not return transaction data'
                    };
                }

                // Additional validation for transaction data completeness
                if (response.data.transaction && (!response.data.transaction.data || response.data.transaction.data === '0x' || response.data.transaction.data === '')) {
                    console.error('❌ Transaction data field is empty or invalid');
                    console.error('Transaction object:', JSON.stringify(response.data.transaction, null, 2));
                    
                    // Try to construct a basic swap transaction if we have the necessary info
                    if (response.data.transaction.to) {
                        console.log('⚠️ Attempting to use transaction without data field - this may fail');
                    } else {
                        return {
                            success: false,
                            error: 'Monorail API returned incomplete transaction data'
                        };
                    }
                }

                return {
                    success: true,
                    outputAmount: response.data.output_formatted,
                    outputAmountRaw: response.data.output,
                    priceImpact: response.data.price_impact,
                    route: response.data.route,
                    gasEstimate: response.data.gas_estimate,
                    transaction: response.data.transaction
                };
            }

            throw new Error('Invalid response format from Monorail API');
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
                return {
                    success: true,
                    token: {
                        address: response.data.address,
                        symbol: response.data.symbol,
                        name: response.data.name,
                        decimals: response.data.decimals,
                        totalSupply: response.data.total_supply,
                        price: response.data.price,
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
            if (!forceRefresh && this.redis) {
                try {
                    const cachedBalance = await this.redis.get(`balance:${walletAddress}`);
                    if (cachedBalance) {
                        console.log(`💰 Balance loaded from cache for ${walletAddress}`);
                        return JSON.parse(cachedBalance);
                    }
                } catch (redisError) {
                    console.error('Redis cache read failed:', redisError);
                }
            }

            console.log(`🔍 Fetching fresh wallet balance for: ${walletAddress}`);
            console.log(`📡 API URL: ${this.dataUrl}/wallet/${walletAddress}/balances`);
            
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

            console.log(`📊 API Response Status: ${response.status}`);
            console.log(`📊 API Response Data:`, response.data);

            if (response.data && Array.isArray(response.data)) {
                console.log(`✅ Found ${response.data.length} tokens in wallet`);
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

                // Cache the balance data in Redis for 1 minute
                if (this.redis) {
                    try {
                        await this.redis.setEx(`balance:${walletAddress}`, 60, JSON.stringify(balanceData));
                        console.log(`💰 Balance cached for ${walletAddress} (TTL: 1 minute)`);
                    } catch (redisError) {
                        console.error('Redis cache write failed:', redisError);
                    }
                }

                return balanceData;
            } else {
                console.log(`⚠️ API returned non-array data:`, response.data);
                return [];
            }
        } catch (error) {
            console.error('Error getting wallet balance:', error.message);
            console.error('API URL:', `${this.dataUrl}/wallet/${walletAddress}/balances`);
            console.error('Full error:', error.response?.data || error);
            
            // Return mock data for testing if API fails
            console.log('🔧 Using mock data due to API failure');
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
        
        // Check cache first unless force refresh
        if (!forceRefresh && this.redis) {
            try {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.error('Redis cache read failed:', error);
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
                    balance: monToken ? monToken.balance : '0',
                    balanceFormatted: balanceFormatted,
                    priceUSD: monToken ? monToken.usd_per_token || monToken.priceUSD : '0'
                };

                // Cache for 1 minute
                if (this.redis) {
                    await this.redis.setEx(cacheKey, 60, JSON.stringify(result));
                }

                return result;
            }
            
            throw new Error('Invalid response format');
        } catch (error) {
            console.error('Get MON balance failed:', error.message);
            return { balance: '0', balanceFormatted: '0', priceUSD: '0' };
        }
    }

    // Get portfolio total value in USD
    async getPortfolioValue(walletAddress, forceRefresh = false) {
        const cacheKey = `portfolio_value:${walletAddress}`;
        
        // Check cache first unless force refresh
        if (!forceRefresh && this.redis) {
            try {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.error('Redis cache read failed:', error);
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

                // Cache for 2 minutes
                if (this.redis) {
                    await this.redis.setEx(cacheKey, 120, JSON.stringify(result));
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
        if (!forceRefresh && this.redis) {
            try {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.error('Redis cache read failed:', error);
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

                // Cache for 5 minutes
                if (this.redis) {
                    await this.redis.setEx(cacheKey, 300, JSON.stringify(result));
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
            console.log('Using cached gas price:', ethers.formatUnits(cached.data, 'gwei'), 'gwei');
            return cached.data;
        }

        try {
            const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
            const gasPrice = await provider.getGasPrice();
            
            // Cache the gas price for 10 minutes
            this.cache.set(cacheKey, { 
                data: gasPrice, 
                timestamp: Date.now() 
            });
            
            console.log('Fetched fresh gas price from blockchain:', ethers.formatUnits(gasPrice, 'gwei'), 'gwei');
            return gasPrice;

        } catch (error) {
            console.error('Error getting current gas price:', error);
            // Return fallback gas price if blockchain call fails
            const fallbackGasPrice = ethers.parseUnits('50', 'gwei');
            console.log('Using fallback gas price:', ethers.formatUnits(fallbackGasPrice, 'gwei'), 'gwei');
            return fallbackGasPrice;
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
                standard: currentGasPrice * BigInt(110) / BigInt(100), // 10% higher
                fast: currentGasPrice * BigInt(125) / BigInt(100), // 25% higher
                rapid: currentGasPrice * BigInt(150) / BigInt(100)  // 50% higher
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
            console.log(`=== SPEED-OPTIMIZED SELL ===`);
            console.log(`Token: ${tokenAddress}, Amount: ${tokenAmount}, Slippage: ${slippage}%`);

            const { gasPrice, gasLimit, approvalStatus } = options;
            
            // Smart transaction sequencing based on approval status
            if (!approvalStatus) {
                // Need approval - use nonce sequencing for speed
                const nonce = await wallet.provider.getTransactionCount(wallet.address);
                
                // Parallel execution: Approval (nonce) + Swap (nonce+1)
                const [approvalResult, swapResult] = await Promise.all([
                    this.executeApprovalOptimized(wallet, tokenAddress, { gasPrice, gasLimit, nonce }),
                    this.executeSwapOptimized(wallet, tokenAddress, this.tokens.MON, tokenAmount, slippage, { 
                        gasPrice, 
                        gasLimit, 
                        nonce: nonce + 1 
                    })
                ]);

                if (!approvalResult.success) {
                    throw new Error(`Approval failed: ${approvalResult.error}`);
                }

                return swapResult;
            } else {
                // Already approved - direct swap
                return await this.executeSwapOptimized(wallet, tokenAddress, this.tokens.MON, tokenAmount, slippage, options);
            }

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
            console.log(`Approval broadcast: ${txResponse.hash}`);

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
            console.log(`Swap broadcast: ${txResponse.hash}`);

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
            console.log('=== EXECUTING SWAP ===');
            console.log(`From: ${fromToken} To: ${toToken} Amount: ${amount} Slippage: ${slippage}%`);
            console.log(`Wallet address: ${wallet.address}`);
            
            // For selling tokens (not MON), ensure approval first
            if (fromToken !== this.tokens.MON) {
                console.log('Ensuring token approval for sell transaction...');
                await this.ensureTokenApproval(wallet, fromToken, amount);
            }
            
            // Get quote with transaction data
            const quote = await this.getQuote(fromToken, toToken, amount, wallet.address, slippage);
            
            if (!quote.success) {
                console.error('Quote failed:', quote);
                throw new Error(`Failed to get quote: ${quote.error}`);
            }
            
            console.log('Quote received successfully');
            console.log('Quote output amount:', quote.outputAmount);
            console.log('Quote price impact:', quote.priceImpact);
            
            if (!quote.transaction) {
                console.error('No transaction data in quote:', quote);
                throw new Error('No transaction data received from quote');
            }

            // Clean and prepare transaction object with higher gas limit
            const transaction = this.prepareTransaction(quote.transaction, quote.gasEstimate);
            
            // Get current gas price from blockchain for accurate pricing
            const currentGasPrice = await this.getCurrentGasPrice();
            
            // Apply dynamic gas price and limit
            if (options.gasLimit) {
                transaction.gasLimit = options.gasLimit;
                console.log(`Using custom gas limit: ${options.gasLimit}`);
            } else {
                // Increase default gas limit to prevent out-of-gas failures
                transaction.gasLimit = Math.max(transaction.gasLimit || 250000, 500000);
                console.log(`Using increased gas limit: ${transaction.gasLimit}`);
            }
            
            // Use current blockchain gas price
            transaction.gasPrice = options.gasPrice || currentGasPrice;
            console.log(`Using gas price: ${ethers.formatUnits(transaction.gasPrice, 'gwei')} gwei`);
            
            // Additional validation before sending
            if (!transaction.to || !transaction.data) {
                console.error('Invalid transaction object:', transaction);
                throw new Error('Transaction missing required fields');
            }
            
            // Send transaction
            console.log('Sending transaction to blockchain...');
            const txResponse = await wallet.sendTransaction(transaction);
            console.log('Transaction sent successfully, hash:', txResponse.hash);
            
            // Wait for transaction confirmation
            console.log('Waiting for transaction confirmation...');
            const receipt = await txResponse.wait();
            console.log('Transaction confirmed with status:', receipt.status);
            
            if (receipt.status !== 1) {
                console.error('Transaction failed with status:', receipt.status);
                console.error('Receipt:', receipt);
                throw new Error('Transaction failed on blockchain');
            }
            
            console.log('=== SWAP SUCCESSFUL ===');
            return {
                success: true,
                txHash: txResponse.hash,
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
            console.log('Preparing transaction from:', JSON.stringify(monorailTx, null, 2));
            
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

            console.log('Prepared transaction:', JSON.stringify(transaction, null, 2));
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
            
            console.log(`Checking token approval for ${tokenAddress}`);
            console.log(`Required amount: ${amount}`);
            console.log(`Wallet address: ${wallet.address}`);
            
            // ERC20 ABI for approve function
            const erc20Abi = [
                "function allowance(address owner, address spender) view returns (uint256)",
                "function approve(address spender, uint256 amount) returns (bool)",
                "function balanceOf(address owner) view returns (uint256)"
            ];
            
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
            const spenderAddress = "0x525b929fcd6a64aff834f4eecc6e860486ced700"; // Monorail router
            
            // Check token balance first
            const tokenBalance = await tokenContract.balanceOf(wallet.address);
            const requiredAmount = ethers.parseUnits(amount.toString(), 18);
            
            console.log(`Token balance: ${ethers.formatUnits(tokenBalance, 18)}`);
            console.log(`Required amount: ${amount}`);
            
            // Check if user has enough balance
            if (tokenBalance < requiredAmount) {
                throw new Error(`Insufficient token balance. Have: ${ethers.formatUnits(tokenBalance, 18)}, Need: ${amount}`);
            }
            
            // Check current allowance
            const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
            
            console.log(`Current allowance: ${ethers.formatUnits(currentAllowance, 18)}`);
            console.log(`Required allowance: ${ethers.formatUnits(requiredAmount, 18)}`);
            
            if (currentAllowance < requiredAmount) {
                console.log(`Approving token ${tokenAddress} for maximum amount`);
                
                // Approve maximum amount to avoid future approvals
                const maxAmount = ethers.MaxUint256;
                const approveTx = await tokenContract.approve(spenderAddress, maxAmount);
                console.log(`Approval transaction sent: ${approveTx.hash}`);
                
                // Wait for approval confirmation
                const approvalReceipt = await approveTx.wait();
                console.log(`Approval receipt status: ${approvalReceipt.status}`);
                
                if (approvalReceipt.status !== 1) {
                    throw new Error('Token approval failed');
                }
                console.log('Token approval successful');
            } else {
                console.log('Token already approved with sufficient allowance');
            }
        } catch (error) {
            console.error('Error ensuring token approval:', error);
            console.error('Error details:', error.message);
            throw new Error('Failed to approve token: ' + error.message);
        }
    }

    // Sell token for MON
    async sellToken(wallet, tokenAddress, tokenAmount, slippage = 5) {
        return await this.executeSwap(wallet, tokenAddress, this.tokens.MON, tokenAmount, slippage);
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


    // Get tokens by category
    async getTokensByCategory(category, address = null) {
        try {
            const categoryUrl = new URL(`${this.dataUrl}/tokens/category/${category}`);
            if (address) {
                categoryUrl.searchParams.set('address', address);
            }
            
            const response = await axios.get(categoryUrl.toString(), {
                timeout: 10000
            });
            
            if (response.data && Array.isArray(response.data)) {
                return {
                    success: true,
                    tokens: response.data
                };
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
}

module.exports = MonorailAPI;
