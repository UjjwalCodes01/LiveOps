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
});
