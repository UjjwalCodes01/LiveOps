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
      command: input.command ? this.sanitizeString(input.command) : undefined,
      explanation: this.sanitizeString(input.explanation),
      result: input.result ? this.sanitizeValue(input.result) : undefined,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    await this.sessions.appendEvent(event);
    this.gateway.publish(event);
    return event;
  }

  private sanitizeValue(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        this.isSensitiveKey(key)
          ? '[redacted]'
          : this.sanitizeUnknown(nestedValue),
      ]),
    );
  }

  private sanitizeUnknown(value: unknown): unknown {
    if (typeof value === 'string') return this.sanitizeString(value);
    if (Array.isArray(value))
      return value.map((item) => this.sanitizeUnknown(item));
    if (value && typeof value === 'object')
      return this.sanitizeValue(value as Record<string, unknown>);
    return value;
  }

  private sanitizeString(value: string): string {
    return value
      .replace(
        /arn:([^:]+):([^:]+):([^:]*):\d{12}:/g,
        'arn:$1:$2:$3:[redacted-account]:',
      )
      .replace(/\b\d{12}\b/g, '[redacted-account]')
      .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted-access-key]')
      .replace(
        /(?<=(?:token|secret|password|credential)[=:\s])[\w/+=-]+/gi,
        '[redacted]',
      );
  }

  private isSensitiveKey(key: string): boolean {
    return /(?:token|secret|password|credential|access.?key)/i.test(key);
  }
}
