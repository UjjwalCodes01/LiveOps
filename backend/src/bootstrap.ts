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

function validateProductionConfiguration(
  config: ApplicationConfiguration,
): void {
  if (
    config.environment === 'production' &&
    (!config.databaseUrl ||
      !config.apiKeys.length ||
      !config.openAiApiKey ||
      config.openAiTimeoutMs < 1 ||
      config.openAiMaxRetries < 0 ||
      config.sessionTtlMinutes < 1 ||
      config.awsResourceTtlMinutes < 1 ||
      !config.awsEnabled ||
      !config.awsAccountId ||
      !config.awsVpcId ||
      config.awsVpcSubnets.length < 2 ||
      !config.awsSecurityGroupId ||
      !config.awsAmiId)
  ) {
    throw new Error(
      'Production requires validated database, authentication, OpenAI, and sandbox AWS configuration.',
    );
  }
}
