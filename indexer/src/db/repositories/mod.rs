use diesel::r2d2::{self, ConnectionManager, Pool};
use diesel::pg::PgConnection;

// Define the common DBPool type alias, making it available to submodules
pub type DBPool = r2d2::Pool<ConnectionManager<PgConnection>>;

// Declare the repository implementation modules
pub mod open_position_events;
pub mod close_position_events;
pub mod vault_created_events;
pub mod new_account_event;
pub mod collateral_deposit_event;
pub mod start_collateral_value_assertion_event;
pub mod vault_transfer;
pub mod collateral_transfer;

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

// Pool definition
use std::env;
use anyhow::Result;

pub fn establish_connection_pool() -> Result<DBPool> {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let manager = ConnectionManager::<PgConnection>::new(database_url);
    Pool::builder().build(manager).map_err(anyhow::Error::from)
}
