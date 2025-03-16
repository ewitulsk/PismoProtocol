# Deploying Price Feed Aggregator with NixPacks

This guide explains how to deploy the Price Feed Aggregator service using NixPacks.

## Prerequisites

- [NixPacks CLI](https://nixpacks.com/docs/install) installed
- Docker installed (for local testing)

## Building the NixPacks Image

1. Navigate to the project root directory (where this file is located)

2. Build the NixPacks image:
   ```bash
   ./build_nixpacks.sh
   ```
   or manually:
   ```bash
   nixpacks build . --name price-feed-aggregator
   ```

3. Run the image locally for testing:
   ```bash
   docker run -p 8765:8765 -p 8080:8080 price-feed-aggregator
   ```

## Alternative: Building with Docker

If you encounter issues with NixPacks, you can use the provided Dockerfile instead:

1. Build the Docker image:
   ```bash
   ./build_docker.sh
   ```
   or manually:
   ```bash
   docker build -t price-feed-aggregator .
   ```

2. Run the image locally for testing:
   ```bash
   docker run -p 8765:8765 -p 8080:8080 price-feed-aggregator
   ```

## Environment Variables

The following environment variables can be set:

- `PORT`: The port for the WebSocket server (default: 8765)
- `API_PORT`: The port for the REST API (default: 8080)

## Deployment to Cloud Platforms

### Deploying to Render

1. Create a new Web Service on Render
2. Connect your repository
3. Select "NixPacks" as the build method
4. Set the environment variables as needed
5. Deploy

### Deploying to Railway

1. Create a new project on Railway
2. Connect your repository
3. Railway will automatically detect the NixPacks configuration from `nixpacks.toml` and `railway.toml`
4. If NixPacks fails, Railway will fall back to using the Dockerfile
5. Set the required environment variables:
   - `PORT`: The port for the WebSocket server (default: 8765)
   - `API_PORT`: The port for the REST API (default: 8080)
6. Deploy your application
7. Monitor your application through the Railway dashboard

The repository includes the following files for Railway deployment:
- `nixpacks.toml`: Configures the build process
- `railway.toml`: Configures Railway-specific settings
- `Procfile`: Defines the web process
- `Dockerfile`: Alternative build method if NixPacks fails
- `.env.example`: Documents required environment variables

### Deploying to Fly.io

1. Install the Fly CLI
2. Initialize your app:
   ```bash
   fly launch --no-deploy
   ```
3. Deploy your app:
   ```bash
   fly deploy
   ```

## Troubleshooting

- If you encounter issues with dependencies, check the `nixpacks.toml` file and ensure all required packages are listed.
- For port binding issues, make sure the application is configured to listen on `0.0.0.0` and not just `localhost`.
- Check logs using `docker logs` for local deployments or the platform-specific logging interface for cloud deployments.
- If NixPacks build fails with pip errors, try using the Docker build method instead. 