import { NotFoundException } from '@nestjs/common';
import { SessionService } from './session.service';

describe('SessionService', () => {
  it('stores and replays events after a timestamp', async () => {
    const service = new SessionService({
      getOrThrow: () => ({ environment: 'test' }),
    } as never);
    const session = await service.create();
    await service.appendEvent({
      id: 'first',
      sessionId: session.id,
      phase: 'build',
      type: 'narration',
      explanation: 'First',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    await service.appendEvent({
      id: 'second',
      sessionId: session.id,
      phase: 'build',
      type: 'narration',
      explanation: 'Second',
      timestamp: '2026-01-01T00:00:01.000Z',
    });
    await expect(
      service.eventsSince(session.id, '2026-01-01T00:00:00.000Z'),
    ).resolves.toHaveLength(1);
  });

  it('rejects unknown sessions', async () => {
    const service = new SessionService({
      getOrThrow: () => ({ environment: 'test' }),
    } as never);
    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
  });
});
