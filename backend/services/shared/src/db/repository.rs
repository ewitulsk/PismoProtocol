use async_trait::async_trait;
use sqlx::{Pool, Postgres, Row};
use crate::error::{SharedError, SharedResult};
use std::fmt::Debug;

pub type DbPool = Pool<Postgres>;

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

pub struct BaseRepository {
    pub pool: DbPool,
}

impl BaseRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }
}