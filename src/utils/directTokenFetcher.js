/**
 * Direct Token Fetcher - Direct API calls for accurate token balance
 */

const axios = require('axios');
const https = require('https');

class DirectTokenFetcher {
    constructor(monitoring) {
        this.baseURL = 'https://testnet-api.monorail.xyz/v1';
        this.monitoring = monitoring;
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: true,
            secureProtocol: 'TLSv1_2_method'
        });
    }

    /**
     * Get token balance directly from API without cache
     */
    async getDirectTokenBalance(walletAddress, tokenAddress, tokenSymbol) {
        try {
            this.monitoring?.logInfo('🔍 Fetching direct token balance', { 
                walletAddress, 
                tokenAddress, 
                tokenSymbol 
            });

            // Direct API call to wallet balances endpoint
            const response = await axios.get(`${this.baseURL}/wallet/${walletAddress}/balances`, {
                httpsAgent: this.httpsAgent,
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Area51-Bot/1.0',
                    'Cache-Control': 'no-cache'
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });

            this.monitoring?.logInfo('📡 Direct API response received', { 
                status: response.status,
                dataType: typeof response.data,
                isArray: Array.isArray(response.data),
                tokenCount: Array.isArray(response.data) ? response.data.length : 0,
                firstToken: Array.isArray(response.data) && response.data.length > 0 ? {
                    symbol: response.data[0].symbol,
                    address: response.data[0].address,
                    balance: response.data[0].balance
                } : null
            });

            if (response.data && Array.isArray(response.data)) {
                // Find the specific token by address or symbol
                const tokenEntry = response.data.find(token => 
                    token.address?.toLowerCase() === tokenAddress.toLowerCase() ||
                    token.symbol?.toLowerCase() === tokenSymbol.toLowerCase()
                );

                if (tokenEntry) {
                    const balance = parseFloat(tokenEntry.balance || 0);
                    const monValue = parseFloat(tokenEntry.mon_value || 0);
                    const priceUSD = parseFloat(tokenEntry.usd_per_token || 0);
                    // Calculate USD value from balance and price
                    const valueUSD = balance * priceUSD;

                    this.monitoring?.logInfo('✅ Token found in direct API', {
                        tokenSymbol,
                        balance,
                        valueUSD,
                        monValue,
                        priceUSD
                    });

                    return {
                        success: true,
                        balance,
                        valueUSD,
                        valueMON: monValue,
                        priceUSD,
                        symbol: tokenEntry.symbol || tokenSymbol,
                        name: tokenEntry.name || 'Unknown Token',
                        address: tokenEntry.address || tokenAddress,
                        rawData: tokenEntry // Keep raw data for debugging
                    };
                } else {
                    this.monitoring?.logInfo('❌ Token not found in wallet', { 
                        tokenAddress, 
                        tokenSymbol,
                        availableTokens: response.data.map(t => ({ symbol: t.symbol, address: t.address }))
                    });

                    return {
                        success: false,
                        balance: 0,
                        valueUSD: 0,
                        valueMON: 0,
                        error: 'Token not found in wallet'
                    };
                }
            } else {
                this.monitoring?.logInfo('📝 No tokens in wallet or unexpected response format', {
                    responseData: response.data
                });

                return {
                    success: false,
                    balance: 0,
                    valueUSD: 0,
                    valueMON: 0,
                    error: 'No tokens found or invalid response'
                };
            }

        } catch (error) {
            this.monitoring?.logError('❌ Direct token fetch failed', error, {
                walletAddress,
                tokenAddress,
                tokenSymbol
            });

            return {
                success: false,
                balance: 0,
                valueUSD: 0,
                valueMON: 0,
                error: error.message
            };
        }
    }

    /**
     * Get token balance with multiple retry attempts
     */
    async getTokenBalanceWithRetry(walletAddress, tokenAddress, tokenSymbol, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.monitoring?.logInfo(`🔄 Token balance fetch attempt ${attempt}/${maxRetries}`, {
                walletAddress,
                tokenSymbol
            });

            const result = await this.getDirectTokenBalance(walletAddress, tokenAddress, tokenSymbol);
            
            if (result.success && result.balance > 0) {
                this.monitoring?.logInfo('✅ Token balance found successfully', {
                    attempt,
                    balance: result.balance,
                    valueUSD: result.valueUSD
                });
                return result;
            }

            if (attempt < maxRetries) {
                // Wait before retry (increasing delay)
                const delay = attempt * 2000; // 2s, 4s, 6s
                this.monitoring?.logInfo(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        this.monitoring?.logInfo('❌ All retry attempts failed', {
            walletAddress,
            tokenSymbol,
            maxRetries
        });

        return {
            success: false,
            balance: 0,
            valueUSD: 0,
            valueMON: 0,
            error: `Failed after ${maxRetries} attempts`
        };
    }

    /**
     * Generate sell message with direct API data
     */
    generateSellMessage(tokenData, tokenAddress, tradeResult) {
        const { balance, valueUSD, valueMON, symbol, name } = tokenData;

        return `**Purchase Successful**

**Token Information:**
**Name:** ${name || 'Unknown Token'}
**Symbol:** ${symbol || 'Token'}
**Contract:** \`${tokenAddress}\`

**Your Holdings:**
**Balance:** ${balance.toFixed(6)} ${symbol}
**Value (USD):** $${valueUSD.toFixed(4)}
**Value (MON):** ${valueMON.toFixed(4)} MON

**Transaction:**
**Hash:** \`${tradeResult.txHash}\`
**Status:** Confirmed

${balance > 0 ? 'Select percentage to sell:' : '*Balance updating... Please use refresh button.*'}`;
    }
}

module.exports = DirectTokenFetcher;
