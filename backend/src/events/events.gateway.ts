import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Server, Socket } from 'socket.io';
import { ApplicationConfiguration } from '../config/configuration';
import { createOriginMatcher } from '../config/cors';
import { SessionService } from '../sessions/session.service';
import { SessionEvent } from './domain';

// CORS is configured server-wide in ConfiguredSocketIoAdapter (see
// socket-io.adapter.ts), not here — decorator options evaluate before
// ConfigModule has loaded .env, so a namespace-level `cors` option here
// would silently miss .env-only CORS_ORIGINS values.
@WebSocketGateway({
  namespace: '/events',
  transports: ['websocket'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class EventsGateway {
  @WebSocketServer() server!: Server;
  constructor(
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server): void {
    const settings = this.config.getOrThrow<ApplicationConfiguration>('app');
    const isAllowedOrigin = createOriginMatcher(settings.corsOrigins);
    server.use((socket, next) => {
      const origin = socket.handshake.headers.origin;
      const apiKey = (socket.handshake.auth as Record<string, unknown>).apiKey;
      if (
        !isAllowedOrigin(origin) ||
        !this.matchesApiKey(apiKey, settings.apiKeys)
      )
        return next(new Error('Unauthorized WebSocket connection'));
      return next();
    });
  }

  @SubscribeMessage('session:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { sessionId: string; since?: string; sessionToken?: string },
  ) {
    await this.sessions.authorize(body.sessionId, body.sessionToken);
    await this.sessions.get(body.sessionId);
    void client.join(body.sessionId);
    const events = await this.sessions.eventsSince(body.sessionId, body.since);
    client.emit('session:replay', events);
    return { sessionId: body.sessionId, replayed: events.length };
  }

  publish(event: SessionEvent): void {
    this.server.to(event.sessionId).emit('session:event', event);
  }

  private matchesApiKey(value: unknown, expectedKeys: string[]): boolean {
    if (typeof value !== 'string' || !expectedKeys.length) return false;
    return expectedKeys.some((expected) => {
      const expectedValue = Buffer.from(expected);
      const actualValue = Buffer.from(value);
      return (
        expectedValue.length === actualValue.length &&
        timingSafeEqual(expectedValue, actualValue)
      );
    });
  }
}
