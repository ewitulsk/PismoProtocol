# Liquidation Transfer Service

A Node.js/TypeScript service for handling liquidations and transfers in a Sui blockchain-based DeFi protocol. This service provides REST API endpoints for executing vault transfers, collateral transfers, and account liquidations with integrated Pyth Network price feeds.

## Features

- **Vault Transfer Execution**: Execute transfers between vaults with automatic type parameter resolution
- **Collateral Transfer Execution**: Handle collateral movements between accounts and vaults
- **Account Liquidation**: Perform account liquidations using real-time Pyth price feeds
- **Pyth Integration**: Automatic price feed updates from Pyth Network's Hermes service
- **Type Safety**: Full TypeScript support with Sui blockchain type extraction
- **Error Handling**: Comprehensive error handling and logging

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Sui wallet with private key
- Access to Sui RPC endpoint

## Installation

1. Clone the repository and navigate to the service directory:
```bash
cd liquidation_transfer_service
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript code:
```bash
npm run build
```

## Configuration

The service supports configuration through both environment variables (.env file) and TOML configuration file.

### Environment Variables (.env)

Create a `.env` file in the `liquidation_transfer_service` directory:

```env
# Required
SUI_PRIVATE_KEY=your_sui_private_key_here
PACKAGE_ID=0x4ccbc5f1897ae7f970c5d7436c4b578106ce9b89afd7006fa717aa19cefd037b

# Optional (will use defaults if not specified)
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
LIQUIDATION_SERVICE_PORT=3002
PYTH_STATE_OBJECT_ID=0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c
WORMHOLE_STATE_ID=0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790
HERMES_ENDPOINT=https://hermes-beta.pyth.network
```

### TOML Configuration (config/config.toml)

Alternatively, you can use the TOML configuration file:

```toml
PACKAGE_ID = "0x4ccbc5f1897ae7f970c5d7436c4b578106ce9b89afd7006fa717aa19cefd037b"
SUI_RPC_URL = "https://fullnode.testnet.sui.io:443"
LIQUIDATION_SERVICE_PORT = "3002"
PYTH_STATE_OBJECT_ID = "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c"
WORMHOLE_STATE_ID = "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790"
HERMES_ENDPOINT = "https://hermes-beta.pyth.network"
```

### Private Key Format

The `SUI_PRIVATE_KEY` can be in the following formats:
- Base64 encoded with or without 'suiprivkey' prefix
- Raw 64-character hexadecimal string (without 0x prefix)

## Usage

### Development

Start the service in development mode:
```bash
npm run dev
```

### Production

Build and start the service:
```bash
npm run build
npm start
```

The service will start on the configured port (default: 3002) and be available at `http://localhost:3002`.

## API Endpoints

### 1. Execute Vault Transfer

Execute a transfer between vaults.

**Endpoint:** `POST /execute_vault_transfer`

**Request Body:**
```json
{
  "transfer_id": "0x...",
  "vault_address": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "transactionDigest": "0x..."
}
```

### 2. Execute Collateral Transfer

Execute a collateral transfer to a vault.

**Endpoint:** `POST /execute_collateral_transfer`

**Request Body:**
```json
{
  "transfer_id": "0x...",
  "collateral_address": "0x...",
  "to_vault_address": "0x...",
  "vault_marker_id": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "transactionDigest": "0x..."
}
```

### 3. Liquidate Account

Liquidate an account using Pyth price feeds.

**Endpoint:** `POST /liquidate_account`

**Request Body:**
```json
{
  "programId": "0x...",
  "accountObjectId": "0x...",
  "accountStatsId": "0x...",
  "positions": [
    {
      "id": "0x...",
      "priceFeedIdBytes": "0x..."
    }
  ],
  "collaterals": [
    {
      "collateralId": "0x...",
      "markerId": "0x...",
      "coinType": "0x...",
      "priceFeedIdBytes": "0x..."
    }
  ],
  "vaultMarkerIds": ["0x..."]
}
```

**Response:**
```json
{
  "success": true,
  "transactionDigest": "0x..."
}
```

## Architecture

### Core Components

- **Sui Client**: Handles blockchain interactions using the Sui TypeScript SDK
- **Pyth Integration**: Fetches real-time price data from Pyth Network
- **Type Extraction**: Automatically extracts Move type parameters from on-chain objects
- **Transaction Building**: Constructs and executes Move function calls

### Key Features

1. **Automatic Type Resolution**: The service automatically extracts type parameters from Sui objects to ensure correct Move function calls.

2. **Pyth Price Feeds**: Integrates with Pyth Network's Hermes service to fetch the latest price data for liquidation calculations.

3. **Value Assertion Objects**: Creates and manages collateral and position value assertion objects for secure liquidation processes.

4. **Error Handling**: Comprehensive error handling with detailed logging for debugging.

## Logging

The service provides detailed logging for:
- Transaction execution results
- Type parameter extraction
- Pyth price feed updates
- Error conditions and stack traces

## Error Handling

Common error scenarios and their handling:

- **Missing Environment Variables**: Service exits with error code 1
- **Invalid Private Key Format**: Attempts fallback to hex format
- **Object Not Found**: Returns 500 with detailed error message
- **Type Extraction Failure**: Returns 500 with type information
- **Pyth Integration Errors**: Returns 500 with Pyth-specific error details

## Development

### Project Structure

```
liquidation_transfer_service/
├── src/
│   ├── index.ts          # Main Express server and API endpoints
│   ├── config.ts         # Configuration management
│   └── sui-client.ts     # Sui blockchain client setup
├── config/
│   └── config.toml       # TOML configuration file
├── package.json
├── tsconfig.json
└── README.md
```

### Available Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run dev` - Start in development mode with hot reload
- `npm start` - Start the built application
- `npm run lint` - Run ESLint (if configured)
- `npm test` - Run tests (if configured)

## Security Considerations

1. **Private Key Storage**: Ensure your `.env` file is not committed to version control
2. **RPC Endpoints**: Use trusted Sui RPC endpoints
3. **Input Validation**: All API endpoints validate required parameters
4. **Error Disclosure**: Production deployments should limit error message details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request

## License

[Add your license information here]

## Support

For issues and questions:
- Create an issue in the repository
- Check the logs for detailed error information
- Ensure all required configuration values are set correctly 