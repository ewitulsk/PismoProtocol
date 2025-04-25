// Declare event submodules
pub mod common;
pub mod position_created;
pub mod position_closed;
pub mod vault_created;
pub mod new_account_event;
pub mod collateral_deposit_event;

// Optional: Re-export the main event structs if needed elsewhere
pub use new_account_event::NewAccountEvent as MoveNewAccountEvent;
pub use collateral_deposit_event::CollateralDepositEvent as MoveCollateralDepositEvent; 