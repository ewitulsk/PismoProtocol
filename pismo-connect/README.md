# Pismo Connect – "Wallet Connect" for Sui

Pismo Connect is a lightweight Rust/Axum backend that replicates the core pattern of **Wallet Connect** but for the Sui ecosystem.
It allows a browser/frontend to pair with a mobile (or desktop) wallet via a UUID-encoded QR code and exchange arbitrary payloads over WebSockets.

---

## 🏗 Features

| Feature | Description |
|---------|-------------|
| **QR generation** | `GET /v0/generate` returns a PNG QR containing a freshly‑minted UUID. |
| **Pairing** | Wallets connect over `websocket /ws` and send a `wallet-subscribe` message with that UUID. Front‑ends do the same with `frontend-subscribe`. |
| **Message fan‑out** | • `POST /v0/send-tx/{uuid}` sends arbitrary bytes to the paired wallet.<br>• Any text/binary message coming **from** the wallet is automatically forwarded to the paired frontend. |
| **In‑memory routing** | Uses `DashMap` to map UUID → WebSocket sender without external storage. |

---

## 🚀 Getting Started

```bash
# 1. Move into the project directory
cd pismo-connect

# 2. Build and run (requires Rust ≥1.75, cargo, and a C compiler)
cargo run --release

# The server listens on 0.0.0.0:8080
```

Optional environment variable

| Variable | Purpose | Default |
|----------|---------|---------|
| `BIND_ADDR` | Change the bind address/port. | `0.0.0.0:8080` |

> **Note**: Currently this var is _not_ wired in the code; feel free to PR if you need it.

---

## 📡 HTTP Routes

| Method | Path | Purpose | Request Body | Response |
|--------|------|---------|--------------|----------|
| `GET` | `/v0/generate` | Mint a UUID & get its QR code | – | `200 OK` `image/png` – PNG bytes containing the QR. |
| `POST` | `/v0/send-tx/{uuid}` | Send raw bytes to the paired wallet | Raw binary (`application/octet-stream`) | `200 OK` if delivered, `404` if no wallet for that UUID, `500` on send error. |

---

## 🔌 WebSocket Endpoint

```
/ws  (permanent, no sub‑path)
```

Immediately after connecting, the client **must** send one of the subscription messages below. Subsequent messages follow the pairing logic.

### Subscription Messages

| Role | JSON Payload | Description |
|------|--------------|-------------|
| Wallet | `{ "type": "wallet-subscribe", "uuid": "<uuid>" }` | Register this socket as the wallet for the UUID. |
| Frontend | `{ "type": "frontend-subscribe", "uuid": "<uuid>" }` | Register this socket as the front‑end for the UUID. |

Successful subscriptions receive a confirmation text frame:

```
"subscribed"              # sent to wallet
"frontend-subscribed"     # sent to frontend
```

### Message Flow

1. Front‑end fetches `/v0/generate`, shows the QR to the user.
2. Wallet scans QR, connects to `/ws`, sends `wallet-subscribe`.
3. Front‑end also connects to `/ws`, sends `frontend-subscribe`.
4. When the dApp wants the wallet to sign something it `POST`s `/v0/send-tx/{uuid}` with the transaction bytes.
5. Backend pushes the binary frame to the wallet socket.
6. Wallet signs or rejects, then sends back **text** or **binary** frames with results.
7. Backend forwards those frames to the paired front‑end socket.

### Forwarding Rules

| Direction | Transport | Notes |
|-----------|-----------|-------|
| HTTP ➜ Wallet | `POST /v0/send-tx/{uuid}` → WebSocket binary | 1‑way only. |
| Wallet ➜ Frontend | Any *text* or *binary* WS message | Auto‑forwarded. |

> No other message types are parsed; ping/pong/close are handled by Axum.

---

## 🔒 Security & Production Notes

* This prototype keeps state **in‑memory**; pairing is lost on restart.
* There is **no authentication** or origin checking. Place behind HTTPS and implement access control before production use.
* Rate‑limit `/v0/generate` to prevent DoS.

---

## 📜 License

MIT © 2024 Pismo Synthetix — Use at your own risk. 