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

#[derive(Clone, Default)]
struct AppState {
    subscribers: Arc<Subscribers>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let state = AppState {
        subscribers: Arc::new(DashMap::new()),
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

    // First message is expected to be subscription JSON {"type":"subscribe","uuid":"..."}
    // Keep variable for uuid to remove later
    let mut maybe_uuid: Option<Uuid> = None;

    while let Some(Ok(msg)) = receiver_ws.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(SubMessage { r#type, uuid }) = serde_json::from_str::<SubMessage>(&text) {
                    if r#type == "subscribe" {
                        match Uuid::parse_str(&uuid) {
                            Ok(parsed) => {
                                state.subscribers.insert(parsed, sender_tx.clone());
                                maybe_uuid = Some(parsed);
                                let _ = sender_tx.send(Message::Text("subscribed".into()));
                            }
                            Err(e) => {
                                let _ = sender_tx.send(Message::Text(format!("invalid uuid: {}", e)));
                            }
                        }
                    }
                }
            }
            Message::Close(_) => {
                break;
            }
            _ => {}
        }
    }

    // Connection ended. Clean up.
    if let Some(id) = maybe_uuid {
        state.subscribers.remove(&id);
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
    if let Some(sender) = state.subscribers.get(&uuid) {
        if sender.send(Message::Binary(body.to_vec())).is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}

// --------- End HTTP handlers ---------- 