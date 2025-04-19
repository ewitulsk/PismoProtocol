use std::{net::SocketAddr, sync::Arc};
use std::io::Cursor;

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path, State},
    http::{header, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use bytes::Bytes;
use dashmap::DashMap;
use futures::{sink::SinkExt, stream::StreamExt};
use qrcode::QrCode;
use serde::Deserialize;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use tracing::{error, info};
use uuid::Uuid;

// Type alias for subscribers map
// Maps UUID to a channel that will deliver outgoing websocket messages
pub type Subscribers = DashMap<Uuid, UnboundedSender<Message>>;

// Renamed Subscribers -> Wallets for clarity
pub type Wallets = DashMap<Uuid, UnboundedSender<Message>>;

// after subscribers alias
pub type Frontends = DashMap<Uuid, UnboundedSender<Message>>;

#[derive(Clone, Default)]
struct AppState {
    // Clients that subscribe with "wallet-subscribe" (e.g. mobile wallet) and will receive HTTP forwarded bytes
    wallets: Arc<Wallets>,
    // Frontend websocket connections that subscribe with "frontend-subscribe" and will receive messages coming from the corresponding subscriber
    frontends: Arc<Frontends>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let state = AppState {
        wallets: Arc::new(DashMap::new()),
        frontends: Arc::new(DashMap::new()),
    };

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/v0/generate", get(generate_qr))
        .route("/v0/send-tx/:uuid", post(send_tx))
        .with_state(state);

    let addr: SocketAddr = "0.0.0.0:8080".parse().unwrap();
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    info!("Listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}

// -------- Websocket handler ---------
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(stream: WebSocket, state: AppState) {
    let (mut sender_ws, mut receiver_ws) = stream.split();
    let (sender_tx, mut receiver_tx): (UnboundedSender<Message>, UnboundedReceiver<Message>) =
        tokio::sync::mpsc::unbounded_channel();

    // Task: forward messages from internal channel to websocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = receiver_tx.recv().await {
            if sender_ws.send(msg).await.is_err() {
                break;
            }
        }
    });

    // First message is expected to be subscription JSON {"type":"wallet-subscribe","uuid":"..."} or {"type":"frontend-subscribe","uuid":"..."}
    // Keep variable for uuid and role to remove later
    let mut maybe_uuid: Option<Uuid> = None;
    let mut role: Option<Role> = None;

    #[derive(Clone, Copy)]
    enum Role {
        Wallet,
        Frontend,
    }

    while let Some(Ok(msg)) = receiver_ws.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(SubMessage { r#type, uuid }) = serde_json::from_str::<SubMessage>(&text) {
                    match r#type.as_str() {
                        "wallet-subscribe" => {
                            match Uuid::parse_str(&uuid) {
                                Ok(parsed) => {
                                    state.wallets.insert(parsed, sender_tx.clone());
                                    maybe_uuid = Some(parsed);
                                    role = Some(Role::Wallet);
                                    let _ = sender_tx.send(Message::Text("subscribed".into()));
                                }
                                Err(e) => {
                                    let _ = sender_tx.send(Message::Text(format!("invalid uuid: {}", e)));
                                }
                            }
                        }
                        "frontend-subscribe" => {
                            match Uuid::parse_str(&uuid) {
                                Ok(parsed) => {
                                    state.frontends.insert(parsed, sender_tx.clone());
                                    maybe_uuid = Some(parsed);
                                    role = Some(Role::Frontend);
                                    let _ = sender_tx.send(Message::Text("frontend-subscribed".into()));
                                }
                                Err(e) => {
                                    let _ = sender_tx.send(Message::Text(format!("invalid uuid: {}", e)));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                // For non-control text messages from a wallet, forward to frontend
                if let Some(u) = maybe_uuid {
                    if matches!(role, Some(Role::Wallet)) {
                        if let Some(front) = state.frontends.get(&u) {
                            let _ = front.send(Message::Text(text));
                        }
                    }
                }
            }
            Message::Binary(bin) => {
                // Forward binary messages from wallet to frontend
                if let (Some(u), Some(Role::Wallet)) = (maybe_uuid, role) {
                    if let Some(front) = state.frontends.get(&u) {
                        let _ = front.send(Message::Binary(bin.clone()));
                    }
                }

                // ignore otherwise
            }
            Message::Close(_) => {
                break;
            }
            _ => {}
        }
    }

    // Connection ended. Clean up.
    if let Some(id) = maybe_uuid {
        match role {
            Some(Role::Wallet) => {
                state.wallets.remove(&id);
            }
            Some(Role::Frontend) => {
                state.frontends.remove(&id);
            }
            None => {}
        }
    }

    // ensure send task ends
    send_task.abort();
}

#[derive(Deserialize)]
struct SubMessage {
    r#type: String,
    uuid: String,
}

// -------- End Websocket handler ---------

// ---------- HTTP handlers --------------
async fn generate_qr() -> impl IntoResponse {
    // generate UUID
    let id = Uuid::new_v4();

    // generate QR code encoding the UUID string
    let code = match QrCode::new(id.to_string()) {
        Ok(c) => c,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // render to image buffer
    let image = code.render::<image::Luma<u8>>().build();

    let mut cursor = Cursor::new(Vec::new());
    if image::DynamicImage::ImageLuma8(image)
        .write_to(&mut cursor, image::ImageOutputFormat::Png)
        .is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let png_bytes = cursor.into_inner();

    (
        StatusCode::OK,
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("image/png"),
        )],
        Bytes::from(png_bytes),
    ).into_response()
}

async fn send_tx(
    Path(uuid): Path<Uuid>,
    State(state): State<AppState>,
    body: Bytes,
) -> impl IntoResponse {
    if let Some(sender) = state.wallets.get(&uuid) {
        if sender.send(Message::Binary(body.to_vec())).is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}

// --------- End HTTP handlers ---------- 