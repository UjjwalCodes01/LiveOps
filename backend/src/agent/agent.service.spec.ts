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
      expect.any(Function),
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
        expect.any(Function),
      );
    }
  });

  it('does not emit a GPT root-cause narration in scripted mode', async () => {
    // With the LLM off, diagnose still runs but there's no model to reason
    // over the health data, so no 'diagnose_root_cause' narration.
    const { service, emitted, orchestration } = build('broken');
    orchestration.executeAction.mockImplementation(
      (
        _s: string,
        _p: string,
        _a: string,
        onResult?: (result: Record<string, unknown>) => void,
      ) => {
        onResult?.({
          targetHealth: [
            {
              targetId: 'i-abc',
              state: 'unhealthy',
              reason: 'Target.Deregistered',
            },
          ],
        });
        return Promise.resolve(makeSession('diagnosing'));
      },
    );

    await service.execute('session-1', 'diagnose');

    expect(
      emitted.some((event) => event.action === 'diagnose_root_cause'),
    ).toBe(false);
  });
});

// The LLM path: GPT-5.6 reasons over the real target health and narrates the
// root cause. Uses an injected fake OpenAI client so no network is touched.
describe('AgentService diagnose root-cause reasoning (LLM path)', () => {
  it('emits a diagnose_root_cause narration from the model over real health', async () => {
    const emitted: { type: string; action?: string; explanation: string }[] =
      [];
    const events = {
      emit: (event: { type: string; action?: string; explanation: string }) => {
        emitted.push(event);
        return Promise.resolve();
      },
    };
    const orchestration = {
      executeAction: jest.fn(
        (
          _s: string,
          _p: string,
          _a: string,
          onResult?: (result: Record<string, unknown>) => void,
        ) => {
          onResult?.({
            targetHealth: [
              {
                targetId: 'i-07ed',
                state: 'unhealthy',
                reason: 'Target.Deregistered',
              },
            ],
          });
          return Promise.resolve(makeSession('diagnosing'));
        },
      ),
    };
    const sessions = { get: () => Promise.resolve(makeSession('broken')) };
    const config = {
      getOrThrow: () => ({
        openAiEnabled: true,
        openAiApiKey: 'sk-test',
        openAiModel: 'gpt-5.6',
        openAiTimeoutMs: 30000,
        openAiMaxRetries: 0,
      }),
    };
    const service = new AgentService(
      config as never,
      sessions as never,
      orchestration as never,
      events as never,
    );
    // Inject a fake OpenAI client: decision call returns the action JSON,
    // the reasoning call (SRE system prompt) returns the root-cause text.
    (
      service as unknown as {
        client: {
          chat: {
            completions: {
              create: (input: {
                messages: { content: string }[];
              }) => Promise<{ choices: { message: { content: string } }[] }>;
            };
          };
        };
      }
    ).client = {
      chat: {
        completions: {
          create: ({ messages }) => {
            const system = messages[0].content;
            const content = system.includes('SRE agent')
              ? 'Target i-07ed is unhealthy (Target.Deregistered) — it was pulled from the group, so re-register it to recover.'
              : JSON.stringify({
                  action: 'diagnose_target_health',
                  explanation: 'Reading target health.',
                });
            return Promise.resolve({ choices: [{ message: { content } }] });
          },
        },
      },
    };

    await service.execute('session-1', 'diagnose');

    const rootCause = emitted.find(
      (event) => event.action === 'diagnose_root_cause',
    );
    expect(rootCause?.type).toBe('narration');
    expect(rootCause?.explanation).toContain('Target.Deregistered');
  });
});
