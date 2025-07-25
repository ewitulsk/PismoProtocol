use anyhow::{Result, Context};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Debug, Clone)]
pub struct Indexer {
    pub package_id: String,
    pub remote_store_url: String,
    pub start_checkpoint: u64,
    pub concurrency: usize,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Database {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub dbname: String,
    pub pool_size: u32,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Config {
    pub indexer: Indexer,
    pub database: Database,
}

impl Config {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let config_path = path.as_ref();
        let builder = config::Config::builder()
            .add_source(config::File::from(config_path)
                .required(true))
            ;

        let settings = builder.build()
            .with_context(|| format!("Failed to build configuration from path: {:?}", config_path))?;

        settings.try_deserialize()
            .with_context(|| format!("Failed to deserialize configuration from path: {:?}", config_path))
    }

    pub fn database_url(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            self.database.user,
            self.database.password,
            self.database.host,
            self.database.port,
            self.database.dbname
        )
    }
} 