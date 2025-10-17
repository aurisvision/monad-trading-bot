const UnifiedCacheManager = require('./UnifiedCacheManager');

class PortfolioService {
    constructor(monorailAPI, redis, monitoring) {
        this.monorailAPI = monorailAPI;
        this.redis = redis;
        this.monitoring = monitoring;
        this.cache = new UnifiedCacheManager(redis, monitoring);
        
        // Configuration
        this.TOKENS_PER_PAGE = 5;
        this.MIN_VALUE_THRESHOLD = 0.01; // Minimum MON value to include token (1 cent)
        this.PORTFOLIO_CACHE_TTL = 600; // 10 minutes
        this.REDIS_PORTFOLIO_TTL = 1800; // 30 minutes for Redis storage
    }

    /**
     * Clear user portfolio cache using unified cache system
     */
    async clearUserPortfolioCache(telegramId) {
        try {
            await this.cache.delete('portfolio', telegramId);
            console.log(`🗑️ Portfolio cache cleared for user ${telegramId}`);
        } catch (error) {
            console.error('Error clearing portfolio cache:', error);
        }
    }

    /**
     * Fetch portfolio from Monorail API
     */
    async fetchPortfolioFromAPI(walletAddress, forceRefresh = false) {
        try {
            this.monitoring?.logInfo('Fetching portfolio from Monorail API', { walletAddress, forceRefresh });
            
            const tokens = await this.monorailAPI.getWalletBalance(walletAddress, forceRefresh);
            
            if (tokens && Array.isArray(tokens) && tokens.length > 0) {
                this.monitoring?.logInfo('Portfolio data fetched successfully from Monorail', { 
                    walletAddress, 
                    tokenCount: tokens.length 
                });
                
                return this.processTokensForPortfolio(tokens);
            }
            
            this.monitoring?.logInfo('Monorail returned empty data', { walletAddress });
            return [];
        } catch (error) {
            this.monitoring?.logError('Portfolio API fetch failed', error);
            return [];
        }
    }

