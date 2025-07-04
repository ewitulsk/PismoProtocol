import express from 'express';
import bodyParser from 'body-parser';
import * as crypto from 'crypto';
import { Config, GitHubWebhookPayload } from './types';
import { GitService } from './git-service';
import { CommandExecutor } from './command-executor';
import { Logger } from './logger';

export class WebhookServer {
  private app: express.Application;
  private config: Config;
  private gitService: GitService;
  private commandExecutor: CommandExecutor;
  private logger: Logger;

  constructor(config: Config) {
    this.config = config;
    this.gitService = new GitService(config);
    this.commandExecutor = new CommandExecutor(config);
    this.logger = Logger.getInstance();
    
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    this.app.post('/webhook', this.handleWebhook.bind(this));
    this.app.get('/health', this.handleHealth.bind(this));
    this.app.get('/status', this.handleStatus.bind(this));
  }

  private handleWebhook = async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      // Verify webhook signature
      if (!this.verifySignature(req)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const payload: GitHubWebhookPayload = req.body;
      
      // Check if this is a push event for the branch we're watching
      if (!this.shouldProcessWebhook(payload)) {
        this.logger.debug('Ignoring webhook event', { 
          ref: payload.ref,
          targetBranch: `refs/heads/${this.config.github.branch}`
        });
        res.status(200).json({ message: 'Event ignored' });
        return;
      }

      this.logger.info('Processing webhook event', { 
        ref: payload.ref,
        commit: payload.head_commit.id,
        message: payload.head_commit.message
      });

      // Process the webhook in the background
      this.processWebhook(payload).catch(error => {
        this.logger.error('Error processing webhook', { error: error.message });
      });

      res.status(200).json({ message: 'Webhook received' });
    } catch (error: any) {
      this.logger.error('Error handling webhook', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  private handleHealth = (req: express.Request, res: express.Response): void => {
    res.status(200).json({ status: 'healthy' });
  };

  private handleStatus = async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const currentCommit = await this.gitService.getCurrentCommit();
      res.status(200).json({ 
        status: 'running',
        currentCommit,
        config: {
          repository: this.config.github.repository,
          branch: this.config.github.branch,
          command: this.config.local.command
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  private verifySignature(req: express.Request): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      return false;
    }

    const payload = JSON.stringify(req.body);
    const hash = crypto.createHmac('sha256', this.config.service.webhook_secret)
      .update(payload)
      .digest('hex');
    
    const expectedSignature = `sha256=${hash}`;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  private shouldProcessWebhook(payload: GitHubWebhookPayload): boolean {
    const targetRef = `refs/heads/${this.config.github.branch}`;
    return payload.ref === targetRef;
  }

  private async processWebhook(payload: GitHubWebhookPayload): Promise<void> {
    try {
      // Ensure repository is set up
      await this.gitService.ensureRepository();
      
      // Pull latest changes
      const hasChanges = await this.gitService.pullLatestChanges();
      
      if (hasChanges) {
        // Execute the command
        const workingDirectory = this.gitService.getWorkingDirectory();
        const result = await this.commandExecutor.executeCommand(workingDirectory);
        
        if (result.success) {
          this.logger.info('Command executed successfully after webhook');
        } else {
          this.logger.error('Command failed after webhook', { error: result.error });
        }
      }
    } catch (error: any) {
      this.logger.error('Error processing webhook', { error: error.message });
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.service.port, () => {
        this.logger.info(`Webhook server started on port ${this.config.service.port}`);
        resolve();
      });
    });
  }
}