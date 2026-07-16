import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SessionService } from '../sessions/session.service';
import { EventType, Phase, SessionEvent } from './domain';
import { EventsGateway } from './events.gateway';

@Injectable()
export class EventsService {
  constructor(
    private readonly sessions: SessionService,
    private readonly gateway: EventsGateway,
  ) {}
  async emit(
    input: Omit<SessionEvent, 'id' | 'timestamp'> & {
      type: EventType;
      phase: Phase;
    },
  ): Promise<SessionEvent> {
    const event: SessionEvent = {
      ...input,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    await this.sessions.appendEvent(event);
    this.gateway.publish(event);
    return event;
  }
}
