class PortfolioManager {
    constructor(monorailAPI, database, redis = null) {
        this.monorailAPI = monorailAPI;
        this.db = database;
        this.redis = redis;
    }

    async getMonPrice() {
        try {
            // Try to get from cache first
            if (this.redis) {
                const cachedPrice = await this.redis.get('mon_price_usd');
                if (cachedPrice) {
                    return parseFloat(cachedPrice);
                }
            }
            
            // If not cached, fetch from API
            const response = await this.monorailAPI.getTokenPrice('MON');
            if (response && response.priceUSD) {
                const price = parseFloat(response.priceUSD);
                // Cache for 5 minutes
                if (this.redis) {
                    await this.redis.setEx('mon_price_usd', 300, price.toString());
                }
                return price;
            }
            
            // Fallback price
            return 3.25;
        } catch (error) {
            console.error('Get MON price failed:', error);
            return 3.25; // Fallback price
        }
    }

    // Get user's portfolio with current balances
    async getPortfolio(walletAddress, forceRefresh = false) {
        try {
            // Check Redis cache first unless force refresh
            if (!forceRefresh && this.redis) {
                try {
                    const cachedPortfolio = await this.redis.get(`portfolio:${walletAddress}`);
                    if (cachedPortfolio) {
                        console.log(`📊 Portfolio loaded from cache for ${walletAddress}`);
                        return JSON.parse(cachedPortfolio);
                    }
                } catch (redisError) {
                    console.error('Redis cache read failed:', redisError);
                }
            }

            console.log(`📊 Fetching fresh portfolio data for ${walletAddress}`);
            const balances = await this.monorailAPI.getWalletBalance(walletAddress, forceRefresh);
            
            // Return all tokens including MON for portfolio display
            const filteredTokens = balances.filter(token => {
                const balance = parseFloat(token.balanceFormatted || token.balance_formatted || token.balance || '0');
                return balance > 0.000001; // Include all tokens with meaningful balance
            });

            const enrichedTokens = [];
            
            // Get current MON price for value calculations
            const monPriceUSD = await this.getMonPrice();
            
            for (const token of filteredTokens) {
                // Try to get price from multiple sources
                let priceUSD = parseFloat(token.priceUSD || token.price || token.usd_per_token || '0');
                console.log(`💰 Processing ${token.symbol}: priceUSD=${token.priceUSD}, price=${token.price}, usd_per_token=${token.usd_per_token}, final=${priceUSD}`);
                
                // If no price found, try to get it from Monorail price endpoint
                if (priceUSD === 0) {
                    try {
                        const priceResult = await this.monorailAPI.getTokenPriceInMON(token.address);
                        
                        if (priceResult.success) {
                            const priceInMON = parseFloat(priceResult.price);
                            // Convert MON price to USD using dynamic pricing
                            priceUSD = priceInMON * monPriceUSD;
                        }
                    } catch (priceError) {
                        // Silent fallback
                    }
                }

                // Use usd_per_token from API response if available
                if (priceUSD === 0 && token.usd_per_token) {
                    priceUSD = parseFloat(token.usd_per_token);
                }

                // If still no price, try fallback methods
                if (priceUSD === 0) {
                    priceUSD = await this.getFallbackPrice(token);
                }

                // Calculate token balance and value in MON
                const balance = parseFloat(token.balanceFormatted || token.balance_formatted || token.balance || '0');
                const valueUSD = balance * priceUSD;
                const valueMON = valueUSD / monPriceUSD;

                enrichedTokens.push({
                    address: token.address,
                    symbol: token.symbol,
                    name: token.name,
                    balanceFormatted: token.balanceFormatted || token.balance_formatted || token.balance,
                    decimals: token.decimals,
                    priceUSD: priceUSD.toString(),
                    valueUsd: token.valueUsd,
                    mon_value: valueMON.toString()
                });
            }

            // Cache the portfolio data in Redis for 2 minutes
            if (this.redis) {
                try {
                    await this.redis.setEx(`portfolio:${walletAddress}`, 120, JSON.stringify(enrichedTokens));
                    console.log(`📊 Portfolio cached for ${walletAddress} (TTL: 2 minutes)`);
                } catch (redisError) {
                    console.error('Redis cache write failed:', redisError);
                }
            }

            return enrichedTokens;

        } catch (error) {
            console.error('Error getting portfolio:', error);
            return [];
        }
    }

    // Fallback method to get token prices - simplified to avoid API errors
    async getFallbackPrice(token) {
        try {
            // For now, return 0 for unknown tokens to avoid API errors
            // This prevents the portfolio from showing incorrect hardcoded prices
            console.log(`No price found for token ${token.symbol} (${token.address})`);
            return 0;

        } catch (error) {
            console.error('Error in fallback price:', error);
            return 0;
        }
    }

