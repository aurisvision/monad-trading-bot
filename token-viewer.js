const https = require('https');

// Configuration
const API_URL = 'https://api.blockvision.org/v2/monad/account/tokens';
const WALLET_ADDRESS = '0x77ce5F98045d41591eaDd9aDCB35177D9259c05e';
const API_KEY = '32PNg07UUEbdmQTUbACk0662IUQ';
const MON_API_URL = 'https://testnet-api.monorail.xyz/v1/symbol/MONUSD';
const APP_ID = '2837175649443187';

// Colors for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function formatNumber(num, decimals = 2) {
  const n = parseFloat(num);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatUSD(value) {
  const num = parseFloat(value);
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

// Fetch MON price dynamically
function fetchMonPrice() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'accept': 'application/json',
        'X-App-Identifier': APP_ID
      }
    };

    https.get(MON_API_URL, options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(parseFloat(json.price));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', err => reject(err));
  });
}

// Fetch tokens from BlockVision
function fetchTokens() {
  return new Promise((resolve, reject) => {
    const url = `${API_URL}?address=${WALLET_ADDRESS}`;
    const options = {
      headers: {
        'accept': 'application/json',
        'x-api-key': API_KEY
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => reject(err));
  });
}

// Display tokens (UNCHANGED, just added monPrice parameter)
function displayTokens(tokens, monPrice) {
  const filteredTokens = tokens
    .filter(t => parseFloat(t.usdValue) > 0 && t.verified)
    .sort((a, b) => parseFloat(b.usdValue) - parseFloat(a.usdValue));

  const totalUSD = filteredTokens.reduce((sum, t) => sum + parseFloat(t.usdValue), 0);
  const totalMON = totalUSD / monPrice;

  console.log('\n' + '='.repeat(120));
  console.log(colors.bright + colors.cyan + '                        TOKEN PORTFOLIO VIEWER' + colors.reset);
  console.log('='.repeat(120));
  console.log(colors.yellow + `Wallet: ${WALLET_ADDRESS}` + colors.reset);
  console.log(colors.green + colors.bright + `Total Portfolio: ${formatUSD(totalUSD)} (${formatNumber(totalMON, 2)} MON)` + colors.reset);
  console.log(colors.gray + `Total Verified Tokens: ${filteredTokens.length}` + colors.reset);
  console.log('='.repeat(120) + '\n');

  const header =
    `${colors.bright}${'#'.padEnd(4)}` +
    `${'Symbol'.padEnd(10)}` +
    `${'Name'.padEnd(25)}` +
    `${'Price'.padStart(14)}` +
    `${'24h %'.padStart(10)}` +
    `${'Balance'.padStart(16)}` +
    `${'USD Value'.padStart(14)}` +
    `${'MON Value'.padStart(14)}${colors.reset}`;
  console.log(header);
  console.log('-'.repeat(120));

  filteredTokens.forEach((token, i) => {
    const rank = `${i + 1}.`.padEnd(4);
    const symbol = token.symbol.substring(0, 9).padEnd(10);
    const name = token.name.substring(0, 24).padEnd(25);
    const price = `$${formatNumber(token.price, 4)}`.padStart(14);
    const priceChange = parseFloat(token.priceChangePercentage);
    const changeColor = priceChange >= 0 ? colors.green : colors.red;
    const changeSign = priceChange >= 0 ? '+' : '';
    const change = `${changeSign}${priceChange.toFixed(2)}%`.padStart(10);
    const balance = formatNumber(token.balance, 4).padStart(16);
    const usdValue = formatUSD(token.usdValue).padStart(14);
    const monValue = formatNumber(parseFloat(token.usdValue) / monPrice, 2).padStart(14);

    console.log(
      colors.gray + rank + colors.reset +
      colors.yellow + symbol + colors.reset +
      colors.white + name + colors.reset +
      colors.cyan + price + colors.reset +
      changeColor + change + colors.reset +
      colors.white + balance + colors.reset +
      colors.green + usdValue + colors.reset +
      colors.cyan + monValue + colors.reset
    );
  });

  console.log('\n' + '='.repeat(120));
  console.log(colors.green + colors.bright + `Total Portfolio: ${formatUSD(totalUSD)} (${formatNumber(totalMON, 2)} MON)` + colors.reset);
  console.log('='.repeat(120) + '\n');
}

// Main
(async () => {
  try {
    console.log(colors.cyan + '\nFetching MON price...' + colors.reset);
    const MON_PRICE_USD = await fetchMonPrice();
    console.log(`Current MON/USD price: $${MON_PRICE_USD}`);

    console.log(colors.cyan + '\nFetching token data...' + colors.reset);
    const response = await fetchTokens();
    if (response.code === 0 && response.result && response.result.data) {
      displayTokens(response.result.data, MON_PRICE_USD);
    } else {
      console.error(colors.red + 'Error: Invalid response from API' + colors.reset);
    }
  } catch (err) {
    console.error(colors.red + 'Error fetching data:', err.message + colors.reset);
  }
})();
