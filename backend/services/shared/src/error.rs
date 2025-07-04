use std::fmt;

#[derive(Debug)]
pub enum SharedError {
    DatabaseError(sqlx::Error),
    ConfigError(String),
    ValidationError(String),
    NetworkError(reqwest::Error),
    ParseError(String),
    NotFound(String),
    InvalidInput(String),
}

impl fmt::Display for SharedError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            SharedError::DatabaseError(e) => write!(f, "Database error: {}", e),
            SharedError::ConfigError(msg) => write!(f, "Configuration error: {}", msg),
            SharedError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            SharedError::NetworkError(e) => write!(f, "Network error: {}", e),
            SharedError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            SharedError::NotFound(msg) => write!(f, "Not found: {}", msg),
            SharedError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
        }
    }
}

impl std::error::Error for SharedError {}

impl From<sqlx::Error> for SharedError {
    fn from(error: sqlx::Error) -> Self {
        SharedError::DatabaseError(error)
    }
}

impl From<reqwest::Error> for SharedError {
    fn from(error: reqwest::Error) -> Self {
        SharedError::NetworkError(error)
    }
}

pub type SharedResult<T> = Result<T, SharedError>;