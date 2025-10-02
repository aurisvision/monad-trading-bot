const { Markup } = require('telegraf');

/**
 * Simple Inline Handlers for Area51 Trading Bot
 * Basic inline search functionality only
 */
class InlineHandlers {
    constructor(bot, dependencies) {
        this.bot = bot;
        this.database = dependencies.database;
        this.monorailAPI = dependencies.monorailAPI;
        this.monitoring = dependencies.monitoring;
        this.redis = dependencies.redis;
        this.cacheService = dependencies.cacheService;
    }

    /**
     * Setup inline handlers
     */
    setupHandlers() {
        // Main inline query handler
        this.bot.on('inline_query', async (ctx) => {
            await this.handleInlineQuery(ctx);
        });

        console.log('✅ Inline handlers setup complete');
    }

    /**
     * Handle inline queries - simple search only
     */
    async handleInlineQuery(ctx) {
        try {
            const query = ctx.inlineQuery.query.trim();

            // If no query, show empty results
            if (!query || query.length < 2) {
                return await ctx.answerInlineQuery([]);
            }

            // Simple token search
            await this.searchTokens(ctx, query);

        } catch (error) {
            console.error('Inline query error:', error);
            await ctx.answerInlineQuery([]);
        }
    }

    /**
     * Simple token search
     */
    async searchTokens(ctx, query) {
        try {
            // Get tokens from API
            const response = await this.monorailAPI.get('/tokens');
            if (!response?.data?.tokens) {
                return await ctx.answerInlineQuery([]);
            }

            // Filter tokens by query
            const tokens = response.data.tokens.filter(token => 
                token.symbol?.toLowerCase().includes(query.toLowerCase()) ||
                token.name?.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10);

            // Create results
            const results = tokens.map((token, index) => ({
                type: 'article',
                id: `token_${index}`,
                title: `${token.symbol || 'Unknown'} - ${token.name || 'Unknown Token'}`,
                description: `Address: ${token.address?.slice(0, 10)}...`,
                input_message_content: {
                    message_text: `Token: ${token.symbol}\nName: ${token.name}\nAddress: ${token.address}`
                }
            }));

            await ctx.answerInlineQuery(results);

        } catch (error) {
            console.error('Token search error:', error);
            await ctx.answerInlineQuery([]);
        }
    }
}

module.exports = InlineHandlers;