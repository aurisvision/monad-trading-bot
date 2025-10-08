/**
 * Professional Message Formatter for Trading Operations
 * Provides rich, consistent, and professional message formatting
 * Supports real-time updates and WebSocket integration
 */

class ProfessionalMessageFormatter {
    constructor() {
        this.explorerBaseUrl = 'https://testnet.monadexplorer.com';
        this.brandEmojis = {
            logo: '🟣',
            success: '✅',
            error: '❌',
            warning: '⚠️',
            loading: '⏳',
            money: '💰',
            chart: '📊',
            rocket: '🚀',
            fire: '🔥',
            diamond: '💎',
            target: '🎯',
            clock: '⏰',
            link: '🔗',
            shield: '🛡️'
        };
    }

    /**
     * Format Buy Success Message
     */
    formatBuySuccess(data) {
        const {
            tokenSymbol,
            tokenName,
            tokenAddress,
            monAmount,
            tokenAmount,
            txHash,
            priceImpact,
            gasUsed,
            timestamp,
            dexName = 'Monorail',
            price,
            liquidity,
            marketCap
        } = data;

        const explorerUrl = `${this.explorerBaseUrl}/tx/${txHash}`;
        const tokenUrl = `${this.explorerBaseUrl}/token/${tokenAddress}`;
        const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return `Buy $${tokenSymbol} — (${tokenSymbol}) 📈 [${tokenUrl}](${tokenUrl})
${this.truncateAddress(tokenAddress)}

Balance: ${monAmount} MON — W1 ✏️
Price: $${price || '0.00'} — LIQ: $${liquidity || '0'} — MC: $${marketCap || '0'}

🟢 Fetched Quote (${dexName})
${monAmount} MON ($${(parseFloat(monAmount) * (price || 0)).toFixed(2)}) ⇄ ${this.formatNumber(tokenAmount)} ${tokenSymbol} ($${(parseFloat(tokenAmount) * (price || 0)).toFixed(2)})
Price Impact: ${priceImpact || '0.00'}%

🟢 Buy Success! [View on Explorer](${explorerUrl})`;
    }

    /**
     * Format Sell Success Message
     */
    formatSellSuccess(data) {
        const {
            tokenSymbol,
            tokenName,
            tokenAddress,
            tokenAmount,
            monReceived,
            txHash,
            priceImpact,
            gasUsed,
            timestamp,
            dexName = 'Monorail',
            price,
            liquidity,
            marketCap,
            balance,
            change24h,
            walletNumber = 'W1'
        } = data;

        const explorerUrl = `${this.explorerBaseUrl}/tx/${txHash}`;
        const tokenUrl = `${this.explorerBaseUrl}/token/${tokenAddress}`;
        const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return `Sell $${tokenSymbol} — (${tokenSymbol}) 📈 [${tokenUrl}](${tokenUrl})
${this.truncateAddress(tokenAddress)}

Balance: ${this.formatNumber(balance || tokenAmount)} ${tokenSymbol} — ${walletNumber} ✏️
Price: $${price || '0.00'} — LIQ: $${liquidity || '0'} — MC: $${marketCap || '0'}
${change24h ? `24h: ${change24h}%` : ''}

🟢 Fetched Quote (${dexName})
${this.formatNumber(tokenAmount)} ${tokenSymbol} ($${(parseFloat(tokenAmount) * (price || 0)).toFixed(2)}) ⇄ ${monReceived} MON ($${(parseFloat(monReceived) * 1).toFixed(2)})
Price Impact: ${priceImpact || '0.00'}%

🟢 Sell Success! [View on Explorer](${explorerUrl})`;
    }

    /**
     * Format Quote Message (like reference bot)
     */
    formatQuote(data) {
        const {
            fromAmount,
            fromSymbol,
            toAmount,
            toSymbol,
            dex,
            priceImpact,
            fromValue,
            toValue
        } = data;

        const switchUrl = `https://t.me/monad_area51_bot?start=switch${data.operation === 'buy' ? 'ToSell' : 'ToBuy'}`;

        return `🟢 Fetched Quote (${dex})
${fromAmount} ${fromSymbol} ($${fromValue}) ⇄ [🔄](${switchUrl}) ${toAmount} ${toSymbol} ($${toValue})
Price Impact: ${priceImpact}%`;
    }

