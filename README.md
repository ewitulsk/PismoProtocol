# Pismo Protocol - Decentralized Perpetuals Trading Platform

Pismo Protocol is a decentralized trading platform built on the Sui blockchain. It enables users to engage in leveraged trading (long and short positions) on various assets, with positions collateralized by other supported assets. The protocol utilizes liquidity pools (Vaults) where users can provide liquidity and earn fees. Asset pricing is primarily managed through integration with the Pyth Network oracle.

This repository contains the various services that make up the Pismo Protocol ecosystem.

## Services

The Pismo Protocol is composed of the following key services:

### 1. Sui Contracts (`contracts/`)
The core on-chain logic of the Pismo Protocol resides here. These Move smart contracts define the rules for trading, collateralization and liquidity provisioning.
*   **Key Modules**: `main` (global admin), `tokens` (oracle interaction), `lp` (liquidity pools/vaults), `programs` (trading environments), `accounts` (user accounts), `collateral`, `positions`, `position_functions` (trading entry points), `value_assertion_objects` (data consistency), and `math` utilities.
*   **Core Concepts**: Global settings, trading programs, user accounts, token definitions with oracle integration (Pyth), collateral management, liquidity vaults (LPs), leveraged positions, and value assertion objects for transaction integrity.
*   For more details, see `contracts/README.md`.

### 2. Indexer (`indexer/`)
This service listens to events emitted by the Pismo Protocol's Sui smart contracts and stores them in a PostgreSQL database. This allows for efficient querying of historical data and current state.
*   **Features**: Connects to Sui network checkpoint stream, parses Move events using BCS, stores data in PostgreSQL via Diesel ORM, configurable start checkpoint and concurrency, and supports callbacks to external services (e.g., for liquidation transfers).
*   **Indexed Events**: Includes `PositionCreatedEvent`, `PositionClosedEvent`, `VaultCreatedEvent`, `NewAccountEvent`, `CollateralDepositEvent`, and others.
*   For more details, see `indexer/README.md`.

### 3. Frontend (`frontend/`)
The user interface for interacting with the Pismo Protocol. It allows users to trade, manage their collateral and positions, and interact with liquidity vaults.
*   **Pages**: Home (landing page), Trading Page (perpetuals trading with price charts), Vault Page (collateral and position management).
*   **Features**: Trade perpetuals, earn yield, manage risk, view TradingView charts integrated with Pyth Network price feeds.
*   **Technologies**: Next.js, React, TypeScript, TailwindCSS.
*   For more details, see `frontend/README.md`.

### 4. Price Feed Aggregator (`price-feed-aggregator/`)
A service that consumes price data from the Pyth Network's Hermes SSE stream, builds into OHLC bars, and provides it to other services and clients via a WebSocket interface.
*   **Features**: Real-time price updates from Pyth, WebSocket API for subscribing to specific price feeds, REST API for metadata and status.
*   **Architecture**: Pyth Hermes Client, WebSocket Server, REST API.
*   For more details, see `price-feed-aggregator/README.md`.

### 5. Liquidation Transfer Service (`liquidation_transfer_service/`)
This Node.js/TypeScript service handles the execution of liquidations and critical fund transfers (vault and collateral) within the Pismo Protocol. It provides REST API endpoints for these operations.
*   **Features**: Executes vault transfers, collateral transfers, and account liquidations. Integrates with Pyth Network for real-time price feeds during liquidations. Automatically resolves Sui type parameters for Move function calls.
*   **Prerequisites**: Node.js, Sui wallet, Sui RPC access.
*   For more details, see `liquidation_transfer_service/README.md`.

### 6. Backend Service (`backend/`)
Provides API endpoints for querying analytics and aggregated data related to the Pismo Protocol, such as Total Value Locked (TVL), individual account values, and supported collateral types.
*   **Features**: Calculates total account value, TVL in LP vaults, individual LP token balances, and lists supported collateral types by querying on-chain data and the indexer.
*   **Endpoints**: `/api/calculateTotalAccountValue`, `/api/calculateTotalValueLocked`, `/api/lpBalance`, `/api/supportedCollateral`.
*   For more details, see `backend/README.md`.

### 7. Deployment Manager (`deployment-manager/`)
Contains scripts to automate the initialization and configuration propagation steps required after deploying the Pismo Protocol smart contracts.
*   **Scripts**:
    *   `npm run initialize`: Performs essential on-chain initialization (e.g., setting up initial LPs, programs) after a fresh contract deployment.
    *   `npm run copydata`: Updates configuration files across other services (frontend, backend, indexer, liquidation service) with the new deployment details (package ID, object IDs, etc.).
*   **⚠️ Important**: These scripts are designed to be run as part of the main `deploycontracts.sh` script and should not be executed manually out of that context.
*   For more details, see `deployment-manager/README.md`.

## Architecture Overview

The Pismo Protocol services interact to provide a comprehensive decentralized trading experience:
*   The **Sui Contracts** are the foundational layer on the Sui blockchain.
*   The **Indexer** monitors these contracts, recording events for off-chain access.
*   The **Backend Service** queries both the on-chain contracts and the Indexer's database to provide analytical data.
*   The **Price Feed Aggregator** supplies real-time Pyth price data.
*   The **Frontend** is the user's entry point, interacting with the contracts for transactions, the Backend for analytics, and the Price Feed Aggregator for live prices.
*   The **Liquidation Transfer Service** is invoked (often by automated processes or potentially by the Indexer detecting certain conditions) to execute critical operations like liquidations and fund transfers, using fresh price data and interacting directly with the Sui Contracts.
*   The **Deployment Manager** facilitates the initial setup and configuration of all services after the Sui Contracts are deployed or updated.

## Getting Started

To set up and run a specific service, please refer to the `README.md` file within its respective directory (e.g., `frontend/README.md`, `indexer/README.md`).

The `deploycontracts.sh` script in the root directory orchestrates the deployment of the smart contracts and the subsequent initialization and configuration using the `deployment-manager`.

## Directory Structure

The monorepo is organized as follows:

\`\`\`
PismoProtocol/
├── contracts/            # Sui Move smart contracts
├── indexer/              # Event indexer service
├── frontend/             # Next.js web application
├── price-feed-aggregator/# Pyth price feed WebSocket service
├── liquidation_transfer_service/ # Service for liquidations and transfers
├── backend/              # Analytics and data API service
├── deployment-manager/   # Deployment and initialization scripts
├── deploycontracts.sh    # Main deployment script
└── README.md             # This file
\`\`\` 