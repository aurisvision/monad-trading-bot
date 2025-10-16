const UnifiedCacheManager = require('./UnifiedCacheManager');

class PortfolioService {
    constructor(monorailAPI, redis, monitoring, blockVisionAPI = null) {
        this.monorailAPI = monorailAPI; // Keep for fallback
        this.blockVisionAPI = blockVisionAPI || new (require('../services/BlockVisionAPI'))(null, monitoring); // Use provided or create new
        this.redis = redis;
        this.monitoring = monitoring;
        this.cache = new UnifiedCacheManager(redis, monitoring);
        
        // Pass cache service to BlockVision if not already set
        if (!this.blockVisionAPI.cacheService) {
            this.blockVisionAPI.cacheService = this.cache;
        }
        
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
     * Fetch portfolio from BlockVision API only - no fallback to Monorail
     */
    async fetchPortfolioFromAPI(walletAddress) {
        try {
            // Use BlockVision API exclusively for portfolio data
            this.monitoring?.logInfo('Fetching portfolio from BlockVision API (exclusive)', { walletAddress });
            
            let tokens = await this.blockVisionAPI.getWalletBalance(walletAddress, false);
            
            // If BlockVision fails or returns empty, return empty array (no Monorail fallback)
            if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
                this.monitoring?.logInfo('BlockVision returned empty or invalid data - no fallback used', { walletAddress, tokens });
                return [];
            }
            
            this.monitoring?.logInfo('Portfolio data fetched successfully from BlockVision', { 
                walletAddress, 
                tokenCount: tokens.length 
            });
            
            // Filter and transform tokens for portfolio display
            // Use same filtering logic as working token-viewer.js: usdValue > 0 && verified
            // Also exclude MON token from portfolio display (it shows in main menu)
            const filteredTokens = tokens
                .filter(token => {
                    const usdValue = parseFloat(token.usd_value || 0);
                    const verified = token.verified || false;
                    const isNotMON = token.symbol !== 'MON'; // Exclude MON token
                    return usdValue > 0 && verified && isNotMON;
                })
                .map(token => ({
                    symbol: token.symbol,
                    name: token.name,
                    balance: token.balance,
                    mon_value: token.mon_value || '0',
                    usd_value: token.usd_value || 0,
                    usd_price: token.price || token.usd_per_token || token.priceUSD || null,
                    address: token.address,
                    verified: token.verified || false,
                    price_change_24h: token.price_change_24h || null,
                    market_cap: token.market_cap || null,
                    volume_24h: token.volume_24h || null,
                    logo: token.logo || null,
                    last_updated: Date.now()
                }));

            this.monitoring?.logInfo('Portfolio fetched successfully', { 
                walletAddress, 
                tokenCount: filteredTokens.length,
                source: 'BlockVision' // Portfolio data exclusively from BlockVision
            });

            return filteredTokens;
        } catch (error) {
            this.monitoring?.logError('Portfolio API fetch failed', error);
            return [];
        }
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
            this.monitoring?.logInfo('Fetching portfolio from API', { telegramId, walletAddress });
            const tokens = await this.fetchPortfolioFromAPI(walletAddress);

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
            const priceChange24h = token.price_change_24h;
            const verified = token.verified;
            
            // Token header with verification badge and clickable link
            const verifiedBadge = verified ? '✅' : '';
            const sellLink = `https://t.me/MonAreaBot?start=sellToken-${token.address}`;
            
            // Use HTML formatting for bold text within links
            message += `🟣 <a href="${sellLink}"><b>${token.symbol} ${verifiedBadge} (${token.name})</b></a>\n`;
            
            message += `• <b>Balance:</b> ${balance} ${token.symbol}\n`;
            message += `• <b>Value in MON:</b> ${monValue}\n`;
            
            // Price with 24h change in same line
            if (usdPrice !== null && usdPrice > 0) {
                let priceText = `• <b>Price:</b> ${this.formatPrice(usdPrice)}`;
                
                // Add 24h change to same line if available
                if (priceChange24h !== null && priceChange24h !== undefined) {
                    const changePercent = parseFloat(priceChange24h);
                    if (!isNaN(changePercent)) {
                        const changeSquare = changePercent >= 0 ? '🟢' : '🔴';
                        const changeSign = changePercent >= 0 ? '+' : '';
                        priceText += ` ${changeSquare} ${changeSign}${changePercent.toFixed(2)}%`;
                    }
                }
                
                message += `${priceText}\n\n`;
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
                    text: `📊 **Portfolio**\n\n_No tokens found in your portfolio._\n\n_🕒 Last updated: ${new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit' })}_`,
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
