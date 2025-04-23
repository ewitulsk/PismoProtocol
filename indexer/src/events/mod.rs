// Declare event submodules
pub mod common;
pub mod position_created;
pub mod position_closed;

// Optional: Re-export the main event structs if needed elsewhere
pub use position_created::PositionCreatedEvent;
pub use position_closed::PositionClosedEvent; 