# Pismo Protocol Indexer

This service indexes specific events emitted by the `pismo_protocol::positions` Sui Move module and stores them in a PostgreSQL database.

## Features

*   Connects to a Sui network checkpoint stream via a remote store URL (e.g., Sui Testnet/Mainnet).
*   Parses and deserializes specific Move events using BCS.
*   Stores event data in a configured PostgreSQL database.
*   Uses Diesel ORM with r2d2 connection pooling.
*   Configurable start checkpoint, concurrency, and target package ID.
*   Uses `tracing` for logging.

## Supported Events

Currently, the indexer listens for and stores the following events from the `pismo_protocol::positions` module:

*   `PositionCreatedEvent`
*   `PositionClosedEvent`

## Prerequisites

1.  **Rust:** Ensure you have a recent Rust toolchain installed.
2.  **PostgreSQL:** A running PostgreSQL database instance.
3.  **Diesel CLI:** For managing database migrations.
    ```bash
    cargo install diesel_cli --no-default-features --features postgres
    ```

## Setup

1.  **Database:**
    *   Create a PostgreSQL database for the indexer.
    *   Set the `DATABASE_URL` in your configuration file (see below) or environment.
    *   Run the database migrations located in `src/db/postgres/migrations/`:
        ```bash
        # Set the DATABASE_URL environment variable first
        # export DATABASE_URL=postgres://user:password@host:port/database
        diesel setup
        diesel migration run
        ```

2.  **Configuration:**
    *   Create a configuration file (e.g., `config/dev.toml` or `config/testnet.toml`). A template `config/testnet.toml` is provided.
    *   Fill in the necessary values, especially `database_url` and `package_id`.

## Configuration File (`config/*.toml`)

The configuration file uses TOML format and requires the following fields:

```toml
# Connection string for the PostgreSQL database
database_url = "postgres://user:password@host:port/database"

# Deployed Package ID of the pismo_protocol module whose events you want to index
package_id = "0xYOUR_PACKAGE_ID"

# URL of the Sui remote checkpoint store (e.g., testnet, mainnet)
# e.g., "https://checkpoints.testnet.sui.io" or "https://checkpoints.mainnet.sui.io"
remote_store_url = "https://checkpoints.testnet.sui.io"

# Checkpoint sequence number to start indexing from
# Set to 0 to start from the beginning, or a higher number to resume/start later
start_checkpoint = 0

# Number of concurrent checkpoint processing tasks
# Adjust based on your machine resources and workload
concurrency = 5
```

## Running the Service

1.  **Set Environment Variables:**
    *   `CONFIG_PATH`: (Optional) Path to your configuration file. Defaults to `config/testnet.toml`.
    *   `RUST_LOG`: (Optional) Logging level (e.g., `info`, `debug`, `warn`, `error`). Defaults typically show info level.

    Example:
    ```bash
    export CONFIG_PATH=config/dev.toml
    export RUST_LOG=info,indexer=debug # Set indexer crate logs to debug
    ```

2.  **Run the Service:**
    ```bash
    cargo run
    ```

The service will start both the indexer background task and the API server. The indexer fetches and stores events, while the API server listens for requests on the address specified by `listen_addr` in the config (default `0.0.0.0:3000`).

## API Endpoints

### Get Open Positions for Account

*   **Route:** `GET /v0/positions/:account_id`
*   **Description:** Retrieves all currently open positions associated with the specified Sui account address.
    An "open" position is one recorded by a `PositionCreatedEvent` that does *not* have a corresponding `PositionClosedEvent` sharing the same `position_id`.
*   **Path Parameters:**
    *   `account_id` (string): The Sui address of the account (e.g., `0x123...abc`).
*   **Success Response (200 OK):**
    *   **Content-Type:** `application/json`
    *   **Body:** A JSON array of open position objects. Each object has the following structure (matching the `OpenPositionEvent` database model):
        ```json
        [
          {
            "transaction_hash": "string", // Transaction hash where the position was created
            "position_id": "string",     // Unique ID of the position (0x...)
            "position_type": "string",   // "Long" or "Short"
            "amount": "string",          // Amount as a numeric string (BigDecimal)
            "leverage_multiplier": "string", // Leverage as a numeric string (BigDecimal)
            "entry_price": "string",     // Entry price as a numeric string (BigDecimal)
            "entry_price_decimals": number, // Integer (i32)
            "supported_positions_token_i": number, // Integer (i32)
            "price_feed_id_bytes": "string", // Hex-encoded string of the price feed ID bytes
            "account_id": "string",      // Account address (0x...)
            "timestamp": "string"        // Timestamp (RFC 3339 format, e.g., "2023-10-27T07:31:14.123Z")
          }
          // ... more position objects
        ]
        ```
*   **Error Responses:**
    *   `404 Not Found`: If no open positions are found for the given `account_id`.
    *   `500 Internal Server Error`: If there's a database error or other server issue during processing. 