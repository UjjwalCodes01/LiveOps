import { validateProductionConfiguration } from './bootstrap';
import type { ApplicationConfiguration } from './config/configuration';

// A production config that is valid with both AWS and OpenAI disabled — the
// render.yaml blueprint default. Individual tests flip fields on top of this.
const PROD_BASE: ApplicationConfiguration = {
  environment: 'production',
  port: 4000,
  host: '0.0.0.0',
  trustProxy: 1,
  openAiApiKey: undefined,
  openAiEnabled: false,
  openAiModel: 'gpt-5.6',
  openAiTimeoutMs: 30000,
  openAiMaxRetries: 2,
  corsOrigins: ['https://example.com'],
  awsRegion: 'us-east-1',
  awsAccountId: undefined,
  awsVpcId: undefined,
  awsEnabled: false,
  awsVpcSubnets: [],
  awsSecurityGroupId: undefined,
  awsAmiId: undefined,
  awsInstanceType: 't3.micro',
  awsTargetPort: 80,
  awsTargetHealthPath: '/health',
  sessionTtlMinutes: 20,
  sessionRetentionDays: 14,
  awsResourceTtlMinutes: 20,
  databaseUrl: 'postgres://user:pass@host:5432/db',
  databaseSsl: true,
  databaseSslRejectUnauthorized: false,
  maxConcurrentLiveSessions: 10,
  apiKeys: ['a-key'],
};

describe('validateProductionConfiguration', () => {
  it('boots in production with AWS and OpenAI disabled (render.yaml default)', () => {
    expect(() => validateProductionConfiguration(PROD_BASE)).not.toThrow();
  });

  it('still requires a database and an API key in production', () => {
    expect(() =>
      validateProductionConfiguration({ ...PROD_BASE, databaseUrl: undefined }),
    ).toThrow();
    expect(() =>
      validateProductionConfiguration({ ...PROD_BASE, apiKeys: [] }),
    ).toThrow();
  });

  it('requires full AWS config only when AWS_ENABLED=true', () => {
    // Enabled but unconfigured -> invalid.
    expect(() =>
      validateProductionConfiguration({ ...PROD_BASE, awsEnabled: true }),
    ).toThrow();
    // Enabled and fully configured -> valid.
    expect(() =>
      validateProductionConfiguration({
        ...PROD_BASE,
        awsEnabled: true,
        awsAccountId: '123456789012',
        awsVpcId: 'vpc-abc',
        awsVpcSubnets: ['subnet-1', 'subnet-2'],
        awsSecurityGroupId: 'sg-abc',
        awsAmiId: 'ami-abc',
      }),
    ).not.toThrow();
  });

  it('requires OpenAI config only when OPENAI_ENABLED=true', () => {
    expect(() =>
      validateProductionConfiguration({ ...PROD_BASE, openAiEnabled: true }),
    ).toThrow();
    expect(() =>
      validateProductionConfiguration({
        ...PROD_BASE,
        openAiEnabled: true,
        openAiApiKey: 'sk-test',
      }),
    ).not.toThrow();
  });

  it('does not validate outside production', () => {
    expect(() =>
      validateProductionConfiguration({
        ...PROD_BASE,
        environment: 'development',
        databaseUrl: undefined,
        apiKeys: [],
      }),
    ).not.toThrow();
  });
});
