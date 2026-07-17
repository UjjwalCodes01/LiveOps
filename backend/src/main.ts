import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ApplicationConfiguration } from './config/configuration';
import { configureApplication } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app
    .get(ConfigService)
    .getOrThrow<ApplicationConfiguration>('app');
  configureApplication(app);
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}
void bootstrap();
