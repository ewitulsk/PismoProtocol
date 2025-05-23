# Pismo Protocol - DeFi Perpetuals Trading DEX

A decentralized exchange for trading perpetual contracts on the Sui blockchain.

## Overview

Pismo Protocol is a DeFi platform that allows users to trade perpetuals, manage vaults, and earn yield. The platform consists of three main pages:

1. **Home Page**: Landing page with links to the Trading Platform and Vault Management
2. **Trading Page**: Interface for trading perpetuals with a price chart
3. **Vault Page**: Interface for managing collateral and positions

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16.x or later)
- [npm](https://www.npmjs.com/) (v8.x or later)

### Installing Node.js and npm

#### On macOS:
```bash
# Using Homebrew
brew install node

# Verify installation
node -v
npm -v
```

#### On Windows:
1. Download the installer from [Node.js website](https://nodejs.org/)
2. Run the installer and follow the installation wizard
3. Verify installation by opening Command Prompt and running:
```bash
node -v
npm -v
```

#### On Linux:
```bash
# Using apt (Ubuntu/Debian)
sudo apt update
sudo apt install nodejs npm

# Using dnf (Fedora)
sudo dnf install nodejs npm

# Verify installation
node -v
npm -v
```

## Installation

1. Clone the repository:
```bash
git clone git@github.com:ewitulsk/PismoProtocol.git
cd PismoProtocol
```

2. Install frontend dependencies:
```bash
cd frontend
npm install
```

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

## Configuration

The frontend application uses a `config.toml` file located in the `frontend` directory to manage environment-specific variables. On startup, the Next.js application reads this file and loads its contents into the environment variables. This allows for easy configuration of endpoints, API keys, and other parameters without hardcoding them into the source code.

To access these variables in your client-side code, ensure they are prefixed with `NEXT_PUBLIC_`.

### Example `config.toml`

Create a `config.toml` file in the `frontend` directory with the following structure:

```toml
NEXT_PUBLIC_PRICE_FEED_AGGREGATOR_URL="wss://your-price-feed-url"
NEXT_PUBLIC_BACKEND_API_URL="http://localhost:5080"
NEXT_PUBLIC_SUI_PACKAGE_ID="0xyour_sui_package_id"
NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID="0xyour_sui_global_object_id"
NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID="0xyour_sui_program_object_id"
NEXT_PUBLIC_SUI_EXPLORER_BASE_URL="https://your_sui_explorer_url/tx/"
NEXT_PUBLIC_INDEXER_URL="http://localhost:3001"
```

**Note:** Remember to replace the example values with your actual configuration details.

## Pages Overview

### Home Page
The landing page provides an introduction to Pismo Protocol with links to the Trading Platform and Vault Management. It showcases the key features of the platform:
- Trade Perpetuals
- Earn Yield
- Manage Risk

### Trading Page
The trading interface allows users to:
- View price charts for different perpetual markets
- Select different timeframes for the chart
- Monitor account health
- Manage collateral positions
- Execute trades

The trading chart is implemented using TradingView widget integration with Pyth Network price feeds.

### Vault Page
The vault management interface allows users to:
- View vault statistics
- Manage collateral positions
- Monitor vault health
- Deposit and withdraw assets

## Development

### Project Structure
```
frontend/
├── public/          # Static assets
├── src/
│   ├── app/         # Next.js app router pages
│   ├── components/  # React components
│   ├── data/        # Mock data and models
│   ├── styles/      # CSS styles
│   └── utils/       # Utility functions
├── package.json     # Dependencies and scripts
└── next.config.js   # Next.js configuration
```

### Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the application for production
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint to check code quality

## Technologies

- [Next.js](https://nextjs.org/) - React framework
- [React](https://reactjs.org/) - UI library
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Pyth Network](https://pyth.network/) - Price feed oracle

## License

ISC
