# PismoProtocol Price Feed Aggregator

A service that provides price feeds from various sources including Pyth Network.

## Deployment to Railway

This repository is configured for easy deployment to [Railway](https://railway.app/), a platform for deploying applications.

### Prerequisites

- A Railway account
- Git repository connected to Railway

### Deployment Steps

1. Fork or clone this repository
2. Create a new project in Railway
3. Connect your repository to Railway
4. Railway will automatically detect the configuration:
   - First, it will try to build using NixPacks with the `nixpacks.toml` configuration
   - If that fails, it will fall back to using the provided `Dockerfile`
5. Set up the required environment variables:
   - `PORT`: The port for the WebSocket server (default: 8765)
   - `API_PORT`: The port for the REST API (default: 8080)
6. Deploy your application

### Monitoring and Logs

Once deployed, you can monitor your application and view logs through the Railway dashboard.

## Local Development and Testing

### Building with NixPacks

```bash
./build_nixpacks.sh
```

### Building with Docker

If you encounter issues with NixPacks, you can use Docker instead:

```bash
./build_docker.sh
```

### Running the Container

```bash
docker run -p 8765:8765 -p 8080:8080 price-feed-aggregator
```

For more detailed local development instructions, see the documentation in the `price-feed-aggregator` directory.

## Additional Documentation

For more detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).
