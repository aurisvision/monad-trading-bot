const { Markup } = require('telegraf');

/**
 * Basic Inline Handlers for Area51 Trading Bot
 * Provides simple token search functionality
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

        console.log('✅ Basic inline handlers setup complete');
    }

    /**
     * Handle inline queries - basic token search
     */
    async handleInlineQuery(ctx) {
        try {
            const query = ctx.inlineQuery.query.trim();
            
            // If no query, return empty results
            if (!query || query.length < 2) {
                return await ctx.answerInlineQuery([]);
            }

            // Use basic search functionality
            await this.searchTokens(ctx, query);

        } catch (error) {
            this.monitoring?.logError('Inline query error', error, { query: ctx.inlineQuery?.query });
            await ctx.answerInlineQuery([]);
        }
    }

    /**
     * Basic token search functionality
     */
    async searchTokens(ctx, searchTerm) {
        try {
            // Use the correct MonorailAPI searchTokens method
            const searchResults = await this.monorailAPI.searchTokens(searchTerm);
            
            if (!searchResults?.success || !searchResults?.tokens || searchResults.tokens.length === 0) {
                return await ctx.answerInlineQuery([{
                    type: 'article',
                    id: 'no_results',
                    title: 'No tokens found',
                    description: `No results for "${searchTerm}"`,
                    input_message_content: {
                        message_text: `No tokens found for "${searchTerm}"`
                    }
                }]);
            }

            // Use the tokens from search results
            const tokens = searchResults.tokens.slice(0, 10);

            if (tokens.length === 0) {
                return await ctx.answerInlineQuery([{
                    type: 'article',
                    id: 'no_results',
                    title: '❌ No tokens found',
                    description: `No tokens found for "${searchTerm}"`,
                    input_message_content: {
                        message_text: `❌ No tokens found for "${searchTerm}"`
                    }
                }]);
            }

            // Create basic results
            const results = tokens.map((token, index) => ({
                type: 'article',
                id: `token_${token.address}_${index}`,
                title: `${token.symbol || 'Unknown'} - ${token.name || 'Unknown Token'}`,
                description: `Address: ${token.address?.slice(0, 10)}...`,
                input_message_content: {
                    message_text: `🪙 *${token.symbol || 'Unknown'}*\n📝 ${token.name || 'Unknown Token'}\n📍 \`${token.address}\``,
                    parse_mode: 'Markdown'
                }
            }));

            await ctx.answerInlineQuery(results);

        } catch (error) {
            this.monitoring?.logError('Search tokens error', error, { searchTerm });
            await ctx.answerInlineQuery([]);
        }
    }


}

module.exports = InlineHandlers;