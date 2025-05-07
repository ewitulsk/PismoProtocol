# Backend Service for Pismo Protocol Analytics

This service provides API endpoints to query various metrics related to the Pismo Protocol on the Sui blockchain, such as total account value, total value locked (TVL) in liquidity provider (LP) vaults, individual LP balances, and supported collateral types.

## Setup and Running

1.  **Prerequisites:**
    *   Python 3.11
    *   `pip` (Python package installer)

2.  **Installation:**
    *   Navigate to the `backend` directory:
        ```bash
        cd path/to/PismoProtocol/backend
        ```
    *   Create a virtual environment (recommended):
        ```bash
        python -m venv venv
        source venv/bin/activate  # On Windows use `venv\\Scripts\\activate`
        ```
    *   Install dependencies:
        ```bash
        pip install -r requirements.txt
        ```

3.  **Configuration:**
    *   Ensure the `config/backend_config.json` file is present and correctly configured with the necessary Sui network details (API URLs, contract addresses, program ID, etc.). The default configuration uses Sui Testnet.
        ```json
        {
          "contract_address": "0x...", // Your collateral contract address
          "contract_global": "0x...", // Your LP contract global object ID
          "program_id": "0x...", // Your Program object ID
          "pyth_price_feed_url": "https://hermes-beta.pyth.network/v2/updates/price/latest?",
          "sui_api_url": "https://fullnode.testnet.sui.io:443",
          "indexer_url": "http://0.0.0.0:3001", // URL for your indexer service if used (e.g., for get_lp_balance)
          "host": "0.0.0.0",
          "port": 5080
        }
        ```

4.  **Running the Server:**
    *   From the `backend` directory, run the Flask server:
        ```bash
        python server.py
        ```
    *   The server will start, typically listening on `http://0.0.0.0:5080` (or as configured in `backend_config.json`).

## API Endpoints

All endpoints return JSON responses.

---

### 1. Calculate Total Account Value

*   **Route:** `/api/calculateTotalAccountValue`
*   **Method:** `POST`
*   **Description:** Calculates the total value of collateral held by a specific account within the protocol.
*   **Request Body:**
    ```json
    {
      "address": "string", // Owner's Sui address
      "account": "string", // Account ID within the protocol
      "contract": "string" // Contract address (currently overridden by config)
      // "network": "string" // Optional: "testnet" or "mainnet" (defaults to "testnet", currently overridden by config)
    }
    ```
*   **Success Response (200):**
    ```json
    {
      "totalValue": number // Calculated total value
    }
    ```
*   **Error Response (400 or 500):**
    ```json
    {
      "error": "string" // Error message
    }
    ```

---

### 2. Calculate Total Value Locked (TVL)

*   **Route:** `/api/calculateTotalValueLocked`
*   **Method:** `POST`
*   **Description:** Calculates the total value locked across all LP vaults tracked by the configured indexer and global contract state.
*   **Request Body:** *(None)*
*   **Success Response (200):**
    ```json
    {
      "totalValueLocked": number, // Total value across all vaults
      "vaults": [ // List of individual vault details
        {
          "object_id": "string", // Vault object ID
          "type": "string", // Vault type string
          "coin": number, // Amount of base coin in the vault
          "coin_type": "string", // Type of the base coin
          "value": number, // Calculated USD value of the coin in the vault
          "token_decimals": number // Decimals of the coin type
        }
      ],
      "count": number // Number of vaults included in the calculation
    }
    ```
*   **Error Response (400 or 500):**
    ```json
    {
      "error": "string" // Error message (e.g., config missing, failed to fetch data)
    }
    ```

---

### 3. Get LP Token Balance

*   **Route:** `/api/lpBalance`
*   **Method:** `POST`
*   **Description:** Retrieves the balance of a specific LP token for a given owner, based on the vault configuration fetched from the indexer.
*   **Request Body:**
    ```json
    {
      "owner": "string", // Owner's Sui address
      "vault_id": "string" // The vault object ID (used to look up vault details in the indexer)
    }
    ```
*   **Success Response (200):**
    ```json
    {
      "lpBalance": number // The owner's balance of the specific LP token
    }
    ```
*   **Error Response (400 or 500):**
    ```json
    {
      "error": "string" // Error message (e.g., vault not found in indexer, missing parameters)
    }
    ```

---

### 4. Get Supported Collateral

*   **Route:** `/api/supportedCollateral`
*   **Method:** `GET`
*   **Description:** Retrieves the list of supported collateral types directly from the on-chain Program object specified in the configuration.
*   **Request Body:** *(None)*
*   **Success Response (200):**
    ```json
    {
      "supportedCollateral": [ // Array of TokenIdentifier structs
        {
           "type": "string", // Sui struct type (e.g., "...::tokens::TokenIdentifier")
           "fields": {
               "token_info": "string", // Type name of the token (e.g., "0x2::sui::SUI")
               "token_decimals": number, // Number of decimals for the token
               "price_feed_id_bytes": [ number ], // Original price feed ID bytes (array of numbers)
               "price_feed_id_bytes_hex": "string", // Hex representation of price_feed_id_bytes
               "oracle_feed": number, // ID indicating the oracle (e.g., 0 for Pyth)
               "deprecated": boolean // Whether this collateral type is deprecated
           }
        }
        // ... more collateral types
      ]
    }
    ```
*   **Error Response (400 or 500):**
    ```json
    {
      "error": "string" // Error message (e.g., config missing, program object not found)
    }
    ```

--- 