    /**
     * Format Initial Trading Message (before execution)
     */
    formatTradingMessage(data) {
        const {
            operation, // 'buy' or 'sell'
            tokenSymbol,
            tokenName,
            tokenAddress,
            balance,
            price,
            liquidity,
            marketCap,
            change24h,
            walletNumber = 'W1',
            isRenounced = false
        } = data;

        const operationText = operation === 'buy' ? 'Buy' : 'Sell';
        const tokenUrl = `${this.explorerBaseUrl}/token/${tokenAddress}`;
        const balanceText = operation === 'buy' ? 
            `${balance} MON` : 
            `${this.formatNumber(balance)} ${tokenSymbol}`;

        return `${operationText} $${tokenSymbol} — (${tokenSymbol}) 📈 [${tokenUrl}](${tokenUrl})
${this.truncateAddress(tokenAddress)}

Balance: ${balanceText} — ${walletNumber} ✏️
Price: $${price || '0.00'} — LIQ: $${liquidity || '0'} — MC: $${marketCap || '0'}
${change24h ? `24h: ${change24h}%` : ''}
${isRenounced ? 'Renounced ✅' : ''}`;
    }

    /**
     * Format Processing Message
     */
    formatProcessing(operation, details = {}) {
        const operations = {
            'buy': `🟡 Processing Buy...`,
            'sell': `🟡 Processing Sell...`,
            'quote': `🟡 Fetching Quote...`,
            'approval': `🟡 Approving Token...`
        };

        return operations[operation] || `🟡 Processing...`;
    }

    /**
     * Format Error Message
     */
    formatError(error, operation, details = {}) {
        let errorType = 'Unknown Error';
        let solution = 'Please try again or contact support';
        let emoji = this.brandEmojis.error;

        // Analyze error type
        if (error.includes('insufficient')) {
            errorType = 'Insufficient Balance';
            solution = 'Add more MON to your wallet';
            emoji = this.brandEmojis.warning;
        } else if (error.includes('slippage')) {
            errorType = 'High Slippage';
            solution = 'Try again or increase slippage tolerance';
            emoji = this.brandEmojis.warning;
        } else if (error.includes('gas')) {
            errorType = 'Gas Estimation Failed';
            solution = 'Network congestion - try again in a moment';
            emoji = this.brandEmojis.warning;
        } else if (error.includes('invalid')) {
            errorType = 'Invalid Token';
            solution = 'Check token address and try again';
        }

        return `${emoji} **${operation.toUpperCase()} FAILED**

${this.brandEmojis.shield} **ERROR TYPE**
${errorType}

${this.brandEmojis.target} **SOLUTION**
${solution}

${this.brandEmojis.clock} **Error ID:** \`${this.generateErrorId()}\``;
    }

    /**
     * Format Final Success Message (like reference bot)
     */
    formatFinalSuccessMessage(data) {
        const {
            operation,
            tokenSymbol,
            txHash
        } = data;

        const explorerUrl = `${this.explorerBaseUrl}/tx/${txHash}`;
        const operationText = operation === 'buy' ? 'Buy' : 'Sell';

        return `🟢 ${operationText} Success! [View on Monad Explorer](${explorerUrl})`;
    }

    /**
     * Format Initial Trading Message (like reference bot)
     */
    formatInitialTradingMessage(data) {
        const {
            operation,
            tokenSymbol,
            tokenName,
            tokenAddress,
            balance,
            price,
            liquidity,
            marketCap,
            change24h,
            walletNumber,
            isRenounced
        } = data;

        const operationEmoji = operation === 'buy' ? '📈' : '📉';
        const tokenUrl = `${this.explorerBaseUrl}/token/${tokenAddress}`;
        const shareUrl = `https://t.me/monad_area51_bot?start=r-${tokenAddress}`;
        
        let changeDisplay = '';
        if (change24h && change24h !== 'N/A') {
            const changeEmoji = change24h >= 0 ? '🟢' : '🔴';
            changeDisplay = `\n${changeEmoji} 24h: ${change24h}%`;
        }

        return `${operation === 'buy' ? 'Buy' : 'Sell'} $${tokenSymbol} — (${tokenSymbol}) ${operationEmoji} [📊](${tokenUrl})
\`${tokenAddress}\`
Share token with your Reflink [🔗](${shareUrl})

Balance: ${balance} ${operation === 'buy' ? 'MON' : tokenSymbol} — ${walletNumber} ✏️
Price: $${price} — LIQ: $${this.formatNumber(liquidity)} — MC: $${this.formatNumber(marketCap)}${changeDisplay}${isRenounced ? '\nRenounced ✅' : ''}`;
    }

