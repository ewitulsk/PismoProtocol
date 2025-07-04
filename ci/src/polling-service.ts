import { Octokit } from '@octokit/rest';
import { Config } from './types';
import { GitService } from './git-service';
import { CommandExecutor } from './command-executor';
import { Logger } from './logger';

export class PollingService {
  private config: Config;
  private gitService: GitService;
  private commandExecutor: CommandExecutor;
  private logger: Logger;
  private octokit: Octokit;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private lastKnownCommit?: string;

  constructor(config: Config) {
    this.config = config;
    this.gitService = new GitService(config);
    this.commandExecutor = new CommandExecutor(config);
    this.logger = Logger.getInstance();
    this.octokit = new Octokit({ auth: config.github.token });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Polling service is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting polling service', { 
      interval: this.config.service.polling_interval,
      repository: this.config.github.repository,
      branch: this.config.github.branch
    });

    // Get initial commit
    await this.initializeLastKnownCommit();

    // Start polling
    this.intervalId = setInterval(
      this.checkForChanges.bind(this),
      this.config.service.polling_interval * 60 * 1000 // Convert minutes to milliseconds
    );

    // Run an initial check
    await this.checkForChanges();
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.logger.info('Polling service stopped');
  }

  private async initializeLastKnownCommit(): Promise<void> {
    try {
      const [owner, repo] = this.parseRepositoryUrl();
      const response = await this.octokit.repos.getBranch({
        owner,
        repo,
        branch: this.config.github.branch
      });

      this.lastKnownCommit = response.data.commit.sha;
      this.logger.info('Initialized last known commit', { 
        commit: this.lastKnownCommit 
      });
    } catch (error: any) {
      this.logger.error('Error initializing last known commit', { 
        error: error.message 
      });
    }
  }

  private async checkForChanges(): Promise<void> {
    try {
      this.logger.debug('Checking for changes');

      const [owner, repo] = this.parseRepositoryUrl();
      const response = await this.octokit.repos.getBranch({
        owner,
        repo,
        branch: this.config.github.branch
      });

      const latestCommit = response.data.commit.sha;

      if (this.lastKnownCommit && latestCommit !== this.lastKnownCommit) {
        this.logger.info('New commit detected', { 
          oldCommit: this.lastKnownCommit,
          newCommit: latestCommit
        });

        await this.processChanges();
        this.lastKnownCommit = latestCommit;
      } else {
        this.logger.debug('No new changes detected');
      }
    } catch (error: any) {
      this.logger.error('Error checking for changes', { 
        error: error.message 
      });
    }
  }

  private async processChanges(): Promise<void> {
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
          this.logger.info('Command executed successfully after polling');
        } else {
          this.logger.error('Command failed after polling', { error: result.error });
        }
      }
    } catch (error: any) {
      this.logger.error('Error processing changes', { error: error.message });
    }
  }

  private parseRepositoryUrl(): [string, string] {
    const url = this.config.github.repository.replace(/\.git$/, '');
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)$/);
    
    if (!match) {
      throw new Error(`Invalid repository URL: ${this.config.github.repository}`);
    }

    return [match[1], match[2]];
  }
}