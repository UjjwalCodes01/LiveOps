import { registerAs } from '@nestjs/config';

export interface ApplicationConfiguration {
  environment: 'development' | 'test' | 'production';
  port: number;
  host: string;
  trustProxy: number;
  openAiApiKey?: string;
  // When false, the agent skips OpenAI entirely and drives each phase with
  // its deterministic verified action — no API calls, no credits needed, no
  // "AI unavailable" retry noise. Lets the full build/break/fix loop run on
  // real AWS without an OpenAI budget.
  openAiEnabled: boolean;
  openAiModel: string;
  openAiTimeoutMs: number;
  openAiMaxRetries: number;
  corsOrigins: string[];
  awsRegion: string;
  awsAccountId?: string;
  awsVpcId?: string;
  awsEnabled: boolean;
  awsVpcSubnets: string[];
  awsSecurityGroupId?: string;
  awsAmiId?: string;
  awsInstanceType: string;
  awsTargetPort: number;
  awsTargetHealthPath: string;
  sessionTtlMinutes: number;
  sessionRetentionDays: number;
  awsResourceTtlMinutes: number;
  // Hard cap on how many sessions can hold live AWS resources at once. A
  // global cost ceiling that bounds total spend regardless of how many
  // clients hit the (necessarily public) frontend API key — per-IP rate
  // limits can't do that alone. 0 or negative means unlimited.
  maxConcurrentLiveSessions: number;
  databaseUrl?: string;
  databaseSsl: boolean;
  databaseSslRejectUnauthorized: boolean;
  apiKeys: string[];
}

export const configuration = registerAs(
  'app',
  (): ApplicationConfiguration => ({
    environment: (process.env.NODE_ENV ??
      'development') as ApplicationConfiguration['environment'],
    port: Number.parseInt(process.env.PORT ?? '4000', 10),
    // 0.0.0.0, not 127.0.0.1 — PaaS platforms (Render, ECS, etc.) proxy
    // traffic to the container from outside it, and a loopback-only bind
    // makes the app unreachable even though it "works" from inside the
    // container itself. Harmless for local dev (0.0.0.0 still accepts
    // localhost connections).
    host: process.env.HOST ?? '0.0.0.0',
    trustProxy: Number.parseInt(process.env.TRUST_PROXY ?? '0', 10),
    openAiApiKey: process.env.OPENAI_API_KEY,
    // Default on; set OPENAI_ENABLED=false to run the deterministic,
    // no-OpenAI agent path (e.g. a demo with no OpenAI credits).
    openAiEnabled: process.env.OPENAI_ENABLED !== 'false',
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
    awsAccountId: process.env.AWS_ACCOUNT_ID,
    awsVpcId: process.env.AWS_VPC_ID,
    awsEnabled: process.env.AWS_ENABLED === 'true',
    awsVpcSubnets: (process.env.AWS_VPC_SUBNET_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    awsSecurityGroupId: process.env.AWS_SECURITY_GROUP_ID,
    awsAmiId: process.env.AWS_EC2_AMI_ID,
    awsInstanceType: process.env.AWS_EC2_INSTANCE_TYPE ?? 't3.micro',
    awsTargetPort: Number.parseInt(process.env.AWS_TARGET_PORT ?? '80', 10),
    // Matches .env.example's documented default. A bare '/' used to be the
    // default here, which only "worked" as a health check by an accident
    // of the boot script's HTTP server auto-listing a directory with no
    // index — a real path is deterministic instead of implementation-defined.
    awsTargetHealthPath: process.env.AWS_TARGET_HEALTH_PATH ?? '/health',
    sessionTtlMinutes: Number.parseInt(
      process.env.SESSION_TTL_MINUTES ?? '20',
      10,
    ),
    sessionRetentionDays: Number.parseInt(
      process.env.SESSION_RETENTION_DAYS ?? '14',
      10,
    ),
    awsResourceTtlMinutes: Number.parseInt(
      process.env.AWS_RESOURCE_TTL_MINUTES ?? '20',
      10,
    ),
    maxConcurrentLiveSessions: Number.parseInt(
      process.env.MAX_CONCURRENT_LIVE_SESSIONS ?? '10',
      10,
    ),
    databaseUrl: process.env.DATABASE_URL,
    // Explicit, not auto-detected from NODE_ENV or the connection string —
    // predictable beats magic. Managed Postgres (Render, Supabase, RDS)
    // needs this set true; a local/self-hosted Postgres usually doesn't
    // have TLS configured at all, so this defaults to false.
    databaseSsl: process.env.DATABASE_SSL === 'true',
    // Whether to verify the server's TLS certificate chain. Defaults to
    // false because managed Postgres providers commonly present a cert that
    // doesn't validate against Node's default trust store — the connection
    // is still encrypted either way, this only controls CA validation.
    // Set true (ideally alongside a provider CA bundle in NODE_EXTRA_CA_CERTS)
    // for deployments that require verified certs / MITM protection.
    databaseSslRejectUnauthorized:
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
    apiKeys: (process.env.API_KEYS ?? '').split(',').filter(Boolean),
  }),
);
