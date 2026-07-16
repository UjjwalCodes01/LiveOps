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
import { SessionService } from '../sessions/session.service';
import { SessionEvent } from './domain';

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
    server.use((socket, next) => {
      const origin = socket.handshake.headers.origin;
      const apiKey = (socket.handshake.auth as Record<string, unknown>).apiKey;
      if (
        (origin && !settings.corsOrigins.includes(origin)) ||
        !this.matchesApiKey(apiKey, settings.apiKeys)
      )
        return next(new Error('Unauthorized WebSocket connection'));
      return next();
    });
  }

  @SubscribeMessage('session:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId: string; since?: string },
  ) {
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
