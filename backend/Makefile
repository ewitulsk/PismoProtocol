# Makefile for Pismo Protocol Backend Docker Operations

# Variables
IMAGE_NAME = pismo-backend
CONTAINER_NAME = pismo-backend
PORT = 5080
VERSION = latest

# Build commands
.PHONY: build
build:
	docker build -t $(IMAGE_NAME):$(VERSION) .

.PHONY: build-no-cache
build-no-cache:
	docker build --no-cache -t $(IMAGE_NAME):$(VERSION) .

# Run commands
.PHONY: run
run:
	docker run -d -p $(PORT):$(PORT) --name $(CONTAINER_NAME) $(IMAGE_NAME):$(VERSION)

.PHONY: run-dev
run-dev:
	docker run -d -p $(PORT):$(PORT) -e FLASK_ENV=development --name $(CONTAINER_NAME)-dev $(IMAGE_NAME):$(VERSION)

.PHONY: run-custom-config
run-custom-config:
	@echo "Usage: make run-custom-config CONFIG_PATH=/path/to/config.json"
	@if [ -z "$(CONFIG_PATH)" ]; then echo "ERROR: CONFIG_PATH not specified"; exit 1; fi
	docker run -d -p $(PORT):$(PORT) -e CONFIG_FILE_PATH=$(CONFIG_PATH) -v "$(CONFIG_PATH):/app/config/backend_config.json:ro" --name $(CONTAINER_NAME) $(IMAGE_NAME):$(VERSION)

.PHONY: test-config
test-config:
	@echo "Testing configuration loading..."
	docker run --rm -e CONFIG_FILE_PATH=/app/config/backend_config.json $(IMAGE_NAME):$(VERSION) python -c "from async_backend import load_config; print('Config loaded successfully:', load_config())"

.PHONY: run-interactive
run-interactive:
	docker run -it --rm -p $(PORT):$(PORT) $(IMAGE_NAME):$(VERSION) /bin/bash

# Docker Compose commands
.PHONY: up
up:
	docker-compose up -d

.PHONY: down
down:
	docker-compose down

.PHONY: logs
logs:
	docker-compose logs -f

.PHONY: restart
restart:
	docker-compose restart

.PHONY: rebuild
rebuild:
	docker-compose up -d --build

# Container management
.PHONY: stop
stop:
	docker stop $(CONTAINER_NAME) || true

.PHONY: start
start:
	docker start $(CONTAINER_NAME)

.PHONY: remove
remove:
	docker rm -f $(CONTAINER_NAME) || true

.PHONY: clean
clean: remove
	docker rmi $(IMAGE_NAME):$(VERSION) || true

# Utility commands
.PHONY: shell
shell:
	docker exec -it $(CONTAINER_NAME) /bin/bash

.PHONY: status
status:
	docker ps | grep $(CONTAINER_NAME)

.PHONY: health
health:
	curl -f http://localhost:$(PORT)/api/supportedCollateral || exit 1

.PHONY: logs-container
logs-container:
	docker logs -f $(CONTAINER_NAME)

# Development workflow
.PHONY: dev
dev: clean build run-dev logs-container

.PHONY: prod
prod: clean build run logs-container

# Help
.PHONY: help
help:
	@echo "Available commands:"
	@echo "  build         - Build Docker image"
	@echo "  build-no-cache- Build Docker image without cache"
	@echo "  run           - Run container in production mode"
	@echo "  run-dev       - Run container in development mode"
	@echo "  run-custom-config- Run container with custom config"
	@echo "  test-config   - Test configuration loading"
	@echo "  run-interactive- Run container interactively"
	@echo "  up            - Start with docker-compose"
	@echo "  down          - Stop docker-compose services"
	@echo "  logs          - View docker-compose logs"
	@echo "  restart       - Restart docker-compose services"
	@echo "  rebuild       - Rebuild and restart with docker-compose"
	@echo "  stop          - Stop container"
	@echo "  start         - Start container"
	@echo "  remove        - Remove container"
	@echo "  clean         - Remove container and image"
	@echo "  shell         - Access container shell"
	@echo "  status        - Show container status"
	@echo "  health        - Check application health"
	@echo "  logs-container- View container logs"
	@echo "  dev           - Full development workflow"
	@echo "  prod          - Full production workflow"
