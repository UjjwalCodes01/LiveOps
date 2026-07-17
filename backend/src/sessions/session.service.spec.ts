import { NotFoundException } from '@nestjs/common';
import { SessionService } from './session.service';

describe('SessionService', () => {
  it('stores and replays events after a timestamp', async () => {
    const service = new SessionService({
      getOrThrow: () => ({ environment: 'test' }),
    } as never);
    const { session } = await service.create();
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

  it('expires sessions idle past the TTL but leaves recent ones alone', async () => {
    const service = new SessionService({
      getOrThrow: () => ({ environment: 'test' }),
    } as never);
    const stale = await service.create();
    const fresh = await service.create();
    const alreadyDone = await service.create();
    (
      service as unknown as { testSessions: Map<string, unknown> }
    ).testSessions.set(stale.session.id, {
      ...stale.session,
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    (
      service as unknown as { testSessions: Map<string, unknown> }
    ).testSessions.set(alreadyDone.session.id, {
      ...alreadyDone.session,
      state: 'completed',
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    const expired = await service.expireStale(20);
    expect(expired).toEqual([{ id: stale.session.id, phase: 'build' }]);
    await expect(service.get(stale.session.id)).resolves.toMatchObject({
      state: 'failed',
    });
    await expect(service.get(fresh.session.id)).resolves.toMatchObject({
      state: 'created',
    });
    await expect(service.get(alreadyDone.session.id)).resolves.toMatchObject({
      state: 'completed',
    });
  });

  it('does not expire a session with an active operation lock', async () => {
    const service = new SessionService({
      getOrThrow: () => ({ environment: 'test' }),
    } as never);
    const midBuild = await service.create();
    (
      service as unknown as { testSessions: Map<string, unknown> }
    ).testSessions.set(midBuild.session.id, {
      ...midBuild.session,
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    await service.withOperationLock(midBuild.session.id, 'build', async () => {
      const expired = await service.expireStale(20);
      expect(expired).toEqual([]);
    });
    await expect(service.get(midBuild.session.id)).resolves.toMatchObject({
      state: 'created',
    });
  });

  it('deletes terminal sessions and their events once past the retention window', async () => {
    const service = new SessionService({
      getOrThrow: () => ({ environment: 'test' }),
    } as never);
    const old = await service.create();
    await service.transition(old.session.id, 'building');
    await service.transition(old.session.id, 'ready');
    (
      service as unknown as { testSessions: Map<string, unknown> }
    ).testSessions.set(old.session.id, {
      ...old.session,
      state: 'completed',
      updatedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    });
    const recent = await service.create();

    const deleted = await service.deleteExpiredSessions(7);
    expect(deleted).toBe(1);
    await expect(service.get(old.session.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.get(recent.session.id)).resolves.toMatchObject({
      state: 'created',
    });
  });
});
