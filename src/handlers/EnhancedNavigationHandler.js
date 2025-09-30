/**
 * Enhanced Navigation Handler
 * Uses BaseHandler and UserService to eliminate code duplication
 * 
 * SAFETY: This is a NEW handler that doesn't replace the existing one
 * The old navigationHandlers.js remains untouched
 */

const { Markup } = require('telegraf');
const BaseHandler = require('../core/BaseHandler');
const UserService = require('../services/UserService');
const InterfaceUtils = require('../utils/interfaceUtils');
const FreshDataFetcher = require("../utils/freshDataFetcher");

class EnhancedNavigationHandler extends BaseHandler {
    constructor(dependencies) {
        super(dependencies);
        
        // Initialize UserService
        this.userService = new UserService(
            this.database,
            this.cacheService,
            this.monitoring
        );
        
        // Additional dependencies specific to navigation
        this.welcomeHandler = dependencies.welcomeHandler;
        this.mainBot = dependencies.mainBot;
        
        // Handler-specific metrics
        this.navigationMetrics = {
            startCommands: 0,
            categoryViews: 0,
            refreshRequests: 0,
            transferRequests: 0
        };
    }

    /**
     * Setup all navigation handlers
     */
    setupHandlers() {
        if (!this.bot) return;

        // Start command
        this.bot.start(async (ctx) => {
            await this.handleStart(ctx);
        });

        // Main navigation handlers
        this.bot.action('start', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleStart(ctx);
        });