    /**
     * Format Portfolio Token Display
     */
    formatPortfolioToken(token) {
        const {
            symbol,
            name,
            balance,
            monValue,
            usdValue,
            priceChange24h,
            address
        } = token;

        const changeEmoji = priceChange24h >= 0 ? '📈' : '📉';
        const changeColor = priceChange24h >= 0 ? '🟢' : '🔴';
        const tokenUrl = `${this.explorerBaseUrl}/token/${address}`;

        return `${this.brandEmojis.diamond} **${symbol}** | ${name}
${this.brandEmojis.target} [\`${this.truncateAddress(address)}\`](${tokenUrl})

${this.brandEmojis.money} **HOLDINGS**
• **Balance:** ${this.formatNumber(balance)} ${symbol}
• **Value:** ${monValue} MON (${usdValue ? `$${this.formatNumber(usdValue)}` : 'N/A'})
• **24h Change:** ${changeColor} ${priceChange24h ? `${priceChange24h}%` : 'N/A'} ${changeEmoji}`;
    }

    /**
     * Format Real-time Price Update
     */
    formatPriceUpdate(data) {
        const {
            symbol,
            price,
            change24h,
            volume24h,
            timestamp
        } = data;

        const changeEmoji = change24h >= 0 ? '📈' : '📉';
        const changeColor = change24h >= 0 ? '🟢' : '🔴';

        return `${this.brandEmojis.fire} **LIVE PRICE UPDATE**

${this.brandEmojis.diamond} **${symbol}**
• **Price:** $${this.formatNumber(price)}
• **24h Change:** ${changeColor} ${change24h}% ${changeEmoji}
• **Volume:** $${this.formatNumber(volume24h)}

${this.brandEmojis.clock} Updated: ${new Date(timestamp).toLocaleTimeString()}`;
    }

    /**
     * Utility Functions
     */
    formatNumber(num) {
        if (!num) return '0';
        const number = parseFloat(num);
        if (number >= 1000000) {
            return (number / 1000000).toFixed(2) + 'M';
        } else if (number >= 1000) {
            return (number / 1000).toFixed(2) + 'K';
        } else if (number >= 1) {
            return number.toFixed(4);
        } else {
            return number.toFixed(8);
        }
    }

    truncateAddress(address) {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    truncateHash(hash) {
        if (!hash) return '';
        return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
    }

    generateErrorId() {
        return Math.random().toString(36).substr(2, 8).toUpperCase();
    }

    /**
     * Create inline keyboard for actions
     */
    createActionKeyboard(data) {
        const { txHash, tokenAddress, operation } = data;
        const explorerUrl = `${this.explorerBaseUrl}/tx/${txHash}`;
        const tokenUrl = `${this.explorerBaseUrl}/token/${tokenAddress}`;

        const keyboard = [];

        // Always add explorer link if transaction hash exists
        if (txHash) {
            keyboard.push([
                { text: '🔍 View Transaction', url: explorerUrl }
            ]);
        }

        // Add token-specific actions
        if (tokenAddress) {
            keyboard.push([
                { text: '📊 Token Info', url: tokenUrl },
                { text: '💼 Portfolio', callback_data: 'portfolio' }
            ]);
        }

        // Add operation-specific actions
        if (operation === 'buy') {
            keyboard.push([
                { text: '📈 Sell', callback_data: `sell_${tokenAddress}` },
                { text: '🔄 Buy More', callback_data: `buy_${tokenAddress}` }
            ]);
        } else if (operation === 'sell') {
            keyboard.push([
                { text: '💰 Buy Back', callback_data: `buy_${tokenAddress}` }
            ]);
        }

        return { inline_keyboard: keyboard };
    }
}

module.exports = ProfessionalMessageFormatter;