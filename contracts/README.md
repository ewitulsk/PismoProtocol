# Pismo Protocol Sui Contracts

## Overview

Pismo Protocol is a decentralized trading platform built on the Sui blockchain. It enables users to engage in leveraged trading (long and short positions) on various assets, with positions collateralized by other supported assets. The protocol utilizes liquidity pools (Vaults) where users can provide liquidity and earn fees. Asset pricing is primarily managed through integration with the Pyth Network oracle.

The protocol is structured around several key modules, each handling a specific aspect of its functionality, from global administration and token definitions to account management, collateral, positions, and liquidity provision.

## Core Concepts

*   **Global & AdminCap**: The `Global` object holds protocol-wide settings like supported Liquidity Pool (LP) tokens. The `AdminCap` provides administrative privileges for managing these global settings.
*   **Programs**: A `Program` defines a specific trading environment. It specifies the supported collateral types, supported assets for trading (positions), maximum leverage for these assets, and a shared decimal precision for value calculations.
*   **Accounts**: Users interact with the protocol through `Account` objects. Each account is tied to a specific `Program`. An `AccountStats` object tracks an account's number of open positions and collateral items.
*   **Tokens & Oracles**: The `TokenIdentifier` struct defines assets within the protocol, including their metadata, decimals, and crucially, their price feed ID (e.g., from Pyth). The `tokens` module handles interactions with oracles like Pyth to fetch prices and calculate asset values.
*   **Collateral**: Users must deposit collateral to open positions. `Collateral` objects hold these assets, and `CollateralMarker` objects track the amount and value of this collateral in a shared manner.
*   **Liquidity Pools (LPs) & Vaults**:
    *   `Vault`: A contract that holds a specific type of asset (e.g., SUI) and issues `LPToken`s to liquidity providers. These vaults act as the counterparty for trades.
    *   `VaultMarker`: A shared object tracking the amount and value of assets within a `Vault`.
    *   `LPToken`: Represents a share in a liquidity vault.
*   **Positions**: `Position` objects represent a user's leveraged trade (long or short) on a specific asset. They include details like the position type, amount, leverage, entry price, and the account it belongs to.
*   **Value Assertion Objects**: `CollateralValueAssertionObject` and `PositionValueAssertionObject` are used within transactions to ensure that all of an account's collateral and open positions are valued using up-to-date price information before critical actions like opening a new position or liquidation occur. This helps maintain data consistency and prevent stale price exploits.

## Modules

### 1. `pismo_protocol::main`
*   **Purpose**: Handles global configuration and administrative capabilities.
*   **Key Structs**:
    *   `AdminCap`: Grants administrative rights.
    *   `Global`: Stores protocol-wide parameters like supported LP tokens.
*   **Functionality**: Initialization of global settings, adding supported LP and position types at a global level.

### 2. `pismo_protocol::tokens`
*   **Purpose**: Defines token structures and manages interactions with price oracles (primarily Pyth).
*   **Key Structs**:
    *   `TokenIdentifier`: Defines an asset with its properties (name, decimals, price feed ID, oracle type).
*   **Functionality**: Fetching prices from Pyth (`get_price_pyth`), calculating token values (`get_value_pyth`), and converting target values to token amounts (`amount_for_target_value_pyth`).

### 3. `pismo_protocol::lp`
*   **Purpose**: Manages liquidity pools (Vaults) and LP tokens.
*   **Key Structs**:
    *   `LPToken<CoinType>`: Represents a liquidity provider's share in a vault.
    *   `Vault<CoinType, LPType>`: Holds deposited assets and mints/burns LP tokens.
    *   `VaultMarker`: A shared object tracking the total amount and USD value of assets in a specific `Vault`.
    *   `VaultTransfer`: A shared object representing a pending transfer of funds from a `Vault` (e.g., to a user after a profitable trade).
