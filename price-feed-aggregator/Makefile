# Makefile for Price Feed Aggregator Docker management

.PHONY: help build up down logs restart clean test dev prod

# Default target
help:
	@echo "Available commands:"
	@echo "  build     - Build the Docker image"
	@echo "  dev       - Start development environment"
	@echo "  prod      - Start production environment"
	@echo "  up        - Start services in detached mode"
	@echo "  down      - Stop and remove services"
	@echo "  logs      - View service logs"
	@echo "  restart   - Restart services"
	@echo "  clean     - Clean up Docker resources"
	@echo "  test      - Run tests in container"

# Build the Docker image
build:
	docker-compose build

# Start development environment
dev:
	docker-compose up

# Start production environment
prod:
	docker-compose -f docker-compose.prod.yml up -d

# Start services in detached mode
up:
	docker-compose up -d

# Stop and remove services
down:
	docker-compose down
	docker-compose -f docker-compose.prod.yml down

# View service logs
logs:
	docker-compose logs -f

# Restart services
restart:
	docker-compose restart

# Clean up Docker resources
clean:
	docker-compose down --volumes --remove-orphans
	docker-compose -f docker-compose.prod.yml down --volumes --remove-orphans
	docker system prune -f
	docker volume prune -f

# Run tests in container
test:
	docker-compose run --rm price-feed-aggregator python -m pytest tests/

# Build and start development environment
dev-fresh: clean build dev

# Build and start production environment
prod-fresh: clean build prod

# Show status of containers
status:
	docker-compose ps

# Open shell in running container
shell:
	docker-compose exec price-feed-aggregator /bin/bash

# Show container logs with timestamps
logs-ts:
	docker-compose logs -f -t
