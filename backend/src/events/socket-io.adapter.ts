import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { ApplicationConfiguration } from '../config/configuration';
import { createOriginMatcher } from '../config/cors';

// @WebSocketGateway's decorator options evaluate at class-definition time
// (import time), before NestFactory.create() ever runs ConfigModule's
// dotenv loading — so reading process.env.CORS_ORIGINS there only sees
// real shell-exported variables, never values that only live in a .env
// file. This adapter instead reads CORS_ORIGINS from ConfigService at
// server-creation time, after configuration has loaded, so .env-only
// values are respected the same way HTTP CORS already respects them.
export class ConfiguredSocketIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const config = this.app
      .get(ConfigService)
      .getOrThrow<ApplicationConfiguration>('app');
    const isAllowedOrigin = createOriginMatcher(config.corsOrigins);
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: (
          origin: string | undefined,
          callback: (error: Error | null, allow?: boolean) => void,
        ) => callback(null, isAllowedOrigin(origin)),
        credentials: true,
      },
    });
  }
}
