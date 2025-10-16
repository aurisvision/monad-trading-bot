const axios = require('axios');

/**
 * BlockVisionAPI - Exclusive API for portfolio data only
 * 
 * Usage:
 * - Portfolio data: getWalletBalance() - ONLY source for user portfolio/token holdings
 * - Token processing: Processes and formats portfolio token data
 * 
 * Note: This API is NOT used for balance queries (getMONBalance) or price data - Monorail handles those
 */
class BlockVisionAPI {
    constructor(cacheService, monitoring) {
        this.baseURL = 'https://api.blockvision.org/v2/monad';
        this.apiKey = process.env.BLOCKVISION_API_KEY;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
        this.BALANCE_CACHE_TTL = 600; // 10 minutes
        this.MON_PRICE_CACHE_TTL = 300; // 5 minutes for MON price
        this.monPriceURL = 'https://testnet-api.monorail.xyz/v1/symbol/MONUSD';
        this.appId = process.env.MONORAIL_APP_ID;
        
        if (!this.apiKey) {
            throw new Error('BLOCKVISION_API_KEY environment variable is required');
        }

        // Create axios instance with default config
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'accept': 'application/json',
                'x-api-key': this.apiKey
            }
        });
    }

    /**
     * Fetch current MON price from Monorail API
     * @returns {Promise<number>} MON price in USD
     */
    async getMonPrice() {
        try {
            // Use the same cache key as MonorailAPI for consistency
            if (this.cacheService) {
                const cached = await this.cacheService.get('mon_price_usd', 'global');
                if (cached && cached.price) {
                    console.log('MON price from cache:', cached.price);
                    return parseFloat(cached.price);
                }
            }

            console.log('Fetching MON price from API...');
            const response = await axios.get(this.monPriceURL, {
                headers: {
                    'accept': 'application/json',
                    'X-App-Identifier': this.appId
                },
                timeout: 10000
            });

            const price = parseFloat(response.data.price);
            console.log('MON price fetched:', price);
            
            // Cache using the same format as MonorailAPI
            if (this.cacheService && price) {
                const priceData = {
                    price: price,
                    success: true,
                    timestamp: Date.now()
                };
                await this.cacheService.set('mon_price_usd', 'global', priceData, this.MON_PRICE_CACHE_TTL);
            }

            return price || 1.0; // Fallback to 1.0 if price fetch fails
        } catch (error) {
            console.error('Error fetching MON price:', error.message);
            return 1.0; // Fallback price
        }
    }

    /**
     * Get wallet balance from BlockVision API
     */
    async getWalletBalance(walletAddress) {
        try {
            // Check cache first
            if (this.cacheService) {
                const cached = await this.cacheService.get('portfolio_balance', walletAddress);
                if (cached) {
                    console.log('BlockVision balance fetched from cache', { 
                        walletAddress, 
                        tokenCount: cached.length 
                    });
                    return cached;
                }
            }

            this.monitoring?.logInfo('Fetching balance from BlockVision API', { walletAddress });
            
            const response = await this.axiosInstance.get(`/account/tokens`, {
                params: {
                    address: walletAddress
                }
            });

            // Debug: Log the actual response structure
            this.monitoring?.logInfo('BlockVision API response received', {
                walletAddress,
                responseStatus: response.status,
                responseData: JSON.stringify(response.data, null, 2)
            });



            if (!response.data || !response.data.result) {
                throw new Error('Invalid response format from BlockVision API');
            }

            const tokens = response.data.result.data;
            
            // Process and enhance token data
            const processedTokens = await this.processTokenData(tokens);
            
            // Cache the result using separate portfolio cache key
            if (this.cacheService) {
                await this.cacheService.set('portfolio_balance', walletAddress, processedTokens, this.BALANCE_CACHE_TTL);
            }

            this.monitoring?.logInfo('BlockVision balance fetched successfully', {
                walletAddress,
                tokenCount: processedTokens.length
            });

            return processedTokens;

        } catch (error) {
            this.monitoring?.logError('BlockVision API error', error, { walletAddress });
            
            // Return empty array on error to allow fallback
            return [];
        }
    }

    /**
     * Process token data from BlockVision API
     */
    async processTokenData(tokens) {
        const processedTokens = [];
        
        for (const token of tokens) {
            try {
                // Calculate MON value using current MON price
                const monValue = await this.calculateMonValue(token.usdValue || 0);
                
                const processedToken = {
                    address: token.contractAddress,
                    symbol: token.symbol || 'UNKNOWN',
                    name: token.name || token.symbol || 'Unknown Token',
                    balance: token.balance || '0',
                    decimals: token.decimal || 18,
                    usd_value: parseFloat(token.usdValue || 0),
                    mon_value: monValue,
                    price: parseFloat(token.price || 0),
                    price_change_24h: parseFloat(token.priceChangePercentage || 0),
                    verified: token.verified || false,
                    logo: token.imageURL || null
                };
                
                processedTokens.push(processedToken);
                
            } catch (error) {
                this.monitoring?.logError('Error processing token data', error, {
                    tokenAddress: token.token_address,
                    symbol: token.symbol
                });
                continue;
            }
        }
        
        return processedTokens;
    }

    /**
     * Calculate MON value from USD value
     * This is a simplified calculation - in production you'd want to fetch real MON price
     */
    async calculateMonValue(usdValue) {
        try {
            const monPriceUSD = await this.getMonPrice();
            const monValue = usdValue / monPriceUSD;
            return monValue;
        } catch (error) {
            this.monitoring?.logError('Error calculating MON value', error);
            return 0;
        }
    }

    /**
     * Get token information
     */
    async getTokenInfo(tokenAddress) {
        const cacheKey = `blockvision_token_${tokenAddress}`;
        
        try {
            // Check cache first
            if (this.cacheService) {
                const cached = await this.cacheService.get('token_info', tokenAddress);
                if (cached) {
                    return cached;
                }
            }

            const response = await this.axiosInstance.get(`/token/${tokenAddress}`);
            
            if (!response.data || !response.data.data) {
                throw new Error('Invalid token info response');
            }

            const tokenInfo = response.data.data;
            
            // Cache the result
            if (this.cacheService) {
                await this.cacheService.set('token_info', tokenAddress, tokenInfo, this.TOKEN_INFO_CACHE_TTL);
            }

            return tokenInfo;

        } catch (error) {
            this.monitoring?.logError('BlockVision token info error', error, { tokenAddress });
            return null;
        }
    }

    /**
     * Health check for BlockVision API
     */
    async healthCheck() {
        try {
            const response = await this.axiosInstance.get('/health', { timeout: 5000 });
            return response.status === 200;
        } catch (error) {
            this.monitoring?.logError('BlockVision health check failed', error);
            return false;
        }
    }

    /**
     * Clear wallet cache
     */
    async clearWalletCache(walletAddress) {
        try {
            if (this.cacheService) {
                await this.cacheService.delete('wallet_balance', walletAddress);
                this.monitoring?.logInfo('BlockVision wallet cache cleared', { walletAddress });
            }
        } catch (error) {
            this.monitoring?.logError('Error clearing BlockVision wallet cache', error, { walletAddress });
        }
    }
}

module.exports = BlockVisionAPI;