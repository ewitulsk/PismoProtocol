# GitHub Repository Watcher

A TypeScript service that monitors a GitHub repository for changes and executes commands when updates are detected. This service supports both webhook and polling modes for maximum flexibility.

## Features

- 🔄 **Automatic Repository Monitoring**: Watches for changes in a specific branch
- 🪝 **Webhook Support**: Responds to GitHub webhook events for real-time updates
- 📊 **Polling Mode**: Alternative polling mechanism when webhooks aren't available
- 🛠️ **Configurable Commands**: Execute custom commands in specified directories
- 📝 **Comprehensive Logging**: Detailed logs with configurable levels
- 🐳 **Docker Support**: Easy deployment with Docker and Docker Compose
- 🔒 **Secure**: Webhook signature verification and secure token handling

## Quick Start

### Prerequisites

- Node.js 18+ 
- Git
- GitHub Personal Access Token with repository permissions

### Installation

1. **Clone and navigate to the project:**
   ```bash
   cd ci
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env file with your credentials
   ```

3. **Update configuration:**
   ```bash
   # Edit config.yaml with your repository details
   ```

4. **Build and start:**
   ```bash
   npm run build
   npm start
   ```

## Configuration

### Environment Variables

```bash
# GitHub personal access token (required)
GITHUB_TOKEN=your_github_token_here

# Webhook secret for GitHub webhook validation (required for webhooks)
WEBHOOK_SECRET=your_webhook_secret_here

# Optional overrides
GITHUB_REPOSITORY=https://github.com/your-org/your-repo
GITHUB_BRANCH=main
WORKING_DIRECTORY=.
COMMAND=npm run build
```

### Configuration File (`config.yaml`)

```yaml
github:
  repository: "https://github.com/your-org/your-repo"
  branch: "main"
  token: "${GITHUB_TOKEN}"

local:
  clone_directory: "./workspace"
  working_directory: "."
  command: "npm run build"
  env:
    NODE_ENV: "production"

service:
  port: 3000
  polling_interval: 5  # minutes
  use_webhooks: true
  webhook_secret: "${WEBHOOK_SECRET}"

logging:
  level: "info"
  file: "./logs/watcher.log"
```

## Usage

### Webhook Mode (Recommended)

1. **Configure GitHub Webhook:**
   - Go to your repository settings
   - Navigate to Webhooks
   - Add a new webhook with URL: `http://your-server:3000/webhook`
   - Set content type to `application/json`
   - Add your webhook secret
   - Select "Just the push event"

2. **Set configuration:**
   ```yaml
   service:
     use_webhooks: true
     webhook_secret: "${WEBHOOK_SECRET}"
   ```

3. **Start the service:**
   ```bash
   npm start
   ```

### Polling Mode

1. **Set configuration:**
   ```yaml
   service:
     use_webhooks: false
     polling_interval: 5  # Check every 5 minutes
   ```

2. **Start the service:**
   ```bash
   npm start
   ```

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Using Docker

```bash
# Build image
docker build -t github-repo-watcher .

# Run container
docker run -d \
  --name github-watcher \
  -p 3000:3000 \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/workspace:/app/workspace \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  github-repo-watcher
```

## API Endpoints

### Health Check
```bash
GET /health
```
Returns service health status.

### Status
```bash
GET /status
```
Returns current service status and configuration.

### Webhook Endpoint
```bash
POST /webhook
```
Receives GitHub webhook events (webhook mode only).

## Development

### Scripts

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start development server with hot reload
npm run dev

# Run linter
npm run lint

# Run tests
npm test
```

### Project Structure

```
ci/
├── src/
│   ├── index.ts              # Main entry point
│   ├── types.ts              # TypeScript type definitions
│   ├── config.ts             # Configuration loader
│   ├── logger.ts             # Logging service
│   ├── git-service.ts        # Git operations
│   ├── command-executor.ts   # Command execution
│   ├── webhook-server.ts     # Webhook server
│   └── polling-service.ts    # Polling service
├── .github/workflows/        # GitHub Actions
├── config.yaml               # Configuration file
├── docker-compose.yml        # Docker Compose setup
├── Dockerfile               # Docker configuration
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
└── README.md               # This file
```

## Troubleshooting

### Common Issues

1. **Authentication Errors:**
   - Ensure your GitHub token has the correct permissions
   - Verify the token is correctly set in environment variables

2. **Webhook Not Triggering:**
   - Check webhook URL is publicly accessible
   - Verify webhook secret matches configuration
   - Check GitHub webhook delivery logs

3. **Command Execution Failures:**
   - Ensure the command is valid and executable
   - Check working directory permissions
   - Review logs for detailed error messages

### Debugging

Enable debug logging by setting:
```yaml
logging:
  level: "debug"
```

Or set environment variable:
```bash
export LOG_LEVEL=debug
```

## Security Considerations

- Store sensitive tokens in environment variables, not in configuration files
- Use webhook secrets to verify GitHub requests
- Run the service with minimal required permissions
- Regularly rotate access tokens
- Monitor logs for suspicious activity

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section
- Review the logs for error details
- Open an issue on GitHub with detailed information