    // Get portfolio with P&L calculations
    async getPortfolioWithPnL(walletAddress) {
        try {
            // Get current portfolio with prices
            const currentPortfolio = await this.getPortfolio(walletAddress);
            
            // Calculate total value
            let totalValue = 0;
            for (const token of currentPortfolio) {
                const balance = parseFloat(token.balanceFormatted || '0');
                const priceUSD = parseFloat(token.priceUSD || '0');
                totalValue += balance * priceUSD;
            }
            
            return {
                tokens: currentPortfolio,
                totalValue: totalValue,
                totalPnL: 0
            };

            const portfolioWithPnL = [];

            for (const token of currentPortfolio) {
                const entry = portfolioEntries.find(e => 
                    e.token_address.toLowerCase() === token.address.toLowerCase()
                );

                if (entry) {
                    // Get current price in MON
                    const priceResult = await this.monorailAPI.getTokenPriceInMON(token.address);
                    const currentPrice = priceResult.success ? parseFloat(priceResult.price) : 0;
                    
                    // Use the correct balance field - prioritize balanceFormatted
                    const currentBalance = parseFloat(token.balanceFormatted || token.balance_formatted || token.balance || '0');
                    const averageBuyPrice = parseFloat(entry.average_buy_price);
                    const totalBought = parseFloat(entry.total_bought);
                    
                    // Calculate current value in MON
                    const currentValueInMon = currentBalance * currentPrice;
                    
                    // Calculate total cost basis
                    const totalCostBasis = totalBought * averageBuyPrice;
                    
                    // Calculate P&L
                    const pnl = currentValueInMon - totalCostBasis;
                    const pnlPercent = totalCostBasis > 0 ? (pnl / totalCostBasis) * 100 : 0;

                    portfolioWithPnL.push({
                        ...token,
                        balance: currentBalance,
                        balanceFormatted: token.balanceFormatted || currentBalance.toString(),
                        averageBuyPrice: averageBuyPrice,
                        totalBought: totalBought,
                        currentPrice: currentPrice,
                        valueInMon: currentValueInMon.toFixed(6),
                        pnl: pnl.toFixed(6),
                        pnlPercent: pnlPercent.toFixed(2),
                        costBasis: totalCostBasis.toFixed(6)
                    });
                } else {
                    // Token not in database, might be received from elsewhere
                    const priceResult = await this.monorailAPI.getTokenPriceInMON(token.address);
                    const currentPrice = priceResult.success ? parseFloat(priceResult.price) : 0;
                    const currentBalance = parseFloat(token.balanceFormatted || token.balance_formatted || token.balance || '0');
                    const currentValueInMon = currentBalance * currentPrice;

                    portfolioWithPnL.push({
                        ...token,
                        balance: currentBalance,
                        balanceFormatted: token.balanceFormatted || currentBalance.toString(),
                        averageBuyPrice: 0,
                        totalBought: 0,
                        currentPrice: currentPrice,
                        valueInMon: currentValueInMon.toFixed(6),
                        pnl: currentValueInMon.toFixed(6), // All profit since no cost basis
                        pnlPercent: '∞',
                        costBasis: '0'
                    });
                }
            }

            return portfolioWithPnL;

        } catch (error) {
            console.error('Error getting portfolio with P&L:', error);
            return [];
        }
    }

    // Update portfolio after buy transaction
    async updatePortfolioAfterBuy(telegramId, tokenAddress, tokenSymbol, tokenAmount, pricePerToken) {
        try {
            await this.db.updatePortfolioEntry(
                telegramId,
                tokenAddress,
                tokenSymbol,
                tokenAmount,
                pricePerToken
            );

            return { success: true };

        } catch (error) {
            console.error('Error updating portfolio after buy:', error);
            return { success: false, error: error.message };
        }
    }

    // Update portfolio after sell transaction
    async updatePortfolioAfterSell(telegramId, tokenAddress, tokenAmount) {
        try {
            const entry = await this.db.getOne(
                'SELECT * FROM portfolio_entries WHERE telegram_id = $1 AND token_address = $2',
                [telegramId, tokenAddress]
            );

            if (entry) {
                const newTotalSold = parseFloat(entry.total_sold) + parseFloat(tokenAmount);
                
                await this.db.query(
                    'UPDATE portfolio_entries SET total_sold = $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2 AND token_address = $3',
                    [newTotalSold.toString(), telegramId, tokenAddress]
                );
            }

            return { success: true };

        } catch (error) {
            console.error('Error updating portfolio after sell:', error);
            return { success: false, error: error.message };
        }
    }

