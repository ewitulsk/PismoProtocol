# Docker Deployment Guide

This guide explains how to containerize and deploy the Pismo Protocol backend using Docker.

## Quick Start

### Building the Docker Image

```bash
# Build the Docker image
docker build -t pismo-backend .

# Or build with a specific tag
docker build -t pismo-backend:latest .
```

### Running the Container

```bash
# Run the container (production mode)
docker run -d -p 5080:5080 --name pismo-backend pismo-backend

# Run in development mode
docker run -d -p 5080:5080 -e FLASK_ENV=development --name pismo-backend-dev pismo-backend

# Run with custom configuration
docker run -d -p 5080:5080 -v $(pwd)/config:/app/config:ro --name pismo-backend pismo-backend

# Run with custom config file path
docker run -d -p 5080:5080 -e CONFIG_FILE_PATH=/custom/path/config.json -v /host/path/config.json:/custom/path/config.json:ro --name pismo-backend pismo-backend
```

### Using Docker Compose

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

## Configuration

### Environment Variables

The following environment variables can be used to configure the application:

- `FLASK_ENV`: Set to `development` for development mode, defaults to production
- `CONFIG_FILE_PATH`: Path to the configuration file inside the container (defaults to `/app/config/backend_config.json`)
- `PYTHONDONTWRITEBYTECODE`: Prevents Python from writing .pyc files (set to 1)
- `PYTHONUNBUFFERED`: Ensures Python output is sent straight to terminal (set to 1)

### Configuration File

The application uses a JSON configuration file that contains:
- API endpoints for Sui network
- Contract addresses and program IDs
- Price feed URLs
- Server host and port settings

By default, the configuration is loaded from `/app/config/backend_config.json` inside the container. You can override this by:

1. Setting the `CONFIG_FILE_PATH` environment variable
2. Mounting your config file to the specified path

Example with custom config:
```bash
# Using environment variable to specify config location
docker run -d -p 5080:5080 \
  -e CONFIG_FILE_PATH=/app/custom/my_config.json \
  -v $(pwd)/my_config.json:/app/custom/my_config.json:ro \
  --name pismo-backend pismo-backend
```

### Volume Mounts

- `/app/config`: Mount your custom configuration directory
- `/app/.env`: Mount environment file if needed

## Health Checks

The container includes a health check that verifies the application is responding correctly:

```bash
# Check container health
docker ps

# Manual health check
curl http://localhost:5080/api/supportedCollateral
```

## Production Deployment

### Using Docker Compose (Recommended)

1. Copy the `docker-compose.yml` to your production server
2. Customize environment variables and volumes as needed
3. Deploy:

```bash
docker-compose -f docker-compose.yml up -d
```

### Using Docker Swarm

```bash
# Initialize swarm (if not already done)
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml pismo
```

### Using Kubernetes

Create a deployment manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pismo-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pismo-backend
  template:
    metadata:
      labels:
        app: pismo-backend
    spec:
      containers:
      - name: pismo-backend
        image: pismo-backend:latest
        ports:
        - containerPort: 5080
        env:
        - name: FLASK_ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: pismo-backend-service
spec:
  selector:
    app: pismo-backend
  ports:
  - port: 80
    targetPort: 5080
  type: LoadBalancer
```

## Monitoring and Logging

### View Logs

```bash
# Docker logs
docker logs pismo-backend

# Docker Compose logs
docker-compose logs -f backend

# Follow logs in real-time
docker logs -f pismo-backend
```

### Resource Monitoring

```bash
# Check resource usage
docker stats pismo-backend

# Inspect container
docker inspect pismo-backend
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port mapping in docker-compose.yml or docker run command
2. **Configuration not found**: Ensure config volume is properly mounted
3. **Health check failing**: Check application logs and ensure all dependencies are available

### Debug Mode

Run container in interactive mode for debugging:

```bash
docker run -it --rm pismo-backend /bin/bash
```

### Container Shell Access

```bash
# Access running container
docker exec -it pismo-backend /bin/bash

# Check application status
docker exec pismo-backend ps aux | grep python
```

## Security Considerations

- The container runs as a non-root user (`appuser`) for security
- Sensitive configuration should be provided via environment variables or mounted secrets
- Use HTTPS in production with a reverse proxy (nginx, traefik, etc.)
- Regularly update base images and dependencies

## Performance Tuning

### Gunicorn Configuration

The production setup uses gunicorn with the following optimizations:
- 4 worker processes (adjust based on CPU cores)
- 120-second timeout for long-running requests
- Connection keep-alive for better performance
- Request limits to prevent memory leaks

### Resource Limits

For production deployment, consider setting resource limits:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```
