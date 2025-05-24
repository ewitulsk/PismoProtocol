FROM rust:latest AS builder

WORKDIR /usr/src/indexer

# Install clang, libclang-dev for bindgen, and build-essential for general C compilation
RUN apt-get update && apt-get install -y clang libclang-dev build-essential

# Install diesel_cli
RUN cargo install diesel_cli --no-default-features --features postgres

COPY . .

RUN cargo build --release

FROM debian:buster-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl1.1 && rm -rf /var/lib/apt/lists/*

# Copy diesel_cli from builder
COPY --from=builder /usr/local/cargo/bin/diesel /usr/local/bin/diesel

# Copy migrations, diesel.toml, and config files
COPY ./diesel.toml /usr/src/app/diesel.toml
COPY ./config /usr/src/app/config
COPY ./src/db/postgres/migrations /usr/src/app/src/db/postgres/migrations

# Copy the application binary
COPY --from=builder /usr/src/indexer/target/release/indexer /usr/local/bin/indexer

# Copy and set up the entrypoint script
COPY ./entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /usr/src/app

# Set CONFIG_PATH, though it can be overridden by docker-compose
ENV CONFIG_PATH=config/testnet.toml

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# CMD is removed as the entrypoint script now handles the app execution 