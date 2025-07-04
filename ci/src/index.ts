import { ConfigLoader } from './config';
import { Logger } from './logger';
import { WebhookServer } from './webhook-server';
import { PollingService } from './polling-service';

async function main(): Promise<void> {
  try {
    // Load configuration
    const configLoader = ConfigLoader.getInstance();
    const config = await configLoader.loadConfig();

    // Initialize logger
    const logger = Logger.getInstance();
    logger.configure(config.logging.level, config.logging.file);

    logger.info('Starting GitHub Repository Watcher', {
      repository: config.github.repository,
      branch: config.github.branch,
      useWebhooks: config.service.use_webhooks
    });

    // Start appropriate service
    if (config.service.use_webhooks) {
      const webhookServer = new WebhookServer(config);
      await webhookServer.start();
    } else {
      const pollingService = new PollingService(config);
      await pollingService.start();
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      process.exit(0);
    });

  } catch (error: any) {
    console.error('Failed to start application:', error.message);
    process.exit(1);
  }
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});