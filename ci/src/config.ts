import * as fs from 'fs-extra';
import * as yaml from 'yaml';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Config } from './types';

// Load environment variables
dotenv.config();

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: Config | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public async loadConfig(configPath: string = 'config.yaml'): Promise<Config> {
    if (this.config) {
      return this.config;
    }

    try {
      const configFile = await fs.readFile(path.resolve(configPath), 'utf8');
      const rawConfig = yaml.parse(configFile);
      
      // Replace environment variables in the config
      const processedConfig = this.replaceEnvVars(rawConfig);
      
      // Validate configuration
      this.validateConfig(processedConfig);
      
      this.config = processedConfig;
      return processedConfig;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  private replaceEnvVars(obj: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
        const value = process.env[envVar];
        if (value === undefined) {
          throw new Error(`Environment variable ${envVar} is not set`);
        }
        return value;
      });
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.replaceEnvVars(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceEnvVars(value);
      }
      return result;
    }
    
    return obj;
  }

  private validateConfig(config: Config): void {
    if (!config.github?.repository) {
      throw new Error('GitHub repository URL is required');
    }
    
    if (!config.github?.branch) {
      throw new Error('GitHub branch is required');
    }
    
    if (!config.github?.token) {
      throw new Error('GitHub token is required');
    }
    
    if (!config.local?.command) {
      throw new Error('Command to execute is required');
    }
  }

  public getConfig(): Config | null {
    return this.config;
  }
}