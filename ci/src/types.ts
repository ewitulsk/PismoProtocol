export interface Config {
  github: {
    repository: string;
    branch: string;
    token: string;
  };
  local: {
    clone_directory: string;
    working_directory: string;
    command: string;
    env?: Record<string, string>;
  };
  service: {
    port: number;
    polling_interval: number;
    use_webhooks: boolean;
    webhook_secret: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file: string;
  };
}

export interface GitHubWebhookPayload {
  ref: string;
  repository: {
    full_name: string;
    clone_url: string;
  };
  head_commit: {
    id: string;
    message: string;
    timestamp: string;
  };
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}