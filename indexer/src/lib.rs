#![allow(dead_code)] // Allow unused code for now

// Declare the main modules
pub mod config;
pub mod db;
pub mod events;
pub mod handlers;
pub mod router;
pub mod worker;

// Re-export key components if needed, e.g.:
// pub use worker::PositionEventWorker;

// You might add shared configuration or error types here later. 