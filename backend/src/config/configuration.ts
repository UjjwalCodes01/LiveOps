import { registerAs } from '@nestjs/config';

export interface ApplicationConfiguration {
  environment: 'development' | 'test' | 'production';
  port: number;
  host: string;
  trustProxy: number;
  openAiApiKey?: string;
  openAiModel: string;
  openAiTimeoutMs: number;
  openAiMaxRetries: number;
  corsOrigins: string[];
  awsRegion: string;
  awsEnabled: boolean;
  awsVpcSubnets: string[];
  awsSecurityGroupId?: string;
  awsAmiId?: string;
  awsInstanceType: string;
  awsTargetPort: number;
  sessionTtlMinutes: number;
  awsResourceTtlMinutes: number;
  databaseUrl?: string;
  apiKeys: string[];
}

export const configuration = registerAs(
  'app',
  (): ApplicationConfiguration => ({
    environment: (process.env.NODE_ENV ??
      'development') as ApplicationConfiguration['environment'],
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '127.0.0.1',
    trustProxy: Number.parseInt(process.env.TRUST_PROXY ?? '0', 10),
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? 'gpt-5.6',
    openAiTimeoutMs: Number.parseInt(
      process.env.OPENAI_TIMEOUT_MS ?? '30000',
      10,
    ),
    openAiMaxRetries: Number.parseInt(
      process.env.OPENAI_MAX_RETRIES ?? '2',
      10,
    ),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    awsRegion: process.env.AWS_REGION ?? 'ap-south-1',
    awsEnabled: process.env.AWS_ENABLED === 'true',
    awsVpcSubnets: (process.env.AWS_VPC_SUBNET_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    awsSecurityGroupId: process.env.AWS_SECURITY_GROUP_ID,
    awsAmiId: process.env.AWS_EC2_AMI_ID,
    awsInstanceType: process.env.AWS_EC2_INSTANCE_TYPE ?? 't3.micro',
    awsTargetPort: Number.parseInt(process.env.AWS_TARGET_PORT ?? '80', 10),
    sessionTtlMinutes: Number.parseInt(
      process.env.SESSION_TTL_MINUTES ?? '20',
      10,
    ),
    awsResourceTtlMinutes: Number.parseInt(
      process.env.AWS_RESOURCE_TTL_MINUTES ?? '20',
      10,
    ),
    databaseUrl: process.env.DATABASE_URL,
    apiKeys: (process.env.API_KEYS ?? '').split(',').filter(Boolean),
  }),
);
