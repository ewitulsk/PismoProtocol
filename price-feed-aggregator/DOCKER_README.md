# Docker Deployment Guide

This guide provides detailed instructions for deploying the Price Feed Aggregator using Docker.

## Files Overview

- `Dockerfile` - Main container definition
- `docker-compose.yml` - Development environment
- `docker-compose.prod.yml` - Production environment with resource limits
- `entrypoint.sh` - Container startup script
- `nginx.conf` - Reverse proxy configuration
- `Makefile` - Convenient command shortcuts
- `.dockerignore` - Files to exclude from Docker build context

## Development Deployment

### Quick Start

```bash
# Start the service
make dev

# Or manually
docker-compose up
```

This will:
- Build the Docker image
- Start the price feed aggregator
- Expose ports 8765 (WebSocket) and 8080 (REST API)
- Mount logs directory for persistence

### Development Features

- Live code mounting (if you add volume mounts)
- Verbose logging
- No resource restrictions
- Easy debugging access

## Production Deployment

### Basic Production Setup

```bash
# Start production environment
make prod

# Or manually
docker-compose -f docker-compose.prod.yml up -d
```

### Production with Reverse Proxy

```bash
# Start with Nginx reverse proxy
docker-compose -f docker-compose.prod.yml --profile with-proxy up -d
```

### Production Features

- Resource limits (512MB RAM, 0.5 CPU)
- Automatic restart policies
- Enhanced health checks
- Log persistence via Docker volumes
- Optional Nginx reverse proxy
- Security hardening

## Configuration

### Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
# Edit .env with your configuration
```

Key variables:
- `LOG_LEVEL` - Set to DEBUG, INFO, WARNING, ERROR
- `PYTH_SSE_URL` - Pyth Network endpoint
- `WS_HOST` / `WS_PORT` - WebSocket server binding
- `API_HOST` / `API_PORT` - REST API server binding

### Volume Mounts

The containers use these volume mounts:
- `./logs:/app/logs` - Log file persistence
- `./certificates:/app/certificates:ro` - SSL certificates (read-only)

## Monitoring and Maintenance

### Health Checks

Both compositions include health checks that:
- Test the REST API endpoint every 30 seconds
- Allow 60 seconds for startup in production
- Restart containers on failure

### Viewing Logs

```bash
# View logs
make logs

# View logs with timestamps
make logs-ts

# Follow logs from specific service
docker-compose logs -f price-feed-aggregator
```

### Container Management

```bash
# Check container status
make status

# Restart services
make restart

# Open shell in running container
make shell

# Clean up everything
make clean
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 8080 and 8765 are available
2. **Network connectivity**: Container checks network on startup
3. **Permission issues**: Logs directory may need proper permissions

### Debug Mode

To run with debug logging:

```bash
# Set in .env file
LOG_LEVEL=DEBUG

# Or pass as environment variable
docker-compose run -e LOG_LEVEL=DEBUG price-feed-aggregator
```

### Running Tests

```bash
# Run tests in container
make test

# Or manually
docker-compose run --rm price-feed-aggregator python -m pytest tests/
```

## Security Considerations

### Production Security

- Containers run as non-root user
- Read-only certificate mounting
- Resource limits prevent resource exhaustion
- Health checks enable automatic recovery

### Network Security

When using the Nginx proxy:
- API accessible via `/api/` path
- WebSocket accessible via `/ws` path
- Direct container ports not exposed

### SSL/TLS

For HTTPS/WSS in production:
1. Place SSL certificates in `./ssl/` directory
2. Update `nginx.conf` with SSL configuration
3. Uncomment SSL sections in the Nginx config

## Scaling

### Horizontal Scaling

To run multiple instances:

```bash
# Scale to 3 instances
docker-compose -f docker-compose.prod.yml up -d --scale price-feed-aggregator=3
```

Note: You'll need a load balancer to distribute WebSocket connections.

### Resource Scaling

Adjust resource limits in `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '1.0'
```

## Backup and Recovery

### Data Backup

```bash
# Backup logs
docker cp $(docker-compose ps -q price-feed-aggregator):/app/logs ./backup-logs

# Backup volumes
docker run --rm -v price-feed-logs:/data -v $(pwd):/backup alpine tar czf /backup/logs-backup.tar.gz -C /data .
```

### Recovery

```bash
# Restore logs
docker run --rm -v price-feed-logs:/data -v $(pwd):/backup alpine tar xzf /backup/logs-backup.tar.gz -C /data
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Deploy Price Feed Aggregator

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to production
        run: |
          docker-compose -f docker-compose.prod.yml pull
          docker-compose -f docker-compose.prod.yml up -d
```
