import * as fs from 'fs-extra';
import * as path from 'path';

export class Logger {
  private static instance: Logger;
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
  private logFile: string | null = null;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public configure(level: 'debug' | 'info' | 'warn' | 'error', logFile?: string): void {
    this.logLevel = level;
    this.logFile = logFile || null;
    
    if (logFile) {
      const logDir = path.dirname(logFile);
      fs.ensureDirSync(logDir);
    }
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      return `${baseMessage} ${JSON.stringify(data, null, 2)}`;
    }
    
    return baseMessage;
  }

  private writeLog(level: string, message: string, data?: any): void {
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Write to console
    console.log(formattedMessage);
    
    // Write to file if configured
    if (this.logFile) {
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    }
  }

  public debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      this.writeLog('debug', message, data);
    }
  }

  public info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      this.writeLog('info', message, data);
    }
  }

  public warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      this.writeLog('warn', message, data);
    }
  }

  public error(message: string, data?: any): void {
    if (this.shouldLog('error')) {
      this.writeLog('error', message, data);
    }
  }
}