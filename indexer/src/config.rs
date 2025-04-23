use anyhow::{Result, Context};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub package_id: String,
    pub remote_store_url: String,
    pub start_checkpoint: u64,
    pub concurrency: usize,
    pub listen_addr: String,
}

impl Config {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let config_path = path.as_ref();
        let builder = config::Config::builder()
            .add_source(config::File::from(config_path)
                .required(true))
            // Optionally add environment variable overrides here if needed
            // .add_source(config::Environment::with_prefix("INDEXER"))
            ;

        let settings = builder.build()
            .with_context(|| format!("Failed to build configuration from path: {:?}", config_path))?;

        settings.try_deserialize()
            .with_context(|| format!("Failed to deserialize configuration from path: {:?}", config_path))
    }
} 