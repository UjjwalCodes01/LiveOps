import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import helmet from 'helmet';
import { ApplicationConfiguration } from './config/configuration';
import { createOriginMatcher } from './config/cors';
import { ConfiguredSocketIoAdapter } from './events/socket-io.adapter';

export function configureApplication(app: INestApplication): void {
  const config = app
    .get(ConfigService)
    .getOrThrow<ApplicationConfiguration>('app');
  validateProductionConfiguration(config);
  app.setGlobalPrefix('api');
  const expressServer = app.getHttpAdapter().getInstance() as {
    set(name: string, value: number): void;
  };
  expressServer.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(compression());
  const isAllowedOrigin = createOriginMatcher(config.corsOrigins);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useWebSocketAdapter(new ConfiguredSocketIoAdapter(app));
}

export function validateProductionConfiguration(
  config: ApplicationConfiguration,
): void {
  // OpenAI config is only required when the LLM path is actually enabled;
  // OPENAI_ENABLED=false runs the deterministic agent with no key at all.
  const openAiInvalid =
    config.openAiEnabled &&
    (!config.openAiApiKey ||
      config.openAiTimeoutMs < 1 ||
      config.openAiMaxRetries < 0);
  // AWS sandbox config is only required when AWS_ENABLED=true. With it
  // false the app boots into a safe, no-provisioning mode (the render.yaml
  // blueprint default) — the same conditional treatment OpenAI gets, so a
  // production deploy doesn't have to touch real AWS just to start.
  const awsInvalid =
    config.awsEnabled &&
    (!config.awsAccountId ||
      !config.awsVpcId ||
      config.awsVpcSubnets.length < 2 ||
      !config.awsSecurityGroupId ||
      !config.awsAmiId);
  if (
    config.environment === 'production' &&
    (!config.databaseUrl ||
      !config.apiKeys.length ||
      openAiInvalid ||
      config.sessionTtlMinutes < 1 ||
      config.awsResourceTtlMinutes < 1 ||
      awsInvalid)
  ) {
    throw new Error(
      'Production requires a validated database and API key; OpenAI config when OPENAI_ENABLED=true; and full sandbox AWS config when AWS_ENABLED=true.',
    );
  }
}
