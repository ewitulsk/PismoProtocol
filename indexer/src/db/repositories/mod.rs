use diesel::r2d2::{self, ConnectionManager};
use diesel::pg::PgConnection;

// Define the common DBPool type alias, making it available to submodules
pub type DBPool = r2d2::Pool<ConnectionManager<PgConnection>>;

// Declare the repository implementation modules
pub mod open_position_events;
pub mod close_position_events;
pub mod vault_created_events;
pub mod new_account_event;
pub mod collateral_deposit_event;
// Declare the utility module
pub mod repositories_utils;

// Re-export repositories for easier access
