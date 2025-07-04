import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Config } from './types';
import { Logger } from './logger';

export class GitService {
  private git: SimpleGit;
  private config: Config;
  private logger: Logger;

  constructor(config: Config) {
    this.config = config;
    this.logger = Logger.getInstance();
    this.git = simpleGit();
  }

  public async ensureRepository(): Promise<void> {
    const cloneDir = path.resolve(this.config.local.clone_directory);
    
    try {
      if (await fs.pathExists(cloneDir)) {
        // Repository already exists, check if it's the correct one
        const repoGit = simpleGit(cloneDir);
        const remotes = await repoGit.getRemotes(true);
        const origin = remotes.find(remote => remote.name === 'origin');
        
        if (origin && this.normalizeRepoUrl(origin.refs.fetch) === this.normalizeRepoUrl(this.config.github.repository)) {
          this.logger.info('Repository already exists and is correct');
          this.git = repoGit;
          return;
        } else {
          this.logger.warn('Existing repository is different, removing and re-cloning');
          await fs.remove(cloneDir);
        }
      }

      // Clone the repository
      await this.cloneRepository();
    } catch (error) {
      this.logger.error('Error ensuring repository', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private async cloneRepository(): Promise<void> {
    const cloneDir = path.resolve(this.config.local.clone_directory);
    
    try {
      await fs.ensureDir(path.dirname(cloneDir));
      
      this.logger.info('Cloning repository', { 
        repository: this.config.github.repository,
        branch: this.config.github.branch,
        directory: cloneDir 
      });

      // Clone with authentication
      const repoUrlWithAuth = this.addAuthToUrl(this.config.github.repository);
      
      await this.git.clone(repoUrlWithAuth, cloneDir, [
        '--branch', this.config.github.branch,
        '--single-branch',
        '--depth', '1'
      ]);

      this.git = simpleGit(cloneDir);
      this.logger.info('Repository cloned successfully');
    } catch (error) {
      this.logger.error('Error cloning repository', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  public async pullLatestChanges(): Promise<boolean> {
    try {
      this.logger.info('Pulling latest changes', { branch: this.config.github.branch });
      
      const pullResult = await this.git.pull('origin', this.config.github.branch);
      
      if (pullResult.summary.changes > 0) {
        this.logger.info('New changes pulled', { 
          changes: pullResult.summary.changes,
          insertions: pullResult.summary.insertions,
          deletions: pullResult.summary.deletions
        });
        return true;
      } else {
        this.logger.debug('No new changes to pull');
        return false;
      }
    } catch (error) {
      this.logger.error('Error pulling latest changes', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  public async getCurrentCommit(): Promise<string> {
    try {
      const log = await this.git.log(['-1']);
      return log.latest?.hash || '';
    } catch (error) {
      this.logger.error('Error getting current commit', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private normalizeRepoUrl(url: string): string {
    // Remove .git suffix and normalize URL format
    return url.replace(/\.git$/, '').replace(/^https?:\/\/[^@]+@/, 'https://');
  }

  private addAuthToUrl(repoUrl: string): string {
    // Add GitHub token to URL for authentication
    const url = new URL(repoUrl);
    url.username = this.config.github.token;
    url.password = '';
    return url.toString();
  }

  public getWorkingDirectory(): string {
    const cloneDir = path.resolve(this.config.local.clone_directory);
    return path.join(cloneDir, this.config.local.working_directory);
  }
}