    // Get portfolio summary
    async getPortfolioSummary(telegramId) {
        try {
            const portfolioWithPnL = await this.getPortfolioWithPnL(telegramId);
            
            let totalValue = 0;
            let totalPnL = 0;
            let totalCostBasis = 0;
            let winners = 0;
            let losers = 0;

            for (const token of portfolioWithPnL) {
                totalValue += parseFloat(token.valueInMon);
                totalPnL += parseFloat(token.pnl);
                totalCostBasis += parseFloat(token.costBasis);
                
                if (parseFloat(token.pnl) > 0) {
                    winners++;
                } else if (parseFloat(token.pnl) < 0) {
                    losers++;
                }
            }

            const totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

            return {
                totalTokens: portfolioWithPnL.length,
                totalValue: totalValue.toFixed(6),
                totalPnL: totalPnL.toFixed(6),
                totalPnLPercent: totalPnLPercent.toFixed(2),
                totalCostBasis: totalCostBasis.toFixed(6),
                winners: winners,
                losers: losers,
                winRate: portfolioWithPnL.length > 0 ? ((winners / portfolioWithPnL.length) * 100).toFixed(1) : '0'
            };

        } catch (error) {
            console.error('Error getting portfolio summary:', error);
            return {
                totalTokens: 0,
                totalValue: '0',
                totalPnL: '0',
                totalPnLPercent: '0',
                totalCostBasis: '0',
                winners: 0,
                losers: 0,
                winRate: '0'
            };
        }
    }

    // Get top performers
    async getTopPerformers(walletAddress, limit = 5) {
        try {
            const portfolioWithPnL = await this.getPortfolioWithPnL(walletAddress);
            
            // Sort by P&L percentage descending
            const topPerformers = portfolioWithPnL
                .filter(token => token.pnlPercent !== '∞' && parseFloat(token.pnl) !== 0)
                .sort((a, b) => parseFloat(b.pnlPercent) - parseFloat(a.pnlPercent))
                .slice(0, limit);

            return topPerformers;

        } catch (error) {
            console.error('Error getting top performers:', error);
            return [];
        }
    }

    // Get worst performers
    async getWorstPerformers(walletAddress, limit = 5) {
        try {
            const portfolioWithPnL = await this.getPortfolioWithPnL(walletAddress);
            
            // Sort by P&L percentage ascending
            const worstPerformers = portfolioWithPnL
                .filter(token => token.pnlPercent !== '∞' && parseFloat(token.pnl) !== 0)
                .sort((a, b) => parseFloat(a.pnlPercent) - parseFloat(b.pnlPercent))
                .slice(0, limit);

            return worstPerformers;

        } catch (error) {
            console.error('Error getting worst performers:', error);
            return [];
        }
    }

    // Calculate portfolio diversity score
    async getPortfolioDiversity(walletAddress) {
        try {
            const portfolio = await this.getPortfolioWithPnL(walletAddress);
            
            if (portfolio.length === 0) {
                return { score: 0, rating: 'No positions' };
            }

            const totalValue = portfolio.reduce((sum, token) => sum + parseFloat(token.valueInMon), 0);
            
            // Calculate Herfindahl-Hirschman Index (HHI)
            let hhi = 0;
            for (const token of portfolio) {
                const weight = parseFloat(token.valueInMon) / totalValue;
                hhi += weight * weight;
            }

            // Convert to diversity score (0-100, higher is more diverse)
            const diversityScore = Math.max(0, (1 - hhi) * 100);
            
            let rating;
            if (diversityScore >= 80) rating = 'Highly Diverse';
            else if (diversityScore >= 60) rating = 'Well Diverse';
            else if (diversityScore >= 40) rating = 'Moderately Diverse';
            else if (diversityScore >= 20) rating = 'Low Diversity';
            else rating = 'Highly Concentrated';

            return {
                score: diversityScore.toFixed(1),
                rating: rating,
                tokenCount: portfolio.length
            };

        } catch (error) {
            console.error('Error calculating portfolio diversity:', error);
            return { score: 0, rating: 'Error calculating' };
        }
    }

    // Helper function to get telegram ID from wallet address
    async getTelegramIdFromWallet(walletAddress) {
        try {
            const user = await this.db.getOne(
                'SELECT telegram_id FROM users WHERE wallet_address = $1',
                [walletAddress]
            );
            return user ? user.telegram_id : null;
        } catch (error) {
            console.error('Error getting telegram ID from wallet:', error);
            return null;
        }
    }

    // Clean up old portfolio entries (tokens with zero balance)
    async cleanupPortfolio(telegramId) {
        try {
            const user = await this.db.getUser(telegramId);
            if (!user) return;

            const currentPortfolio = await this.getPortfolio(user.wallet_address);
            const currentAddresses = currentPortfolio.map(token => token.address.toLowerCase());

            // Remove entries for tokens no longer held
            const portfolioEntries = await this.db.getPortfolioEntries(telegramId);
            
            for (const entry of portfolioEntries) {
                if (!currentAddresses.includes(entry.token_address.toLowerCase())) {
                    await this.db.query(
                        'DELETE FROM portfolio_entries WHERE telegram_id = $1 AND token_address = $2',
                        [telegramId, entry.token_address]
                    );
                }
            }

            return { success: true };

        } catch (error) {
            console.error('Error cleaning up portfolio:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = PortfolioManager;
