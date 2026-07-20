import { OrchestrationService } from './orchestration.service';
import { Session } from '../events/domain';

function makeSession(state: Session['state']): Session {
  return {
    id: 'session-1',
    concept: 'load_balancing',
    state,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeSessionServiceMock(
  initialState: Session['state'],
  activeCount = 0,
) {
  let state = initialState;
  return {
    async withOperationLock<T>(
      _sessionId: string,
      _operation: string,
      callback: () => Promise<T>,
    ): Promise<T> {
      return callback();
    },
    get(): Promise<Session> {
      return Promise.resolve(makeSession(state));
    },
    transition(_sessionId: string, next: Session['state']): Promise<Session> {
      state = next;
      return Promise.resolve(makeSession(state));
    },
    countActiveSessions(): Promise<number> {
      return Promise.resolve(activeCount);
    },
  };
}

// The concurrency cap only engages when AWS is enabled; default the config
// mock to AWS-off so existing (non-cap) tests are unaffected.
function makeConfigMock(overrides: Record<string, unknown> = {}) {
  return {
    getOrThrow: () => ({
      awsEnabled: false,
      maxConcurrentLiveSessions: 10,
      ...overrides,
    }),
  };
}

describe('OrchestrationService', () => {
  // Regression test for a bug where break()/diagnose() never persisted a
  // state transition at all: the old `states` map set `starting` equal to
  // `completed` for these two phases, which made the "skip if equal" guard
  // also skip the completed-state write, silently leaving the session's DB
  // state unchanged forever.
  it('persists broken after break() and diagnosing after diagnose()', async () => {
    const sessions = makeSessionServiceMock('ready');
    const executor = { run: jest.fn().mockResolvedValue({}) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock() as never,
    );

    const afterBreak = await service.break('session-1');
    expect(afterBreak.state).toBe('broken');

    const afterDiagnose = await service.diagnose('session-1');
    expect(afterDiagnose.state).toBe('diagnosing');
  });

  it('transitions building -> ready across build()', async () => {
    const sessions = makeSessionServiceMock('created');
    const transitionSpy = jest.spyOn(sessions, 'transition');
    const executor = { run: jest.fn().mockResolvedValue({}) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock() as never,
    );

    const result = await service.build('session-1');

    expect(transitionSpy.mock.calls.map((call) => call[1])).toEqual([
      'building',
      'ready',
    ]);
    expect(result.state).toBe('ready');
  });

  it('transitions diagnosing -> completed across fix()', async () => {
    const sessions = makeSessionServiceMock('diagnosing');
    const executor = { run: jest.fn().mockResolvedValue({}) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock() as never,
    );

    const result = await service.fix('session-1');
    expect(result.state).toBe('completed');
  });

  it('marks the session failed when the executor throws during build', async () => {
    const sessions = makeSessionServiceMock('created');
    const executor = { run: jest.fn().mockRejectedValue(new Error('boom')) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock() as never,
    );

    await expect(service.build('session-1')).rejects.toThrow('boom');
    await expect(sessions.get()).resolves.toMatchObject({ state: 'failed' });
  });

  it('leaves the session retriable when break() fails (no failure edge from ready)', async () => {
    const sessions = makeSessionServiceMock('ready');
    const executor = {
      run: jest.fn().mockRejectedValue(new Error('aws blew up')),
    };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock() as never,
    );

    await expect(service.break('session-1')).rejects.toThrow('aws blew up');
    await expect(sessions.get()).resolves.toMatchObject({ state: 'ready' });
  });

  it('leaves explore() as a no-op state-wise', async () => {
    const sessions = makeSessionServiceMock('ready');
    const executor = { run: jest.fn().mockResolvedValue({}) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock() as never,
    );

    const result = await service.executeAction(
      'session-1',
      'explore',
      'inspect_load_balancers',
    );
    expect(result.state).toBe('ready');
  });

  it('refuses a new build once the live-session cap is reached (AWS enabled)', async () => {
    const sessions = makeSessionServiceMock('created', 10); // 10 already live
    const executor = { run: jest.fn().mockResolvedValue({}) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock({
        awsEnabled: true,
        maxConcurrentLiveSessions: 10,
      }) as never,
    );

    await expect(service.build('session-1')).rejects.toThrow(/at capacity/i);
    // Nothing was provisioned — the cap short-circuits before the executor.
    expect(executor.run).not.toHaveBeenCalled();
  });

  it('allows a build while below the live-session cap', async () => {
    const sessions = makeSessionServiceMock('created', 3);
    const executor = { run: jest.fn().mockResolvedValue({}) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock({
        awsEnabled: true,
        maxConcurrentLiveSessions: 10,
      }) as never,
    );

    const result = await service.build('session-1');
    expect(result.state).toBe('ready');
    expect(executor.run).toHaveBeenCalled();
  });

  it('does not enforce the cap when AWS is disabled (no real spend to bound)', async () => {
    const sessions = makeSessionServiceMock('created', 999);
    const executor = { run: jest.fn().mockResolvedValue({}) };
    const service = new OrchestrationService(
      sessions as never,
      executor as never,
      makeConfigMock({
        awsEnabled: false,
        maxConcurrentLiveSessions: 1,
      }) as never,
    );

    const result = await service.build('session-1');
    expect(result.state).toBe('ready');
  });
});
