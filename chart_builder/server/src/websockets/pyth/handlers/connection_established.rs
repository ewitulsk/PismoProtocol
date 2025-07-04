use tracing::info;

pub async fn handle_connection_established(client_id: &str, message: &str) {
    info!("🔗 Pyth Connection Established");
    info!("   Client ID: {}", client_id);
    info!("   Message: {}", message);
} 