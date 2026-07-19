import { AgentService } from './agent.service';
import type { Session } from '../events/domain';

function makeSession(state: Session['state']): Session {
  return {
    id: 'session-1',
    concept: 'load_balancing',
    state,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// Scripted (no-LLM) mode: OPENAI_ENABLED=false. The agent must run the full
// phase with no OpenAI key, no API call, and — critically for the demo — no
// "AI unavailable" failure events. These tests lock that behaviour in.
describe('AgentService (scripted / no-LLM mode)', () => {
  function build(state: Session['state']) {
    const emitted: { type: string; action?: string; explanation: string }[] =
      [];
    const events = {
      emit: (event: { type: string; action?: string; explanation: string }) => {
        emitted.push(event);
        return Promise.resolve();
      },
    };
    const orchestration = {
      executeAction: jest.fn(() => Promise.resolve(makeSession('ready'))),
    };
    const sessions = { get: () => Promise.resolve(makeSession(state)) };
    const config = { getOrThrow: () => ({ openAiEnabled: false }) };
    const service = new AgentService(
      config as never,
      sessions as never,
      orchestration as never,
      events as never,
    );
    return { service, emitted, orchestration };
  }

  it('constructs with no OpenAI key when the LLM is disabled', () => {
    expect(() => build('created')).not.toThrow();
  });

  it('runs the build phase with a clean narration and no failure event', async () => {
    const { service, emitted, orchestration } = build('created');

    await service.execute('session-1', 'build');

    // The verified action for build was chosen and executed...
    expect(orchestration.executeAction).toHaveBeenCalledWith(
      'session-1',
      'build',
      'provision_load_balancer',
    );
    // ...narrated as a normal narration, not an "AI unavailable" failure.
    const narration = emitted.find((event) => event.type === 'narration');
    expect(narration?.action).toBe('provision_load_balancer');
    expect(narration?.explanation).toContain('load balancer');
    expect(emitted.some((event) => event.type === 'action_failed')).toBe(false);
  });

  it('picks the correct verified action for each phase', async () => {
    const cases: [Session['state'], string, string][] = [
      ['created', 'build', 'provision_load_balancer'],
      ['ready', 'break', 'inject_target_failure'],
      ['broken', 'diagnose', 'diagnose_target_health'],
      ['diagnosing', 'fix', 'restore_target'],
    ];
    for (const [state, phase, expectedAction] of cases) {
      const { service, orchestration } = build(state);
      await service.execute('session-1', phase as never);
      expect(orchestration.executeAction).toHaveBeenCalledWith(
        'session-1',
        phase,
        expectedAction,
      );
    }
  });
});
