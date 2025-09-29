/**
 * Fresh Data Fetcher - Utility to get updated token data after purchases
 */

class FreshDataFetcher {
    constructor(monorailAPI, cacheService, monitoring) {
        this.monorailAPI = monorailAPI;
        this.cacheService = cacheService;
        this.monitoring = monitoring;
    }

    /**
     * Get fresh token data after purchase with cache clearing
     */
    async getFreshTokenData(walletAddress, tokenAddress, tokenSymbol, tokenName) {
        try {
            // Clear cache to ensure fresh data
            if (this.cacheService) {
                await Promise.all([
                    this.cacheService.delete('portfolio', walletAddress),
                    this.cacheService.delete('wallet_balance', walletAddress)
                ]);
            }

            // Wait a bit more for blockchain confirmation
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Get fresh portfolio data
            const portfolioData = await this.monorailAPI.getPortfolioValue(walletAddress, true);
            
            let tokenBalance = 0;
            let tokenValueUSD = 0;
            let tokenValueMON = 0;

            if (portfolioData.success && portfolioData.tokens) {
                const tokenEntry = portfolioData.tokens.find(t => 
                    t.address?.toLowerCase() === tokenAddress.toLowerCase() ||
                    t.symbol?.toLowerCase() === tokenSymbol.toLowerCase()
                );
                
                if (tokenEntry) {
                    tokenBalance = parseFloat(tokenEntry.balance || 0);
                    tokenValueUSD = parseFloat(tokenEntry.value_usd || 0);
                    tokenValueMON = parseFloat(tokenEntry.value_mon || 0);
                }
            }

            // If still zero, try alternative method
            if (tokenBalance === 0) {
                try {
                    const walletBalance = await this.monorailAPI.getWalletBalance(walletAddress, true);
                    if (walletBalance.success && walletBalance.tokens) {
                        const altTokenEntry = walletBalance.tokens.find(t => 
                            t.address?.toLowerCase() === tokenAddress.toLowerCase() ||
                            t.symbol?.toLowerCase() === tokenSymbol.toLowerCase()
                        );
                        
                        if (altTokenEntry) {
                            tokenBalance = parseFloat(altTokenEntry.balance || 0);
                            // Calculate values if available
                            const tokenPrice = parseFloat(altTokenEntry.usd_per_token || 0);
                            if (tokenPrice > 0) {
                                tokenValueUSD = tokenBalance * tokenPrice;
                                // Get MON price for conversion
                                const monPrice = await this.monorailAPI.getMONPriceUSD();
                                if (monPrice.success && parseFloat(monPrice.price) > 0) {
                                    tokenValueMON = tokenValueUSD / parseFloat(monPrice.price);
                                }
                            }
                        }
                    }
                } catch (altError) {
                    this.monitoring?.logError('Alternative token fetch failed', altError);
                }
            }

            return {
                success: true,
                tokenBalance,
                tokenValueUSD,
                tokenValueMON,
                tokenSymbol,
                tokenName
            };

        } catch (error) {
            this.monitoring?.logError('Fresh token data fetch failed', error);
            return {
                success: false,
                tokenBalance: 0,
                tokenValueUSD: 0,
                tokenValueMON: 0,
                tokenSymbol,
                tokenName,
                error: error.message
            };
        }
    }

    /**
     * Generate updated sell message with fresh data
     */
    generateUpdatedSellMessage(tokenData, tokenAddress, tradeResult) {
        return `**Purchase Successful**

**Token Information:**
**Name:** ${tokenData.tokenName}
**Symbol:** ${tokenData.tokenSymbol}
**Contract:** \`${tokenAddress}\`

**Your Holdings:**
**Balance:** ${tokenData.tokenBalance.toFixed(6)} ${tokenData.tokenSymbol}
**Value (USD):** $${tokenData.tokenValueUSD.toFixed(4)}
**Value (MON):** ${tokenData.tokenValueMON.toFixed(4)} MON

**Transaction:**
**Hash:** \`${tradeResult.txHash}\`
**Status:** Confirmed

${tokenData.tokenBalance > 0 ? 'Select percentage to sell:' : '*Refreshing balance... Please wait or use refresh button.*'}`;
    }
}

module.exports = FreshDataFetcher;
