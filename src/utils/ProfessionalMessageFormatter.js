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
            actualTokenAmount,
            txHash,
            priceImpact,
            gasUsed,
            effectiveGasPrice,
            timestamp,
            dexName = 'Monorail',
            mode = 'normal',
            slippage,
            tokenPrice,
            route,
            executionTime,
            expectedOutput,
            userBalance,
            priceChange30m,
            priceChange24h,
            isRenounced
        } = data;

        const explorerUrl = `${this.explorerBaseUrl}/tx/${txHash}`;
        const sellDeepLink = `https://t.me/MonAreaBot?start=sellToken-${tokenAddress}`;
        
        // Calculate actual received amount vs expected
        const receivedAmount = actualTokenAmount || tokenAmount || 0;
        const expectedAmount = expectedOutput || tokenAmount || 0;
        
        // Format mode display
        const modeDisplay = mode === 'turbo' ? '*TURBO*' : '*NORMAL*';
        
        // Format price changes
        const priceChange30mStr = priceChange30m ? `${priceChange30m > 0 ? '+' : ''}${priceChange30m.toFixed(2)}%` : '0.00%';
        const priceChange24hStr = priceChange24h ? `${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(2)}%` : '0.00%';
        
        // Format renounced status
        const renouncedStatus = isRenounced ? 'Renounced ✅' : 'Not Renounced ❌';
        
        // Format balance
        const balanceStr = userBalance ? `*${userBalance} MON*` : '*0 MON*';
        
        // Format token price
        const tokenPriceStr = tokenPrice ? `*$${this.formatNumber(tokenPrice)}*` : '*$0.00000000*';

        // Calculate USD values
        const monUsdValue = (monAmount * 159).toFixed(2);
        const tokenUsdValue = tokenPrice ? (receivedAmount * tokenPrice).toFixed(2) : '0.00';

        return `*Buy $${tokenSymbol} — (${tokenName})* • [\`${sellDeepLink}\`](${sellDeepLink})
${tokenAddress}

Balance: ${balanceStr}
Price: ${tokenPriceStr}
30m: ${priceChange30mStr} — 24h: ${priceChange24hStr}
${renouncedStatus}

⚡️Mode: ${modeDisplay}

🟢 Fetched Quote (${dexName})
${monAmount} MON ($${monUsdValue}) ⇄ ${this.formatNumber(receivedAmount)} ${tokenSymbol} ($${tokenUsdValue})
Price Impact: ${priceImpact ? `${priceImpact}%` : '0.00%'}

🟢 Buy Success! View on MonVision [\`${explorerUrl}\`](${explorerUrl})`;
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
            dexName = 'Monorail'
        } = data;

        const explorerUrl = `${this.explorerBaseUrl}/tx/${txHash}`;
        const tokenUrl = `${this.explorerBaseUrl}/token/${tokenAddress}`;
        const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return `${this.brandEmojis.success} **SELL EXECUTED**

${this.brandEmojis.fire} **${tokenSymbol}** | ${tokenName}
${this.brandEmojis.target} [\`${this.truncateAddress(tokenAddress)}\`](${tokenUrl})

${this.brandEmojis.chart} **TRADE SUMMARY**
• **Sold:** ${this.formatNumber(tokenAmount)} ${tokenSymbol}
• **Received:** ${monReceived} MON
• **DEX:** ${dexName}
• **Impact:** ${priceImpact ? `${priceImpact}%` : 'Low'}

${this.brandEmojis.shield} **TRANSACTION**
• **Hash:** [\`${this.truncateHash(txHash)}\`](${explorerUrl})
• **Gas:** ${gasUsed ? this.formatNumber(gasUsed) : 'Optimized'}
• **Time:** ${timeStr}

${this.brandEmojis.money} [**View on Explorer**](${explorerUrl}) | ${this.brandEmojis.chart} [**Token Details**](${tokenUrl})`;
    }

    /**
     * Format Quote Message (Real-time)
     */
    formatQuote(data) {
        const {
            fromToken,
            toToken,
            fromAmount,
            toAmount,
            priceImpact,
            dexName,
            confidence = 100,
            isRealTime = false
        } = data;

        const confidenceEmoji = confidence >= 95 ? '🟢' : confidence >= 80 ? '🟡' : '🔴';
        const realTimeIndicator = isRealTime ? `${this.brandEmojis.fire} **LIVE**` : '';

        return `${confidenceEmoji} **QUOTE FETCHED** ${realTimeIndicator}

${this.brandEmojis.chart} **EXCHANGE RATE**
${this.formatNumber(fromAmount)} ${fromToken} ${this.brandEmojis.target} ${this.formatNumber(toAmount)} ${toToken}

${this.brandEmojis.shield} **DETAILS**
• **DEX:** ${dexName}
• **Impact:** ${priceImpact ? `${priceImpact}%` : 'Minimal'}
• **Confidence:** ${confidence}% ${confidenceEmoji}

${this.brandEmojis.rocket} Ready to execute trade`;
    }

    /**
     * Format Processing Message
     */
    formatProcessing(operation, details = {}) {
        const operations = {
            'buy': `${this.brandEmojis.loading} **PROCESSING BUY**`,
            'sell': `${this.brandEmojis.loading} **PROCESSING SELL**`,
            'quote': `${this.brandEmojis.loading} **FETCHING QUOTE**`,
            'approval': `${this.brandEmojis.loading} **APPROVING TOKEN**`
        };

        let message = operations[operation] || `${this.brandEmojis.loading} **PROCESSING**`;
        
        if (details.tokenSymbol) {
            message += `\n\n${this.brandEmojis.target} **Token:** ${details.tokenSymbol}`;
        }
        
        if (details.amount) {
            message += `\n${this.brandEmojis.money} **Amount:** ${details.amount}`;
        }

        message += `\n\n${this.brandEmojis.clock} Please wait...`;
        
        return message;
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