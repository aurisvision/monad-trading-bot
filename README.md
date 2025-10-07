# 🛸 Area51 Telegram Trading Bot

A Telegram trading bot for the Monad blockchain testnet that allows users to trade tokens through a simple interface.

## 📋 What This Bot Does

- **Buy/Sell Tokens**: Trade tokens on Monad testnet using MON
- **Wallet Management**: Create, import, and manage wallets
- **Portfolio Tracking**: View token balances and portfolio value
- **Simple Interface**: Easy-to-use Telegram commands and buttons

## 🔧 Tech Stack

- **Node.js** - Runtime environment
- **Telegraf** - Telegram bot framework
- **PostgreSQL** - Database for user data
- **Redis** - Caching (optional)
- **ethers.js** - Blockchain interactions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Telegram Bot Token
- Redis (recommended)

### Installation
```bash
# Clone the repository
git clone <your-repo>
cd monad-area51-update

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your settings

# Run the bot
npm start
```

### Environment Variables
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_NAME=area51_bot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
REDIS_HOST=localhost
REDIS_PORT=6379
ENCRYPTION_KEY=your_32_character_key_here
MONAD_RPC_URL=https://lb.drpc.live/monad-testnet/AoOgZcz1jUo2kLGq0kMoG3ovAOf-o9gR8IGdwg8TMB_n
```

## 📁 Project Structure

```
src/
├── index-modular-simple.js    # Main bot file
├── database-postgresql.js     # Database connection
├── wallet.js                  # Wallet management
├── monorail.js               # DEX API integration
├── handlers/                 # Telegram command handlers
│   ├── walletHandlers.js
│   ├── portfolioHandlers.js
│   └── navigationHandlers.js
├── trading/                  # Trading functionality
│   ├── TradingInterface.js
│   └── UnifiedTradingEngine.js
├── services/                 # Background services
├── middleware/               # Bot middleware
└── utils/                    # Helper functions
```

## 🎯 Main Features

### Wallet Operations
- Create new wallet
- Import existing wallet (private key/mnemonic)
- View wallet address and balance
- Export private key (with auto-delete)

### Trading
- Buy tokens with MON
- Sell tokens for MON
- Customizable slippage settings
- Gas fee configuration

### Portfolio
- View all token balances
- Real-time portfolio value
- Transaction history

### Settings
- Configure trading parameters
- Set default amounts
- Adjust slippage tolerance

## 🔗 External APIs

- **Monorail Pathfinder**: Trading quotes and execution
- **Monorail Data API**: Token data and balances
- **Monad RPC**: Blockchain interactions

## 🛡️ Security

- Private keys encrypted with AES-256
- Input validation on all user inputs
- Rate limiting to prevent spam
- Secure session management

## 📊 Database Schema

The bot uses PostgreSQL to store:
- User accounts and settings
- Wallet information (encrypted)
- Transaction history
- Access codes

## 🐳 Docker Deployment

```bash
# Using docker-compose
docker-compose up -d

# Check logs
docker-compose logs -f
```

## 🔧 Development

### Running in Development
```bash
npm run dev
```

### Testing
```bash
# Test database connection
node -c src/index-modular-simple.js
```

## 📝 Notes

- This is a testnet bot for Monad blockchain
- Uses test MON tokens (no real value)
- Designed for educational and testing purposes
- Always verify transactions on Monad testnet explorer

## 📄 License

MIT License - See LICENSE file for details.

---

**Simple, functional trading bot for Monad testnet**
