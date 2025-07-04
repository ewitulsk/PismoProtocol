import { spawn } from 'child_process';
import * as path from 'path';
import { Config, ExecutionResult } from './types';
import { Logger } from './logger';

export class CommandExecutor {
  private config: Config;
  private logger: Logger;

  constructor(config: Config) {
    this.config = config;
    this.logger = Logger.getInstance();
  }

  public async executeCommand(workingDirectory: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Executing command', { 
        command: this.config.local.command,
        workingDirectory 
      });

      const result = await this.runCommand(
        this.config.local.command,
        workingDirectory,
        this.config.local.env
      );

      const duration = Date.now() - startTime;
      
      this.logger.info('Command executed successfully', { 
        duration,
        output: result.substring(0, 200) + (result.length > 200 ? '...' : '')
      });

      return {
        success: true,
        output: result,
        duration
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Command execution failed', { 
        error: error.message,
        duration
      });

      return {
        success: false,
        output: '',
        error: error.message,
        duration
      };
    }
  }

  private async runCommand(
    command: string,
    workingDirectory: string,
    env?: Record<string, string>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      
      const childProcess = spawn(cmd, args, {
        cwd: workingDirectory,
        env: { ...process.env, ...env },
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }
}