use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait BaseRepository<T, NewT> 
where
    T: Send + Sync,
    NewT: Send + Sync,
{
    async fn find(&self, id: &str) -> Result<Option<T>>;
    async fn create(&self, new_item: NewT) -> Result<T>;
    async fn update(&self, id: &str, updated_item: T) -> Result<T>;
    async fn delete(&self, id: &str) -> Result<usize>;
} 