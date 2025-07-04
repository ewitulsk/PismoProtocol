use shared::db::{DbPool, AsyncRepository};
use shared::error::{SharedError, SharedResult};
use async_trait::async_trait;
use std::fmt::Debug;

// Base Repository trait for common CRUD operations
#[async_trait]
pub trait Repository<T, K>
where
    T: Send + Sync + Debug,
    K: Send + Sync + Debug,
{
    async fn new(pool: DbPool) -> Self;
    async fn create(&self, item: T) -> SharedResult<T>;
    async fn find(&self, id: K) -> SharedResult<Option<T>>;
    async fn update(&self, id: K, item: T) -> SharedResult<T>;
    async fn delete(&self, id: K) -> SharedResult<bool>;
    async fn find_all(&self) -> SharedResult<Vec<T>>;
}

// Declare the repository implementation modules
pub mod open_position_events;
pub mod close_position_events;
pub mod vault_created_events;
pub mod new_account_event;
pub mod collateral_deposit_event;
pub mod start_collateral_value_assertion_event;
pub mod vault_transfer;
pub mod collateral_transfer;
pub mod position_liquidated_event;
pub mod collateral_marker_liquidated_event;
pub mod collateral_combine_event;
pub mod collateral_withdraw_event;

// Declare the utility module
pub mod repositories_utils;

// Exports
pub use open_position_events::OpenPositionEventRepository;
pub use close_position_events::ClosePositionEventRepository;
pub use vault_created_events::VaultCreatedEventRepository;
pub use new_account_event::NewAccountEventRepository;
pub use collateral_deposit_event::CollateralDepositEventRepository;
pub use start_collateral_value_assertion_event::StartCollateralValueAssertionEventRepository;
pub use vault_transfer::VaultTransferRepository;
pub use collateral_transfer::CollateralTransferRepository;
pub use position_liquidated_event::PositionLiquidatedEventRepository;
pub use collateral_marker_liquidated_event::CollateralMarkerLiquidatedEventRepository;
pub use collateral_combine_event::CollateralCombineEventRepository;
pub use collateral_withdraw_event::CollateralWithdrawEventRepository;
