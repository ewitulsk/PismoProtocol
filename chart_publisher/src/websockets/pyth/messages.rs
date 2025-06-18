use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PythMessage {
    Subscribe { ids: Vec<String> },
        
    ConnectionEstablished {
        client_id: String,
        message: String,
    },
    
    Response { 
        status: String
    },
} 