        this.bot.action('back_to_main', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleBackToMain(ctx);
        });

        this.bot.action('main', async (ctx) => {
            await ctx.answerCbQuery();
            await this.handleBackToMain(ctx);
        });

        // Categories handlers
        this.bot.action('token_categories', async (ctx) => {
            await this.showTokenCategories(ctx);
        });

        this.bot.action(/^category_(.+?)(?:_page_(\d+))?$/, async (ctx) => {
            await this.handleTokenCategory(ctx);
        });

        // Manual refresh handler
        this.bot.action('refresh', async (ctx) => {
            await this.handleManualRefresh(ctx);
        });

        // Transfer handler
        this.bot.action('transfer', async (ctx) => {
            await this.handleTransfer(ctx);
        });

        this.logInfo('Enhanced navigation handlers setup completed');
    }

    /**
     * Handle start command with enhanced error handling
     */
    async handleStart(ctx) {
        try {
            this.navigationMetrics.startCommands++;
            
            // Validate user and check access
            const { userId, user } = await this.validateUserAccess(ctx);
            
            // Track user activity
            await this.userService.trackUserActivity(userId);
            
            // Check if user is new
            if (!user) {
                return await this.showWelcomeNewUser(ctx);
            }

            // Show main menu
            await this.showWelcome(ctx);
            
        } catch (error) {
            if (error.message === 'User access denied') {
                return await this.handleAccessDenied(ctx);
            }
            
            this.logError('Failed to handle start command', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            
            await this.sendError(ctx, 
                '❌ Sorry, something went wrong. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle access denied scenario
     */
    async handleAccessDenied(ctx) {
        try {
            if (this.welcomeHandler?.showWelcomeNewUser) {
                await this.welcomeHandler.showWelcomeNewUser(ctx);
            } else {
                await ctx.reply(
                    '🔐 Access Required\n\nPlease provide your access code to continue.',
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔑 Enter Access Code', callback_data: 'request_access' }
                            ]]
                        }
                    }
                );
            }
        } catch (error) {
            this.logError('Failed to handle access denied', { error: error.message });
        }
    }

    /**
     * Show welcome for new users
     */
    async showWelcomeNewUser(ctx) {
        try {
            if (this.welcomeHandler?.showWelcomeNewUser) {
                await this.welcomeHandler.showWelcomeNewUser(ctx);
            } else {
                await this.sendError(ctx, 
                    '❌ Welcome handler not available. Please contact support.'
                );
            }
        } catch (error) {
            this.logError('Failed to show welcome for new user', { error: error.message });
            await this.sendError(ctx, 
                '❌ Unable to show welcome message. Please try again.'
            );
        }
    }

    /**
     * Get main menu data with enhanced caching
     */
    async getMainMenuData(ctx, fromCache = false, forceRefresh = false) {
        try {
            const { userId } = await this.validateUser(ctx);
            
            // Try cache first unless force refresh
            if (!forceRefresh) {
                const cached = await this.getCacheData('main_menu', userId);
                if (cached) {
                    return cached;
                }
            }

            // Get fresh data
            const user = await this.userService.getUser(userId);
            if (!user?.wallet_address) {
                return { error: 'No wallet found' };
            }

            // Fetch wallet data
            const walletData = await this.fetchWalletData(user.wallet_address);
            
            // Cache the result
            await this.setCacheData('main_menu', userId, walletData, 30); // 30 seconds cache
            
            return walletData;
            
        } catch (error) {
            this.logError('Failed to get main menu data', { 
                userId: ctx.from?.id, 
                error: error.message 
            });
            return { error: error.message };
        }
    }

    /**
     * Fetch wallet data using existing services
     */
    async fetchWalletData(walletAddress) {
        try {
            if (!this.monorailAPI) {
                throw new Error('MonorailAPI not available');
            }

            // Get wallet balance
            const balance = await this.monorailAPI.getWalletBalance(walletAddress);
            
            // Get portfolio data if available
            let portfolio = null;
            try {
                if (this.monorailAPI.getPortfolio) {
                    portfolio = await this.monorailAPI.getPortfolio(walletAddress);
                }
            } catch (portfolioError) {
                this.logWarn('Portfolio data not available', { 
                    walletAddress, 
                    error: portfolioError.message 
                });
            }

            return {
                walletAddress,
                balance,
                portfolio,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            this.logError('Failed to fetch wallet data', { 
                walletAddress, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Show welcome message with main menu
     */
    async showWelcome(ctx, fromCache = false, forceRefresh = false) {
        try {
            const menuData = await this.getMainMenuData(ctx, fromCache, forceRefresh);
            
            if (menuData.error) {
                return await this.sendError(ctx, 
                    `❌ Unable to load menu: ${menuData.error}`, 
                    true
                );
            }

            // Build welcome message
            const message = this.buildWelcomeMessage(menuData);
            const keyboard = this.buildMainMenuKeyboard();

            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
                await ctx.editMessageText(message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } else {
                await ctx.reply(message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
            
        } catch (error) {
            this.logError('Failed to show welcome', { error: error.message });
            await this.sendError(ctx, 
                '❌ Unable to load main menu. Please try again.', 
                true
            );
        }
    }

    /**
     * Build welcome message
     */
    buildWelcomeMessage(menuData) {
        const { balance, walletAddress } = menuData;
        
        let message = '🚀 <b>Area51 Trading Bot</b>\n\n';
        
        if (balance) {
            message += `💰 <b>Balance:</b> ${balance.formatted || 'Loading...'} MON\n`;
        }
        
        if (walletAddress) {
            const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
            message += `👛 <b>Wallet:</b> <code>${shortAddress}</code>\n\n`;
        }
        
        message += '📊 Choose an option below:';
        
        return message;
    }

    /**
     * Build main menu keyboard
     */
    buildMainMenuKeyboard() {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('💰 Buy', 'buy'),
                Markup.button.callback('💸 Portfolio', 'portfolio')
            ],
            [
                Markup.button.callback('📊 Categories', 'token_categories'),
                Markup.button.callback('👛 Wallet', 'wallet')
            ],
            [
                Markup.button.callback('⚙️ Settings', 'settings'),
                Markup.button.callback('🔄 Refresh', 'refresh')
            ],
            [
                Markup.button.callback('📤 Transfer', 'transfer')
            ]
        ]);
    }

    /**
     * Handle back to main menu
     */
    async handleBackToMain(ctx) {
        try {
            await this.showWelcome(ctx, false, true); // Force refresh
        } catch (error) {
            this.logError('Failed to handle back to main', { error: error.message });
            await this.sendError(ctx, 
                '❌ Unable to return to main menu. Please try /start', 
                false
            );
        }
    }

    /**
     * Show token categories
     */
    async showTokenCategories(ctx) {
        try {
            this.navigationMetrics.categoryViews++;
            
            await ctx.answerCbQuery();
            
            // Get categories from cache or API
            const categories = await this.getTokenCategories();
            
            if (!categories || categories.length === 0) {
                return await this.sendError(ctx, 
                    '❌ No token categories available at the moment.', 
                    true
                );
            }

            const message = '📊 <b>Token Categories</b>\n\nSelect a category to view tokens:';
            const keyboard = this.buildCategoriesKeyboard(categories);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            this.logError('Failed to show token categories', { error: error.message });
            await this.sendError(ctx, 
                '❌ Unable to load categories. Please try again.', 
                true
            );
        }
    }

    /**
     * Get token categories
     */
    async getTokenCategories() {
        try {
            // Try cache first
            const cached = await this.getCacheData('token_categories');
            if (cached) {
                return cached;
            }

            // Fetch from API or use default categories
            const categories = [
                { id: 'trending', name: '🔥 Trending', description: 'Hot tokens right now' },
                { id: 'new', name: '🆕 New Tokens', description: 'Recently launched' },
                { id: 'defi', name: '🏦 DeFi', description: 'Decentralized Finance' },
                { id: 'gaming', name: '🎮 Gaming', description: 'Gaming tokens' },
                { id: 'meme', name: '😂 Meme', description: 'Meme tokens' }
            ];

            // Cache for 5 minutes
            await this.setCacheData('token_categories', null, categories, 300);
            
            return categories;
            
        } catch (error) {
            this.logError('Failed to get token categories', { error: error.message });
            return [];
        }
    }

    /**
     * Build categories keyboard
     */
    buildCategoriesKeyboard(categories) {
        const buttons = categories.map(category => [
            Markup.button.callback(category.name, `category_${category.id}`)
        ]);
        
        buttons.push([
            Markup.button.callback('🏠 Main Menu', 'main')
        ]);
        
        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Handle token category selection
     */
    async handleTokenCategory(ctx) {
        try {
            const match = ctx.callbackQuery.data.match(/^category_(.+?)(?:_page_(\d+))?$/);
            if (!match) return;

            const categoryId = match[1];
            const page = parseInt(match[2]) || 1;

            await ctx.answerCbQuery();
            
            // Get tokens for category
            const tokens = await this.getTokensForCategory(categoryId, page);
            
            if (!tokens || tokens.length === 0) {
                return await this.sendError(ctx, 
                    '❌ No tokens found in this category.', 
                    true
                );
            }

            const message = this.buildCategoryMessage(categoryId, tokens, page);
            const keyboard = this.buildTokensKeyboard(tokens, categoryId, page);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
        } catch (error) {
            this.logError('Failed to handle token category', { error: error.message });
            await this.sendError(ctx, 
                '❌ Unable to load category tokens. Please try again.', 
                true
            );
        }
    }

    /**
     * Get tokens for category
     */
    async getTokensForCategory(categoryId, page = 1) {
        try {
            const cacheKey = `category_tokens_${categoryId}_${page}`;
            
            // Try cache first
            const cached = await this.getCacheData(cacheKey);
            if (cached) {
                return cached;
            }

            // Mock data for now - replace with actual API call
            const mockTokens = [
                { address: '0x123...', symbol: 'TOKEN1', name: 'Test Token 1', price: '$0.001' },
                { address: '0x456...', symbol: 'TOKEN2', name: 'Test Token 2', price: '$0.002' },
                { address: '0x789...', symbol: 'TOKEN3', name: 'Test Token 3', price: '$0.003' }
            ];

            // Cache for 2 minutes
            await this.setCacheData(cacheKey, null, mockTokens, 120);
            
            return mockTokens;
            
        } catch (error) {
            this.logError('Failed to get tokens for category', { 
                categoryId, 
                page, 
                error: error.message 
            });
            return [];
        }
    }

    /**
     * Build category message
     */
    buildCategoryMessage(categoryId, tokens, page) {
        const categoryName = categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
        
        let message = `📊 <b>${categoryName} Tokens</b>\n\n`;
        
        tokens.forEach((token, index) => {
            const number = (page - 1) * 10 + index + 1;
            message += `${number}. <b>${token.symbol}</b> - ${token.price}\n`;
            message += `   ${token.name}\n\n`;
        });
        
        return message;
    }

    /**
     * Build tokens keyboard
     */
    buildTokensKeyboard(tokens, categoryId, page) {
        const buttons = tokens.map(token => [
            Markup.button.callback(
                `💰 Buy ${token.symbol}`, 
                `buy_token_${token.address}`
            )
        ]);
        
        // Add navigation buttons
        const navButtons = [];
        if (page > 1) {
            navButtons.push(
                Markup.button.callback('⬅️ Previous', `category_${categoryId}_page_${page - 1}`)
            );
        }
        navButtons.push(
            Markup.button.callback('➡️ Next', `category_${categoryId}_page_${page + 1}`)
        );
        
        if (navButtons.length > 0) {
            buttons.push(navButtons);
        }
        
        buttons.push([
            Markup.button.callback('📊 Categories', 'token_categories'),
            Markup.button.callback('🏠 Main Menu', 'main')
        ]);
        
        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Handle manual refresh
     */
    async handleManualRefresh(ctx) {
        try {
            this.navigationMetrics.refreshRequests++;
            
            await ctx.answerCbQuery('🔄 Refreshing...');
            
            // Clear user cache
            const { userId } = await this.validateUser(ctx);
            await this.userService.refreshUserCache(userId);
            
            // Show updated welcome
            await this.showWelcome(ctx, false, true);
            
        } catch (error) {
            this.logError('Failed to handle manual refresh', { error: error.message });
            await this.sendError(ctx, 
                '❌ Unable to refresh. Please try again.', 
                true
            );
        }
    }

    /**
     * Handle transfer request
     */
    async handleTransfer(ctx) {
        try {
            this.navigationMetrics.transferRequests++;
            
            await ctx.answerCbQuery();
            
            // Check if user has wallet
            const { userId } = await this.validateUser(ctx);
            const user = await this.userService.getUser(userId);
            
            if (!user?.wallet_address) {
                return await this.sendError(ctx, 
                    '❌ No wallet found. Please create a wallet first.', 
                    false
                );
            }

            // Set state for transfer
            await this.userService.setUserState(userId, 'waiting_for_transfer_address');
            
            const message = '📤 <b>Transfer Tokens</b>\n\n' +
                           'Please send the recipient wallet address:';
            
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'main')]
                ])
            });
            
        } catch (error) {
            this.logError('Failed to handle transfer', { error: error.message });
            await this.sendError(ctx, 
                '❌ Unable to start transfer. Please try again.', 
                true
            );
        }
    }

    /**
     * Get enhanced metrics
     */
    getEnhancedMetrics() {
        return {
            ...this.getMetrics(),
            navigation: this.navigationMetrics,
            userService: this.userService.getMetrics(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Enhanced health check
     */
    async healthCheck() {
        try {
            const baseHealth = await super.healthCheck();
            const userServiceHealth = await this.userService.healthCheck();
            
            return {
                status: baseHealth.status === 'healthy' && userServiceHealth.status === 'healthy' 
                    ? 'healthy' : 'unhealthy',
                components: {
                    base: baseHealth,
                    userService: userServiceHealth
                },
                metrics: this.getEnhancedMetrics(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = EnhancedNavigationHandler;