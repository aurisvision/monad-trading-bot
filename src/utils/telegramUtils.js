// Centralized Telegram utilities to reduce duplicate imports
const { Markup } = require('telegraf');

class TelegramUtils {
    /**
     * Create inline keyboard with buttons
     * @param {Array} buttons - Array of button rows
     * @returns {Object} Markup keyboard
     */
    static createInlineKeyboard(buttons) {
        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Create callback button
     * @param {string} text - Button text
     * @param {string} callback - Callback data
     * @returns {Object} Button object
     */
    static createButton(text, callback) {
        return Markup.button.callback(text, callback);
    }

    /**
     * Create URL button
     * @param {string} text - Button text
     * @param {string} url - URL to open
     * @returns {Object} Button object
     */
    static createUrlButton(text, url) {
        return Markup.button.url(text, url);
    }

    /**
     * Create standard back button
     * @param {string} callback - Back callback data
     * @returns {Array} Button row with back button
     */
    static createBackButton(callback = 'main_menu') {
        return [this.createButton('🔙 Back', callback)];
    }

    /**
     * Create pagination buttons
     * @param {number} currentPage - Current page number
     * @param {number} totalPages - Total number of pages
     * @param {string} prefix - Callback prefix for pagination
     * @returns {Array} Button row with pagination
     */
    static createPaginationButtons(currentPage, totalPages, prefix) {
        const buttons = [];
        
        if (currentPage > 1) {
            buttons.push(this.createButton('⬅️ Previous', `${prefix}_${currentPage - 1}`));
        }
        
        buttons.push(this.createButton(`${currentPage}/${totalPages}`, 'noop'));
        
        if (currentPage < totalPages) {
            buttons.push(this.createButton('Next ➡️', `${prefix}_${currentPage + 1}`));
        }
        
        return buttons;
    }

    /**
     * Escape markdown special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    static escapeMarkdown(text) {
        if (!text) return '';
        return text.toString().replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    /**
     * Format number with commas
     * @param {number} num - Number to format
     * @param {number} decimals - Number of decimal places
     * @returns {string} Formatted number
     */
    static formatNumber(num, decimals = 2) {
        if (isNaN(num)) return '0';
        return parseFloat(num).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    /**
     * Create loading message
     * @param {string} action - Action being performed
     * @returns {string} Loading message
     */
    static createLoadingMessage(action = 'Processing') {
        return `⏳ ${action}...`;
    }

    /**
     * Create success message
     * @param {string} message - Success message
     * @returns {string} Formatted success message
     */
    static createSuccessMessage(message) {
        return `✅ ${message}`;
    }

    /**
     * Create error message
     * @param {string} message - Error message
     * @returns {string} Formatted error message
     */
    static createErrorMessage(message) {
        return `❌ ${message}`;
    }
}

module.exports = TelegramUtils;
