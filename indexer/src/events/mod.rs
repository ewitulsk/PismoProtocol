// Declare event submodules
pub mod common;
pub mod position_created;
pub mod position_closed;
pub mod vault_created;
pub mod new_account_event;
pub mod collateral_deposit_event;
pub mod start_collateral_value_assertion_event;
pub mod collateral_transfer_created;
pub mod vault_transfer_created;

pub use position_created::PositionCreatedEvent as MovePositionCreatedEvent;
pub use position_closed::PositionClosedEvent as MovePositionClosedEvent;
pub use vault_created::VaultCreatedEvent as MoveVaultCreatedEvent;
pub use new_account_event::NewAccountEvent as MoveNewAccountEvent;
pub use collateral_deposit_event::CollateralDepositEvent as MoveCollateralDepositEvent;
pub use start_collateral_value_assertion_event::StartCollateralValueAssertionEvent as MoveStartCollateralValueAssertionEvent;
pub use collateral_transfer_created::CollateralTransferCreatedEvent as MoveCollateralTransferCreatedEvent;
pub use vault_transfer_created::VaultTransferCreatedEvent as MoveVaultTransferCreatedEvent;