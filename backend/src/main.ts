import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import compression from 'compression';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ApplicationConfiguration } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app
    .get(ConfigService)
    .getOrThrow<ApplicationConfiguration>('app');
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
      config.awsVpcSubnets.length < 2 ||
      !config.awsSecurityGroupId ||
      !config.awsAmiId)
  ) {
    throw new Error(
      'Production requires validated database, authentication, OpenAI, and sandbox AWS configuration.',
    );
  }
  app.setGlobalPrefix('api');
  const expressServer = app.getHttpAdapter().getInstance() as {
    set(name: string, value: number): void;
  };
  expressServer.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: config.corsOrigins,
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
  await app.listen(config.port, config.host);
}
void bootstrap();