*   **Functionality**: Initializing vaults (`init_lp_vault`), depositing liquidity (`deposit_lp`), withdrawing liquidity (`withdraw_lp`), and executing vault transfers.

### 4. `pismo_protocol::programs`
*   **Purpose**: Defines specific trading programs with their own set of rules.
*   **Key Structs**:
    *   `Program`: Contains lists of supported collateral assets, supported position assets, maximum leverage per asset, and shared price decimals.
*   **Functionality**: Initialization of programs, adding new supported collateral and position types to a program.

### 5. `pismo_protocol::accounts`
*   **Purpose**: Manages user accounts and their high-level statistics.
*   **Key Structs**:
    *   `Account`: A user-owned object linking to a `Program` and their `AccountStats`.
    *   `AccountStats`: A shared object tracking an account's number of open positions and collateral items.
*   **Functionality**: Account creation (`init_account`), tracking open positions and collateral, calculating and asserting initial margin requirements.

### 6. `pismo_protocol::collateral`
*   **Purpose**: Manages user-deposited collateral.
*   **Key Structs**:
    *   `Collateral<CoinType>`: Holds a user's specific collateral deposit.
    *   `CollateralMarker`: A shared object that tracks the amount and USD value of a specific `Collateral` object.
    *   `CollateralTransfer`: A shared object representing a pending transfer of collateral (e.g., to an LP vault during loss realization or liquidation).
*   **Functionality**: Posting collateral (`post_collateral`), withdrawing collateral (`withdraw_collateral`), combining collateral objects, and executing collateral transfers.

### 7. `pismo_protocol::positions`
*   **Purpose**: Defines the structure and core logic for trading positions.
*   **Key Structs**:
    *   `PositionType`: Enum for `Long` or `Short`.
    *   `Position`: Represents an active trade with its parameters.
    *   `TransferData`: Internal struct to determine P&L direction (to user or vault) and amount after closing a position.
*   **Functionality**: Internal logic for creating and closing positions, calculating P&L, and determining fund flow.

### 8. `pismo_protocol::position_functions`
*   **Purpose**: Provides the main entry points for users to interact with positions.
*   **Functionality**:
    *   `open_position_pyth`: Allows users to open a new long or short position. It checks initial margin requirements against the account's collateral and existing positions' UPNL (using `CollateralValueAssertionObject` and `PositionValueAssertionObject`).
    *   `close_position_pyth`: Allows users to close an existing position. It calculates P&L. If profitable, it creates `VaultTransfer` objects for payout from LP vaults. If a loss, it creates `CollateralTransfer` objects to move collateral to the appropriate LP vaults.

### 9. `pismo_protocol::value_assertion_objects`
*   **Purpose**: Ensures data consistency and up-to-date valuations during complex transactions.
*   **Key Structs**:
    *   `CollateralValueAssertionObject`: Used to sum the value of all collateral an account holds, ensuring each piece is valued with a recent price.
    *   `PositionValueAssertionObject`: Used to sum the Unrealized P&L of all open positions for an account, ensuring recent prices are used.
*   **Functionality**: These objects are passed through a series of function calls that incrementally build up a total value (for collateral) or total UPNL (for positions). The final sum is then used for checks like margin validation. They enforce that all relevant items are processed and that the prices used are not stale.

### 10. `pismo_protocol::math`
*   **Purpose**: Provides mathematical utility functions.
*   **Functionality**: Safe multiplication and division (`mul_div`) to prevent overflow.

## Key Workflows

1.  **Initialization (Admin)**:
    *   Deploy contracts.
    *   Admin calls `main::init` to create `AdminCap` and `Global` object.
    *   Admin uses `AdminCap` to add supported LPs to `Global` via `main::add_supported_lp`.
    *   Admin initializes one or more `Program`s using `programs::init_program_single_token_collateral_and_positions` or similar, defining allowed collateral/positions and leverage.

2.  **User Onboarding**:
    *   User calls `accounts::init_account` for a chosen `Program` to create their `Account` and `AccountStats`.

