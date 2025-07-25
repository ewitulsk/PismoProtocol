pub mod base;
pub mod oracle;
pub mod price_feed;

pub type DBPool = diesel_async::pooled_connection::deadpool::Pool<diesel_async::AsyncPgConnection>; 