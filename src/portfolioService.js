class PortfolioService {
    constructor(monorailAPI, redis, monitoring) {
        this.monorailAPI = monorailAPI;
        this.redis = redis;
        this.monitoring = monitoring;
        this.CACHE_TTL = 120; // 2 minutes
        this.TOKENS_PER_PAGE = 3;
        this.MIN_VALUE_THRESHOLD = 0.001; // Minimum MON value to show token (0.001 MON)
    }

    /**
     * Get portfolio key for Redis
     */
    getPortfolioKey(telegramId) {
        return `user:${telegramId}:portfolio`;
    }

    /**
     * Clear user portfolio cache
     */
    async clearUserPortfolioCache(telegramId) {
        try {
            const key = this.getPortfolioKey(telegramId);
            await this.redis.del(key);
            console.log(`🗑️ Portfolio cache cleared for user ${telegramId}`);
        } catch (error) {
            console.error('Error clearing portfolio cache:', error);
        }
    }

    /**
     * Fetch portfolio from Monorail API and filter data
     */
    async fetchPortfolioFromAPI(walletAddress) {
        try {
            const response = await this.monorailAPI.getWalletBalance(walletAddress, true);
            
            if (!response || !Array.isArray(response)) {
                throw new Error('Invalid API response');
            }

            // Filter and transform tokens
            const filteredTokens = response
                .filter(token => {
                    // Exclude MON (native coin with address 0x000...000)
                    const isNotMON = token.address !== '0x0000000000000000000000000000000000000000';
                    // Only include tokens with meaningful balance
                    const hasBalance = parseFloat(token.balance || '0') > 0;
                    // Check if token value meets minimum threshold
                    const monValue = parseFloat(token.mon_value || '0');
                    const meetsThreshold = monValue >= this.MIN_VALUE_THRESHOLD;
                    
                    return isNotMON && hasBalance && meetsThreshold;
                })
                .map(token => ({
                    symbol: token.symbol,
                    name: token.name,
                    balance: token.balance,
                    mon_value: token.mon_value || '0',
                    usd_price: token.usd_per_token || token.priceUSD || null,
                    address: token.address,
                    last_updated: Date.now()
                }));

            return filteredTokens;
        } catch (error) {
            this.monitoring?.logError('Portfolio API fetch failed', error);
            throw error;
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
            // Try cache first unless force refresh
            if (!forceRefresh) {
                const cachedPortfolio = await this.getPortfolioFromRedis(telegramId);
                if (cachedPortfolio && cachedPortfolio.length > 0) {
                    this.monitoring?.logInfo('Portfolio loaded from cache', { telegramId });
                    return cachedPortfolio;
                }
            }

            // Fetch from API
            this.monitoring?.logInfo('Fetching portfolio from API', { telegramId, walletAddress });
            const tokens = await this.fetchPortfolioFromAPI(walletAddress);

            // Store in cache
            await this.storePortfolioInRedis(telegramId, tokens);

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
                text: `📊 Portfolio\n\n_No tokens found in your portfolio._`,
                hasTokens: false,
                totalPages: 0,
                currentPage: page
            };
        }

        let message = `📊 Portfolio\n\n`;

        pageTokens.forEach(token => {
            const balance = parseFloat(token.balance || '0').toFixed(6);
            const monValue = parseFloat(token.mon_value || '0').toFixed(4);
            const usdPrice = token.usd_price || null;
            
            message += `🟣 ${token.symbol} (${token.name})\n`;
            message += `• Balance: ${balance} ${token.symbol}\n`;
            message += `• Value in MON: ${monValue}\n`;
            
            if (usdPrice !== null && usdPrice > 0) {
                message += `• Price: ${this.formatPrice(usdPrice)}\n\n`;
            } else {
                message += `• Price: $0.00000\n\n`;
            }
        });

        // Add pagination info if multiple pages
        if (totalPages > 1) {
            message += `📄 Page ${page} of ${totalPages}\n\n`;
        }

        // Add last updated timestamp
        const now = new Date();
        const timeString = now.toLocaleTimeString('ar-EG', { 
            hour12: true,
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
        message += `⏱️ Last updated: ${timeString}`;

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

        // Add sell buttons for tokens (2 in first row, 1 in second row for 3 tokens per page)
        if (tokens && tokens.length > 0) {
            // First row: 2 tokens
            if (tokens.length >= 2) {
                buttons.push([
                    Markup.button.callback(`Sell ${tokens[0].symbol}`, `sell:${tokens[0].symbol}`),
                    Markup.button.callback(`Sell ${tokens[1].symbol}`, `sell:${tokens[1].symbol}`)
                ]);
            } else if (tokens.length === 1) {
                buttons.push([
                    Markup.button.callback(`Sell ${tokens[0].symbol}`, `sell:${tokens[0].symbol}`)
                ]);
            }
            
            // Second row: 1 token (if exists)
            if (tokens.length === 3) {
                buttons.push([
                    Markup.button.callback(`Sell ${tokens[2].symbol}`, `sell:${tokens[2].symbol}`)
                ]);
            }
        }

        // Add navigation buttons
        const navButtons = [];
        
        if (totalPages > 1) {
            if (currentPage > 1) {
                navButtons.push(Markup.button.callback('⏮️ Prev', `portfolio:page:${currentPage - 1}`));
            }
            if (currentPage < totalPages) {
                navButtons.push(Markup.button.callback('Next ⏭️', `portfolio:page:${currentPage + 1}`));
            }
        }

        if (navButtons.length > 0) {
            buttons.push(navButtons);
        }

        // Add refresh button
        buttons.push([Markup.button.callback('🔄 Refresh', 'portfolio:refresh')]);

        // Add back button
        buttons.push([Markup.button.callback('🔙 Back to Main', 'main')]);

        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Get portfolio display data
     */
    async getPortfolioDisplay(telegramId, walletAddress, page = 1, forceRefresh = false) {
        try {
            const tokens = await this.getUserPortfolio(telegramId, walletAddress, forceRefresh);
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
            
            return {
                text: '❌ Failed to load portfolio. Please try again.',
                keyboard: Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Try Again', 'portfolio:refresh')],
                    [Markup.button.callback('🔙 Back to Main', 'main')]
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
