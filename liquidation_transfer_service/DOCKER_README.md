# Docker Deployment for Liquidation Transfer Service

This guide explains how to deploy the Liquidation Transfer Service using Docker.

## Prerequisites

- Docker and Docker Compose installed
- A valid Sui private key
- Access to Sui testnet/mainnet

## Quick Start

1. **Copy the environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the .env file:**
   ```bash
   # Add your Sui private key
   SUI_PRIVATE_KEY=your_actual_private_key_here
   ```

3. **Build and start the service:**
   ```bash
   make start
   # or
   docker-compose up -d --build
   ```

4. **Check the service status:**
   ```bash
   make logs
   # or
   docker-compose logs -f
   ```

5. **Test the health endpoint:**
   ```bash
   curl http://localhost:3002/health
   ```

## Configuration

The service can be configured through:

1. **Environment variables** in `.env` file
2. **TOML configuration** in `config/config.toml`

Priority: Environment variables override TOML configuration.

### Required Environment Variables

- `SUI_PRIVATE_KEY`: Your Sui private key for signing transactions

### Optional Environment Variables

- `SUI_RPC_URL`: Sui RPC endpoint (default: testnet)
- `PACKAGE_ID`: Smart contract package ID
- `LIQUIDATION_SERVICE_PORT`: Service port (default: 3002)
- `PYTH_STATE_OBJECT_ID`: Pyth oracle state object
- `WORMHOLE_STATE_ID`: Wormhole state object
- `HERMES_ENDPOINT`: Hermes endpoint for price feeds

## Available Commands

```bash
make help          # Show all available commands
make build         # Build Docker image
make up            # Start service
make down          # Stop service
make logs          # Show logs
make clean         # Clean up containers and images
make restart       # Restart service
make shell         # Get shell access to container
```

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /execute_vault_transfer` - Execute vault transfers
- `POST /execute_collateral_transfer` - Execute collateral transfers
- `POST /execute_account_liquidation` - Execute account liquidations

## Monitoring

### Health Check
The service includes a built-in health check that monitors:
- Service responsiveness
- Port availability
- Basic service status

### Logs
View real-time logs:
```bash
make logs
```

### Container Status
Check if the container is running:
```bash
docker-compose ps
```

## Troubleshooting

### Common Issues

1. **Service won't start:**
   - Check if the port 3002 is already in use
   - Verify your `.env` file has valid configuration
   - Check Docker logs: `make logs`

2. **Authentication errors:**
   - Verify your `SUI_PRIVATE_KEY` is correct
   - Ensure the private key format is compatible

3. **Network connectivity:**
   - Check if the Sui RPC URL is accessible
   - Verify firewall settings

### Debug Mode

To run with more verbose logging:
```bash
docker-compose run --rm liquidation-transfer-service npm run dev
```

## Production Deployment

For production deployment:

1. Use a proper secrets management system for `SUI_PRIVATE_KEY`
2. Configure proper logging and monitoring
3. Set up reverse proxy (nginx) if needed
4. Configure appropriate resource limits
5. Set up backup and recovery procedures

## Security Notes

- Never commit `.env` files to version control
- Use secure methods to manage private keys
- Run containers as non-root user (already configured)
- Regularly update base images and dependencies
