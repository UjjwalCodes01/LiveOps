import { LifecycleService } from './lifecycle.service';

function makeConfigMock(overrides: Record<string, unknown> = {}) {
  return {
    getOrThrow: () => ({
      awsResourceTtlMinutes: 20,
      sessionTtlMinutes: 20,
      sessionRetentionDays: 14,
      awsEnabled: true,
      ...overrides,
    }),
  };
}

describe('LifecycleService', () => {
  // Regression test: the AWS-resource-age cleanup sweep used to tear down
  // a session's AWS resources purely by tag/instance age, with no idea
  // whether that session was actively running fix/diagnose right now. A
  // long-lived operation could have its ALB/target group/instances
  // deleted mid-flight. excludeSessionsWithActiveOperation() must be
  // consulted, and anything it filters out must never reach cleanupSession.
  it('never cleans up AWS resources for a session with an active operation lock', async () => {
    const config = makeConfigMock();
    const executor = {
      discoverExpiredAwsSessions: jest
        .fn()
        .mockResolvedValue(['locked-session', 'free-session']),
      cleanupSession: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = {
      excludeSessionsWithActiveOperation: jest
        .fn()
        .mockResolvedValue(['free-session']),
      expireStale: jest.fn().mockResolvedValue([]),
      deleteExpiredSessions: jest.fn().mockResolvedValue(0),
    };
    const events = { emit: jest.fn().mockResolvedValue(undefined) };

    const service = new LifecycleService(
      config as never,
      executor as never,
      sessions as never,
      events as never,
    );

    await service.removeExpiredResources();

    expect(sessions.excludeSessionsWithActiveOperation).toHaveBeenCalledWith([
      'locked-session',
      'free-session',
    ]);
    expect(executor.cleanupSession).toHaveBeenCalledTimes(1);
    expect(executor.cleanupSession).toHaveBeenCalledWith('free-session');
    expect(executor.cleanupSession).not.toHaveBeenCalledWith('locked-session');
  });

  it('narrates a cleanup failure instead of swallowing it silently', async () => {
    const config = makeConfigMock();
    const executor = {
      discoverExpiredAwsSessions: jest
        .fn()
        .mockResolvedValue(['broken-session']),
      cleanupSession: jest.fn().mockRejectedValue(new Error('AWS is mad')),
    };
    const sessions = {
      excludeSessionsWithActiveOperation: jest
        .fn()
        .mockResolvedValue(['broken-session']),
      expireStale: jest.fn().mockResolvedValue([]),
      deleteExpiredSessions: jest.fn().mockResolvedValue(0),
    };
    const emit = jest
      .fn<Promise<void>, [{ type: string; explanation: string }]>()
      .mockResolvedValue(undefined);
    const events = { emit };

    const service = new LifecycleService(
      config as never,
      executor as never,
      sessions as never,
      events as never,
    );

    await service.removeExpiredResources();

    const failedEvent = emit.mock.calls
      .map((call) => call[0])
      .find((event) => event.type === 'action_failed');
    expect(failedEvent?.explanation).toContain('AWS is mad');
  });

  it('does nothing when no AWS resources have expired', async () => {
    const config = makeConfigMock();
    const executor = {
      discoverExpiredAwsSessions: jest.fn().mockResolvedValue([]),
      cleanupSession: jest.fn(),
    };
    const sessions = {
      excludeSessionsWithActiveOperation: jest.fn(),
      expireStale: jest.fn().mockResolvedValue([]),
      deleteExpiredSessions: jest.fn().mockResolvedValue(0),
    };
    const events = { emit: jest.fn() };

    const service = new LifecycleService(
      config as never,
      executor as never,
      sessions as never,
      events as never,
    );

    await service.removeExpiredResources();

    expect(sessions.excludeSessionsWithActiveOperation).not.toHaveBeenCalled();
    expect(executor.cleanupSession).not.toHaveBeenCalled();
  });

  describe('teardownSession', () => {
    type Emitted = { type: string; explanation: string; action?: string };
    function build(
      state: string,
      overrides: Record<string, unknown> = {},
      cleanup: jest.Mock = jest.fn().mockResolvedValue(undefined),
    ) {
      const executor = { cleanupSession: cleanup };
      const sessions = {
        get: jest.fn().mockResolvedValue({ id: 's1', state }),
        // Passthrough lock — the real one serializes; here it just runs the
        // callback so the teardown body executes.
        withOperationLock: jest.fn(
          (_id: string, _op: string, callback: () => Promise<unknown>) =>
            callback(),
        ),
      };
      const emit = jest
        .fn<Promise<void>, [Emitted]>()
        .mockResolvedValue(undefined);
      const service = new LifecycleService(
        makeConfigMock(overrides) as never,
        executor as never,
        sessions as never,
        { emit } as never,
      );
      return { service, executor, emit, sessions };
    }

    it('tears down a completed session under the operation lock, narrating start + completion', async () => {
      const { service, executor, emit, sessions } = build('completed');
      await service.teardownSession('s1');
      // Serialized under the lock so concurrent teardowns / the TTL cron
      // can't race the same delete.
      expect(sessions.withOperationLock).toHaveBeenCalledWith(
        's1',
        'teardown',
        expect.any(Function),
      );
      expect(executor.cleanupSession).toHaveBeenCalledWith('s1');
      expect(emit.mock.calls.map((call) => call[0].type)).toEqual([
        'action_started',
        'action_completed',
      ]);
    });

    it('refuses to tear down a non-terminal session', async () => {
      const { service, executor } = build('ready');
      await expect(service.teardownSession('s1')).rejects.toThrow(
        /completed or failed/i,
      );
      expect(executor.cleanupSession).not.toHaveBeenCalled();
    });

    it('is a no-op cleanup when AWS is disabled', async () => {
      const { service, executor, emit } = build('failed', {
        awsEnabled: false,
      });
      await service.teardownSession('s1');
      expect(executor.cleanupSession).not.toHaveBeenCalled();
      const completed = emit.mock.calls
        .map((call) => call[0])
        .find((event) => event.type === 'action_completed');
      expect(completed?.explanation).toMatch(/AWS is disabled/i);
    });

    it('narrates a failure and throws when cleanup errors', async () => {
      const { service, emit } = build(
        'completed',
        {},
        jest.fn().mockRejectedValue(new Error('AWS is mad')),
      );
      await expect(service.teardownSession('s1')).rejects.toThrow(
        /Teardown failed/i,
      );
      const failed = emit.mock.calls
        .map((call) => call[0])
        .find((event) => event.type === 'action_failed');
      expect(failed?.action).toBe('teardown_session');
    });
  });
});
