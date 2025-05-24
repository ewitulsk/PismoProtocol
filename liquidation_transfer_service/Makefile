# Makefile for Liquidation Transfer Service

.PHONY: help build up down logs clean dev test

# Default target
help:
	@echo "Available targets:"
	@echo "  build    - Build the Docker image"
	@echo "  up       - Start the service with docker-compose"
	@echo "  down     - Stop the service"
	@echo "  logs     - Show service logs"
	@echo "  clean    - Clean up Docker images and containers"
	@echo "  dev      - Run in development mode"
	@echo "  test     - Run tests"
	@echo "  shell    - Get a shell in the running container"

# Build the Docker image
build:
	docker-compose build

# Start the service
up:
	docker-compose up -d

# Stop the service
down:
	docker-compose down

# Show logs
logs:
	docker-compose logs -f

# Clean up
clean:
	docker-compose down -v --remove-orphans
	docker system prune -f

# Development mode
dev:
	npm run dev

# Run tests
test:
	npm test

# Get a shell in the running container
shell:
	docker-compose exec liquidation-transfer-service sh

# Build and start
start: build up

# Restart the service
restart: down up