    /**
     * Process tokens for portfolio display (Monorail data only)
     */
    processTokensForPortfolio(tokens) {
        // Filter and transform tokens for portfolio display
        // Include tokens with valid balance and USD value
        const filteredTokens = tokens
            .filter(token => {
                // Check if token has a valid balance
                const balance = parseFloat(token.balance || token.balanceFormatted || 0);
                
                // Check if token has a valid USD value
                const usdValue = parseFloat(token.valueUsd || token.usd_value || 0);
                
                // Check if token has a valid USD price
                const usdPrice = parseFloat(token.priceUSD || token.usd_per_token || token.price || 0);
                
                // Check MON value for filtering
                const monValue = parseFloat(token.mon_value || 0);
                
                // Exclude MON token from portfolio display (it shows in main menu)
                const isNotMON = token.symbol !== 'MON';
                
                // Include tokens that have either a USD value > 0 OR (balance > 0 AND price > 0)
                const hasValue = usdValue > 0 || (balance > 0 && usdPrice > 0);
                
                // Filter out tokens with MON value less than 0.05
                const hasMinimumMonValue = monValue >= 0.05;
                
                this.monitoring?.logDebug('Token filtering', {
                    symbol: token.symbol,
                    balance,
                    usdValue,
                    usdPrice,
                    monValue,
                    hasValue,
                    isNotMON,
                    hasMinimumMonValue,
                    included: hasValue && isNotMON && hasMinimumMonValue
                });
                
                return hasValue && isNotMON && hasMinimumMonValue;
            })
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                balance: token.balance || token.balanceFormatted || '0',
                mon_value: token.mon_value || '0',
                usd_value: token.valueUsd || token.usd_value || 0,
                usd_price: token.priceUSD || token.usd_per_token || token.price || null,
                address: token.address,
                verified: token.verified || false,
                market_cap: token.market_cap || null,
                volume_24h: token.volume_24h || null,
                logo: token.logo || null,
                last_updated: Date.now()
            }))
            // Sort by MON value in descending order (highest to lowest)
            .sort((a, b) => {
                const monValueA = parseFloat(a.mon_value || 0);
                const monValueB = parseFloat(b.mon_value || 0);
                return monValueB - monValueA; // Descending order
            });

        this.monitoring?.logInfo('Portfolio processed successfully', { 
            tokenCount: filteredTokens.length,
            totalTokensReceived: tokens.length,
            source: 'Monorail',
            sortedByMonValue: true,
            minimumMonValue: 0.05
        });

        return filteredTokens;
    }

    /**
     * Store portfolio in Redis using hash structure
     */
    async storePortfolioInRedis(telegramId, tokens) {
        if (!this.redis) return;

        try {
            const portfolioKey = this.getPortfolioKey(telegramId);

            // Clear existing portfolio
            await this.redis.del(portfolioKey);

            // Store each token as a hash field
            for (const token of tokens) {
                await this.redis.hSet(portfolioKey, token.symbol, JSON.stringify({
                    name: token.name,
                    balance: token.balance,
                    mon_value: token.mon_value,
                    usd_price: token.usd_price,
                    address: token.address
                }));
            }

            // Set TTL
            await this.redis.expire(portfolioKey, this.CACHE_TTL);
            
            this.monitoring?.logInfo('Portfolio cached in Redis', { 
                telegramId, 
                tokenCount: tokens.length 
            });
        } catch (error) {
            this.monitoring?.logError('Redis portfolio storage failed', error);
        }
    }

    /**
     * Get portfolio from Redis cache
     */
    async getPortfolioFromRedis(telegramId) {
        if (!this.redis) return null;

        try {
            const portfolioKey = this.getPortfolioKey(telegramId);
            const tokenData = await this.redis.hGetAll(portfolioKey);

            if (!tokenData || Object.keys(tokenData).length === 0) {
                return null;
            }

            const tokens = [];
            for (const [symbol, data] of Object.entries(tokenData)) {
                try {
                    const tokenInfo = JSON.parse(data);
                    tokens.push({
                        symbol,
                        ...tokenInfo
                    });
                } catch (parseError) {
                    this.monitoring?.logError('Token data parse error', parseError);
                }
            }

            return tokens;
        } catch (error) {
            this.monitoring?.logError('Redis portfolio retrieval failed', error);
            return null;
        }
    }

    /**
     * Get user portfolio with caching
     */
    async getUserPortfolio(telegramId, walletAddress, forceRefresh = false) {
        try {
            // Clear cache if force refresh is requested
            if (forceRefresh) {
                await this.cache.delete('portfolio', telegramId);
                console.log('🗑️ Force refresh: Portfolio cache cleared for user', telegramId);
            }
            
            // Try cache first unless force refresh
            if (!forceRefresh) {
                const cachedPortfolio = await this.cache.get('portfolio', telegramId);
                if (cachedPortfolio && cachedPortfolio.length > 0) {
                    this.monitoring?.logInfo('Portfolio loaded from unified cache', { telegramId });
                    return cachedPortfolio;
                }
            }

            // Fetch from API
            this.monitoring?.logInfo('Fetching portfolio from API', { telegramId, walletAddress, forceRefresh });
            const tokens = await this.fetchPortfolioFromAPI(walletAddress, forceRefresh);

            // Store in unified cache
            await this.cache.set('portfolio', telegramId, tokens);

            return tokens;
        } catch (error) {
            this.monitoring?.logError('Get user portfolio failed', error);
            return [];
        }
    }

    /**
     * Format portfolio message for Telegram
     */
    formatPortfolioMessage(tokens, page = 1) {
        const totalPages = Math.ceil(tokens.length / this.TOKENS_PER_PAGE);
        const startIndex = (page - 1) * this.TOKENS_PER_PAGE;
        const endIndex = startIndex + this.TOKENS_PER_PAGE;
        const pageTokens = tokens.slice(startIndex, endIndex);

        if (pageTokens.length === 0) {
            return {
                text: `*📊 Portfolio*\n\n_No tokens found in your portfolio._`,
                hasTokens: false,
                totalPages: 0,
                currentPage: page
            };
        }

        // Calculate total portfolio value
        let totalUSDValue = 0;
        let totalMONValue = 0;
        
        tokens.forEach(token => {
            totalUSDValue += parseFloat(token.usd_value || 0);
            totalMONValue += parseFloat(token.mon_value || 0);
        });

        let message = `<b>📊 Portfolio</b>\n\n`;

        pageTokens.forEach(token => {
            const balance = parseFloat(token.balance || '0').toFixed(6);
            const monValue = parseFloat(token.mon_value || '0').toFixed(4);
            const usdPrice = token.usd_price || null;
            const verified = token.verified;
            
            // Token header with verification badge and clickable link
            const verifiedBadge = verified ? '✅' : '';
            const sellLink = `https://t.me/MonAreaBot?start=sellToken-${token.address}`;
            
            // Use HTML formatting for bold text within links
            message += `🟣 <a href="${sellLink}"><b>${token.symbol} ${verifiedBadge} (${token.name})</b></a>\n`;
            
            message += `• <b>Balance:</b> ${balance} ${token.symbol}\n`;
            message += `• <b>Value in MON:</b> ${monValue}\n`;
            
            // Price display
            if (usdPrice !== null && usdPrice > 0) {
                message += `• <b>Price:</b> ${this.formatPrice(usdPrice)}\n\n`;
            } else {
                message += `• <b>Price:</b> $0.00000\n\n`;
            }
        });

        // Add pagination info if multiple pages
        if (totalPages > 1) {
            message += `<b>📄 Page ${page} of ${totalPages}</b>\n\n`;
        }

        // Add last updated timestamp
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: true,
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
        message += `<i>🕒 Last updated: ${timeString}</i>`;

        return {
            text: message,
            hasTokens: true,
            totalPages,
            currentPage: page,
            tokens: pageTokens
        };
    }

    /**
     * Format price for display
     */
    formatPrice(price) {
        if (!price || price <= 0) {
            return '$0.00000';
        }
        
        const numPrice = parseFloat(price);
        
        if (numPrice >= 1) {
            return `$${numPrice.toFixed(2)}`;
        } else if (numPrice >= 0.01) {
            return `$${numPrice.toFixed(4)}`;
        } else if (numPrice >= 0.0001) {
            return `$${numPrice.toFixed(6)}`;
        } else {
            return '$0.00000';
        }
    }

    /**
     * Create inline keyboard for portfolio
     */
    createPortfolioKeyboard(tokens, currentPage, totalPages) {
        const { Markup } = require('telegraf');
        const buttons = [];

        // Add navigation buttons only (no individual token sell buttons)
        const navButtons = [];
        
        if (totalPages > 1) {
            if (currentPage > 1) {
                navButtons.push(Markup.button.callback('⬅️ Previous', `portfolio:page:${currentPage - 1}`));
            }
            if (currentPage < totalPages) {
                navButtons.push(Markup.button.callback('Next ➡️', `portfolio:page:${currentPage + 1}`));
            }
        }

        if (navButtons.length > 0) {
            buttons.push(navButtons);
        }

        // Add refresh button
        buttons.push([Markup.button.callback('🔄 Refresh', 'portfolio:refresh')]);

        // Add main menu button
        buttons.push([Markup.button.callback('🏠 Main Menu', 'main')]);

        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Get portfolio display data
     */
    async getPortfolioDisplay(telegramId, walletAddress, page = 1, forceRefresh = false) {
        try {
            const tokens = await this.getUserPortfolio(telegramId, walletAddress, forceRefresh);
            
            // Handle empty portfolio gracefully
            if (!tokens || tokens.length === 0) {
                this.monitoring?.logInfo('Empty portfolio returned', { telegramId, walletAddress });
                const { Markup } = require('telegraf');
                return {
                    text: `📊 **Portfolio**\n\n_No tokens found in your portfolio._\n\n<i>🕒 Last updated: ${new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' })}</i>`,
                    keyboard: Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Refresh', 'portfolio:refresh')],
                        [Markup.button.callback('🏠 Back to Main', 'main')]
                    ]).reply_markup,
                    hasTokens: false,
                    totalPages: 0,
                    currentPage: 1
                };
            }
            
            const messageData = this.formatPortfolioMessage(tokens, page);
            const keyboard = this.createPortfolioKeyboard(
                messageData.tokens, 
                messageData.currentPage, 
                messageData.totalPages
            );

            return {
                text: messageData.text,
                keyboard: keyboard.reply_markup,
                hasTokens: messageData.hasTokens,
                totalPages: messageData.totalPages,
                currentPage: messageData.currentPage
            };
        } catch (error) {
            this.monitoring?.logError('Portfolio display generation failed', error);
            
            const { Markup } = require('telegraf');
            return {
                text: '❌ Failed to load portfolio. Please try again.',
                keyboard: Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Try Again', 'portfolio:refresh')],
                    [Markup.button.callback('🏠 Back to Main', 'main')]
                ]).reply_markup,
                hasTokens: false,
                totalPages: 0,
                currentPage: 1
            };
        }
    }

    /**
     * Clear portfolio cache
     */
    async clearPortfolioCache(telegramId) {
        if (!this.redis) return;

        try {
            const portfolioKey = this.getPortfolioKey(telegramId);
            await this.redis.del(portfolioKey);
            this.monitoring?.logInfo('Portfolio cache cleared', { telegramId });
        } catch (error) {
            this.monitoring?.logError('Portfolio cache clear failed', error);
        }
    }
}

module.exports = PortfolioService;
