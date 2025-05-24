# Stage 1: Build/Install diesel_cli
FROM rust:slim AS diesel_builder
# Using rust:slim as it's smaller than rust:latest but still has cargo
WORKDIR /usr/src/diesel_installer
RUN cargo install diesel_cli --no-default-features --features postgres

# Stage 2: Final application image
FROM debian:buster-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

# Copy diesel_cli from the diesel_builder stage
COPY --from=diesel_builder /usr/local/cargo/bin/diesel /usr/local/bin/diesel
RUN chmod +x /usr/local/bin/diesel # Ensure diesel is executable

# Copy migrations, diesel.toml, and config files
COPY ./diesel.toml /usr/src/app/diesel.toml
COPY ./config /usr/src/app/config
COPY ./src/db/postgres/migrations /usr/src/app/src/db/postgres/migrations

# COPY THE PRECOMPILED APPLICATION BINARY
# Ensure you have a precompiled 'indexer' binary in the root of the Docker build context (e.g., ./indexer)
COPY ./indexer /usr/local/bin/indexer
RUN chmod +x /usr/local/bin/indexer # Ensure the indexer binary is executable

# Copy and set up the entrypoint script
COPY ./entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /usr/src/app

# Set CONFIG_PATH, though it can be overridden by docker-compose
ENV CONFIG_PATH=config/testnet.toml

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# CMD is removed as the entrypoint script now handles the app execution 