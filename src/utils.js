const { ethers } = require('ethers');

// Format wallet address for display
function formatAddress(address, startChars = 6, endChars = 4) {
    if (!address) return '';
    if (address.length <= startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

// Format balance for display
function formatBalance(balance, decimals = 6) {
    if (!balance) return '0.00';
    const num = parseFloat(balance);
    if (num === 0) return '0.00';
    if (num < 0.000001) return '<0.000001';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toFixed(decimals);
}

// Format USD value
function formatUSD(value) {
    if (!value) return '$0.00';
    const num = parseFloat(value);
    if (num === 0) return '$0.00';
    if (num < 0.01) return '<$0.01';
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
}

// Format percentage
function formatPercentage(percent) {
    if (!percent || percent === '∞') return percent;
    const num = parseFloat(percent);
    if (num === 0) return '0.00%';
    const sign = num >= 0 ? '+' : '';
    return sign + num.toFixed(2) + '%';
}

// Validate Ethereum address
function validateAddress(address) {
    return ethers.isAddress(address);
}

// Validate amount input
function validateAmount(amount) {
    if (!amount) return { valid: false, error: 'Amount is required' };
    
    const num = parseFloat(amount);
    if (isNaN(num)) return { valid: false, error: 'Invalid amount format' };
    if (num <= 0) return { valid: false, error: 'Amount must be greater than 0' };
    if (num > 1000000) return { valid: false, error: 'Amount too large' };
    
    return { valid: true };
}

// Validate slippage
function validateSlippage(slippage) {
    if (!slippage) return { valid: false, error: 'Slippage is required' };
    
    const num = parseFloat(slippage);
    if (isNaN(num)) return { valid: false, error: 'Invalid slippage format' };
    if (num < 0.1) return { valid: false, error: 'Slippage too low (minimum 0.1%)' };
    if (num > 50) return { valid: false, error: 'Slippage too high (maximum 50%)' };
    
    return { valid: true };
}

// Parse token amount with decimals
function parseTokenAmount(amount, decimals = 18) {
    try {
        return ethers.parseUnits(amount.toString(), decimals);
    } catch (error) {
        throw new Error('Invalid token amount');
    }
}

// Format token amount from wei
function formatTokenAmount(amount, decimals = 18, displayDecimals = 6) {
    try {
        const formatted = ethers.formatUnits(amount, decimals);
        return parseFloat(formatted).toFixed(displayDecimals);
    } catch (error) {
        return '0';
    }
}

// Calculate price impact color and emoji
function getPriceImpactDisplay(priceImpact) {
    if (!priceImpact) return { emoji: '⚪', color: 'neutral' };
    
    const impact = parseFloat(priceImpact);
    if (impact < 1) return { emoji: '🟢', color: 'green' };
    if (impact < 3) return { emoji: '🟡', color: 'yellow' };
    if (impact < 5) return { emoji: '🟠', color: 'orange' };
    return { emoji: '🔴', color: 'red' };
}

// Get P&L display emoji and formatting
function getPnLDisplay(pnl, pnlPercent) {
    const pnlNum = parseFloat(pnl);
    const percentNum = parseFloat(pnlPercent);
    
    if (pnlNum > 0) {
        return {
            emoji: '🟢',
            color: 'green',
            sign: '+',
            formatted: `+${formatBalance(pnl)} MON (${formatPercentage(pnlPercent)})`
        };
    } else if (pnlNum < 0) {
        return {
            emoji: '🔴',
            color: 'red',
            sign: '',
            formatted: `${formatBalance(pnl)} MON (${formatPercentage(pnlPercent)})`
        };
    } else {
        return {
            emoji: '⚪',
            color: 'neutral',
            sign: '',
            formatted: `${formatBalance(pnl)} MON (${formatPercentage(pnlPercent)})`
        };
    }
}

// Escape markdown special characters
function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// Generate random string for temporary data
function generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Sleep function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Format time duration
function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Get transaction explorer URL
function getExplorerUrl(txHash, type = 'tx') {
    const baseUrl = 'https://testnet.monadexplorer.com'; // Correct Monad testnet explorer
    return `${baseUrl}/${type}/${txHash}`;
}

// Truncate text with ellipsis
function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

// Parse custom amounts from settings
function parseCustomAmounts(amountsString) {
    try {
        return amountsString.split(',').map(amount => parseFloat(amount.trim())).filter(amount => amount > 0);
    } catch (error) {
        return [0.1, 0.5, 1, 5]; // Default amounts
    }
}

// Parse custom percentages from settings
function parseCustomPercentages(percentagesString) {
    try {
        return percentagesString.split(',').map(percent => parseInt(percent.trim())).filter(percent => percent > 0 && percent <= 100);
    } catch (error) {
        return [25, 50, 75, 100]; // Default percentages
    }
}

// Check if string is a valid number
function isValidNumber(str) {
    return !isNaN(str) && !isNaN(parseFloat(str));
}

// Format gas price for display
function formatGasPrice(gasPrice) {
    try {
        const gwei = ethers.formatUnits(gasPrice, 'gwei');
        return parseFloat(gwei).toFixed(2) + ' Gwei';
    } catch (error) {
        return 'Unknown';
    }
}

// Calculate estimated transaction cost
function calculateTxCost(gasLimit, gasPrice) {
    try {
        const cost = BigInt(gasLimit) * BigInt(gasPrice);
        return ethers.formatEther(cost);
    } catch (error) {
        return '0';
    }
}

module.exports = {
    formatAddress,
    formatBalance,
    formatUSD,
    formatPercentage,
    validateAddress,
    validateAmount,
    validateSlippage,
    parseTokenAmount,
    formatTokenAmount,
    getPriceImpactDisplay,
    getPnLDisplay,
    escapeMarkdown,
    generateRandomString,
    sleep,
    formatDuration,
    getExplorerUrl,
    truncateText,
    parseCustomAmounts,
    parseCustomPercentages,
    isValidNumber,
    formatGasPrice,
    calculateTxCost
};
