/**
 * Input Validation Utility for Area51 Telegram Bot
 * Provides comprehensive validation for all user inputs
 */

class InputValidator {
    /**
     * Validate Ethereum address format
     * @param {string} address - The address to validate
     * @returns {boolean} - True if valid Ethereum address
     */
    static isValidEthereumAddress(address) {
        if (!address || typeof address !== 'string') return false;
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Validate token amount
     * @param {string|number} amount - The amount to validate
     * @param {number} maxDecimals - Maximum decimal places allowed
     * @returns {object} - Validation result with isValid and parsed value
     */
    static validateTokenAmount(amount, maxDecimals = 18) {
        try {
            if (!amount && amount !== 0) {
                return { isValid: false, error: 'Amount is required' };
            }

            const numAmount = parseFloat(amount);
            
            if (isNaN(numAmount)) {
                return { isValid: false, error: 'Amount must be a valid number' };
            }

            if (numAmount <= 0) {
                return { isValid: false, error: 'Amount must be greater than 0' };
            }

            if (numAmount > 1e18) {
                return { isValid: false, error: 'Amount too large' };
            }

            // Check decimal places
            const decimalPlaces = (amount.toString().split('.')[1] || '').length;
            if (decimalPlaces > maxDecimals) {
                return { isValid: false, error: `Maximum ${maxDecimals} decimal places allowed` };
            }

            return { isValid: true, value: numAmount };
        } catch (error) {
            return { isValid: false, error: 'Invalid amount format' };
        }
    }

    /**
     * Validate slippage percentage
     * @param {string|number} slippage - The slippage to validate
     * @returns {object} - Validation result
     */
    static validateSlippage(slippage) {
        const validation = this.validateTokenAmount(slippage, 2);
        if (!validation.isValid) return validation;

        if (validation.value < 0.1 || validation.value > 50) {
            return { isValid: false, error: 'Slippage must be between 0.1% and 50%' };
        }

        return validation;
    }

    /**
     * Validate gas price in Gwei
     * @param {string|number} gasPrice - The gas price to validate
     * @returns {object} - Validation result
     */
    static validateGasPrice(gasPrice) {
        const validation = this.validateTokenAmount(gasPrice, 2);
        if (!validation.isValid) return validation;

        if (validation.value < 1 || validation.value > 1000) {
            return { isValid: false, error: 'Gas price must be between 1 and 1000 Gwei' };
        }

        return validation;
    }

    /**
     * Validate percentage value
     * @param {string|number} percentage - The percentage to validate
     * @returns {object} - Validation result
     */
    static validatePercentage(percentage) {
        const validation = this.validateTokenAmount(percentage, 2);
        if (!validation.isValid) return validation;

        if (validation.value < 0 || validation.value > 100) {
            return { isValid: false, error: 'Percentage must be between 0 and 100' };
        }

        return validation;
    }

    /**
     * Sanitize user input to prevent injection attacks
     * @param {string} input - The input to sanitize
     * @returns {string} - Sanitized input
     */
    static sanitizeInput(input) {
        if (!input || typeof input !== 'string') return '';
        
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/['"]/g, '') // Remove quotes
            .replace(/[\\]/g, '') // Remove backslashes
            .trim()
            .substring(0, 1000); // Limit length
    }

    /**
     * Validate telegram user ID
     * @param {number|string} userId - The user ID to validate
     * @returns {boolean} - True if valid user ID
     */
    static isValidTelegramUserId(userId) {
        const numId = parseInt(userId);
        return !isNaN(numId) && numId > 0 && numId < 2147483647;
    }

    /**
     * Validate custom buy amounts input
     * @param {string} input - Comma-separated amounts
     * @returns {object} - Validation result with parsed amounts
     */
    static validateCustomBuyAmounts(input) {
        try {
            const sanitized = this.sanitizeInput(input);
            const amounts = sanitized.split(',').map(a => a.trim());
            
            if (amounts.length === 0 || amounts.length > 10) {
                return { isValid: false, error: 'Please provide 1-10 amounts' };
            }

            const validatedAmounts = [];
            for (const amount of amounts) {
                const validation = this.validateTokenAmount(amount);
                if (!validation.isValid) {
                    return { isValid: false, error: `Invalid amount "${amount}": ${validation.error}` };
                }
                validatedAmounts.push(validation.value);
            }

            return { isValid: true, amounts: validatedAmounts };
        } catch (error) {
            return { isValid: false, error: 'Invalid format. Use comma-separated numbers' };
        }
    }

    /**
     * Validate custom sell percentages input
     * @param {string} input - Comma-separated percentages
     * @returns {object} - Validation result with parsed percentages
     */
    static validateCustomSellPercentages(input) {
        try {
            const sanitized = this.sanitizeInput(input);
            const percentages = sanitized.split(',').map(p => p.trim());
            
            if (percentages.length === 0 || percentages.length > 10) {
                return { isValid: false, error: 'Please provide 1-10 percentages' };
            }

            const validatedPercentages = [];
            let totalPercentage = 0;

            for (const percentage of percentages) {
                const validation = this.validatePercentage(percentage);
                if (!validation.isValid) {
                    return { isValid: false, error: `Invalid percentage "${percentage}": ${validation.error}` };
                }
                validatedPercentages.push(validation.value);
                totalPercentage += validation.value;
            }

            if (totalPercentage > 100) {
                return { isValid: false, error: 'Total percentages cannot exceed 100%' };
            }

            return { isValid: true, percentages: validatedPercentages };
        } catch (error) {
            return { isValid: false, error: 'Invalid format. Use comma-separated percentages' };
        }
    }
}

module.exports = InputValidator;
