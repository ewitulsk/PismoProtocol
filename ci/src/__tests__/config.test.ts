import { ConfigLoader } from '../config';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('ConfigLoader', () => {
  const testConfigPath = path.join(__dirname, 'test-config.yaml');
  
  beforeEach(async () => {
    // Reset singleton instance for each test
    (ConfigLoader as any).instance = null;
    // Create a test config file
    const testConfig = `
github:
  repository: "https://github.com/test/repo"
  branch: "main"
  token: "test-token"

local:
  clone_directory: "./test-workspace"
  working_directory: "."
  command: "echo 'test command'"

service:
  port: 3000
  polling_interval: 5
  use_webhooks: true
  webhook_secret: "test-secret"

logging:
  level: "info"
  file: "./test-logs/test.log"
`;
    
    await fs.writeFile(testConfigPath, testConfig);
  });

  afterEach(async () => {
    // Clean up test config file
    await fs.remove(testConfigPath);
    // Reset singleton instance after each test
    (ConfigLoader as any).instance = null;
  });

  it('should load configuration correctly', async () => {
    const configLoader = ConfigLoader.getInstance();
    const config = await configLoader.loadConfig(testConfigPath);
    
    expect(config.github.repository).toBe('https://github.com/test/repo');
    expect(config.github.branch).toBe('main');
    expect(config.github.token).toBe('test-token');
    expect(config.local.command).toBe('echo \'test command\'');
    expect(config.service.port).toBe(3000);
    expect(config.service.use_webhooks).toBe(true);
    expect(config.logging.level).toBe('info');
  });

  it('should validate required fields', async () => {
    const invalidConfig = `
github:
  repository: ""
  branch: "main"
  token: "test-token"

local:
  clone_directory: "./test-workspace"
  working_directory: "."
  command: "echo 'test'"

service:
  port: 3000
  polling_interval: 5
  use_webhooks: true
  webhook_secret: "test-secret"

logging:
  level: "info"
  file: "./test-logs/test.log"
`;

    const invalidConfigPath = path.join(__dirname, 'invalid-config.yaml');
    await fs.writeFile(invalidConfigPath, invalidConfig);

    // Reset singleton to ensure clean state
    (ConfigLoader as any).instance = null;
    const configLoader = ConfigLoader.getInstance();
    
    await expect(configLoader.loadConfig(invalidConfigPath)).rejects.toThrow('GitHub repository URL is required');
    
    await fs.remove(invalidConfigPath);
  });
});