3.  **Depositing Collateral**:
    *   User calls `collateral::post_collateral`, providing their `Account`, `AccountStats`, the `Program`, and the `Coin<CoinType>` to deposit. This creates `Collateral` and `CollateralMarker` objects.

4.  **Opening a Position**:
    *   User initiates the process by:
        1.  Creating a `CollateralValueAssertionObject` via `value_assertion_objects::start_collateral_value_assertion`.
        2.  Iterating through all their `CollateralMarker`s and associated `PriceInfoObject`s, calling `value_assertion_objects::set_collateral_value_assertion` for each to update their values and sum them in the assertion object.
        3.  Creating a `PositionValueAssertionObject` via `value_assertion_objects::start_position_value_assertion`.
        4.  Iterating through all their existing `Position`s and associated `PriceInfoObject`s, calling `value_assertion_objects::set_position_value_assertion` for each to update their UPNL and sum them.
    *   User calls `position_functions::open_position_pyth` with their `Account`, `AccountStats`, `Program`, desired position parameters (type, amount, leverage), the `PriceInfoObject` for the asset they are trading, the populated `CollateralValueAssertionObject`, the populated `PositionValueAssertionObject`, and a vector of all their current positions.
    *   The function validates initial margin and, if successful, creates a new `Position` object.

5.  **Closing a Position**:
    *   User calls `position_functions::close_position_pyth` with their `Account`, `AccountStats`, `Program`, the `Position` to close, the relevant `PriceInfoObject` for the position asset, and vectors of all their `CollateralMarker`s, `VaultMarker`s, and all necessary `PriceInfoObject`s for collateral and vaults.
    *   The function calculates P&L.
        *   **Profit**: `VaultTransfer` objects are created to schedule payouts from LP vaults to the user.
        *   **Loss**: `CollateralTransfer` objects are created to move the user's collateral to the appropriate LP vaults to cover the loss.
    *   The `Position` object is deleted.

6.  **Liquidity Provision**:
    *   User calls `lp::deposit_lp` with a `Vault`, `VaultMarker`, and the `Coin<CoinType>` to deposit, receiving `LPToken`s in return.
    *   User calls `lp::withdraw_lp` with a `Vault`, `VaultMarker`, and their `LPToken`s to burn them and receive the underlying `Coin<CoinType>`.

7.  **Executing Transfers (Post-Trade Settlement)**:
    *   `CollateralTransfer`s (due to losses) are executed by calling `collateral::execute_collateral_transfer` with the `Collateral`, `CollateralTransfer`, target `Vault`, and `VaultMarker`. This moves the coin from the user's collateral into the LP vault.
    *   `VaultTransfer`s (due to profits) are executed by calling `lp::execute_vault_transfer` with the `Vault`, `VaultTransfer`. This moves the coin from the LP vault to the user.

## Error Handling

The contracts use `assert!` with specific error codes for different failure conditions. Common error constants are defined within each module (e.g., `E_VAULT_NOT_FOUND` in `lp.move`, `E_INVALID_INITAL_MARGIN` in `accounts.move`).

## Testing

The contracts include `#[test_only]` functions in some modules (e.g., `main::test_init`) to facilitate testing environments.

## Directory Structure

```
contracts/
├── sources/
│   ├── pismo_protocol.move   # main module (Global, AdminCap)
│   ├── tokens.move           # Token definitions and oracle interactions
│   ├── lp.move               # Liquidity pools and vaults
│   ├── programs.move         # Trading program definitions
│   ├── accounts.move         # User account management
│   ├── collateral.move       # Collateral management
│   ├── positions.move        # Position definitions and core logic
│   ├── position_functions.move # Entry points for opening/closing positions
│   ├── value_assertion_objects.move # For ensuring data consistency in transactions
│   └── utils/
│       └── math.move         # Math utilities
├── Move.toml                 # Package manifest
└── ... (build artifacts, etc.)
```