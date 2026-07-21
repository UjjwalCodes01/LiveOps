import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ApplicationConfiguration } from '../config/configuration';
import { EventsService } from '../events/events.service';
import { Phase } from '../events/domain';
import { ALLOWED_ACTIONS_BY_PHASE, ActionName } from '../executor/actions';
import { OrchestrationService } from '../orchestration/orchestration.service';
import { SessionService } from '../sessions/session.service';

interface AgentDecision {
  action: ActionName;
  explanation: string;
}

const STATE_BY_PHASE: Record<Phase, string[]> = {
  build: ['created'],
  explore: ['ready'],
  break: ['ready'],
  diagnose: ['broken'],
  fix: ['diagnosing'],
};

// Clean, phase-appropriate narration for the deterministic no-LLM path
// (OPENAI_ENABLED=false). Unlike the retry-exhaustion fallback, this is a
// normal, first-class narration — it never surfaces as an "AI unavailable"
// failure, because nothing failed: the agent just isn't using an LLM.
const SCRIPTED_NARRATION: Record<Phase, string> = {
  build:
    'Provisioning a load balancer with three EC2 targets so incoming traffic can be spread across them.',
  explore:
    'Reading the live state of the load balancer and its targets straight from AWS.',
  break:
    'Deregistering one healthy target to simulate a server failure and test resilience.',
  diagnose:
    "Querying each target's real health status from AWS to locate the fault.",
  fix: 'Re-registering the failed target and waiting for it to pass its health check.',
};

@Injectable()
export class AgentService {
  private readonly client?: OpenAI;
  private readonly settings: ApplicationConfiguration;
  constructor(
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly orchestration: OrchestrationService,
    private readonly events: EventsService,
  ) {
    this.settings = config.getOrThrow<ApplicationConfiguration>('app');
    // Only require and wire up OpenAI when it's actually enabled — the
    // no-LLM path (OPENAI_ENABLED=false) needs no key at all.
    if (this.settings.openAiEnabled) {
      if (!this.settings.openAiApiKey)
        throw new Error(
          'OPENAI_API_KEY is required unless OPENAI_ENABLED=false.',
        );
      this.client = new OpenAI({
        apiKey: this.settings.openAiApiKey,
        timeout: this.settings.openAiTimeoutMs,
        maxRetries: 0,
      });
    }
  }

  async execute(
    sessionId: string,
    phase: Phase,
  ): Promise<Record<string, unknown>> {
    const session = await this.sessions.get(sessionId);
    if (!STATE_BY_PHASE[phase].includes(session.state)) {
      throw new BadRequestException(
        `Phase ${phase} is invalid while the session is ${session.state}.`,
      );
    }
    const decision = await this.decide(sessionId, phase, session.state);
    await this.events.emit({
      sessionId,
      phase,
      type: 'narration',
      action: decision.action,
      explanation: decision.explanation,
    });
    let actionResult: Record<string, unknown> | undefined;
    const updatedSession = await this.orchestration.executeAction(
      sessionId,
      phase,
      decision.action,
      (result) => {
        actionResult = result;
      },
    );
    // After a real diagnosis, hand the live target-health telemetry back to
    // GPT-5.6 and let it explain the actual root cause in plain language —
    // the model reasoning over real AWS data, not just picking an action.
    if (phase === 'diagnose' && actionResult)
      await this.explainDiagnosis(sessionId, actionResult);
    return { session: updatedSession };
  }

  private async explainDiagnosis(
    sessionId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    // Only meaningful when the LLM is on and there's real health to reason
    // over. The raw telemetry + health timeline are shown regardless, so
    // this is a best-effort enrichment — never fail the phase over it.
    if (!this.settings.openAiEnabled || !this.client) return;
    const targetHealth = result.targetHealth;
    if (!Array.isArray(targetHealth) || targetHealth.length === 0) return;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.settings.openAiModel,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are an SRE agent diagnosing an AWS Application Load Balancer target group from real DescribeTargetHealth output. In ONE concise sentence (max 200 characters, no markdown, no preamble), name the specific unhealthy target and its reason code, explain the cause, and state the fix.',
          },
          {
            role: 'user',
            content: JSON.stringify({ targets: targetHealth }),
          },
        ],
      });
      const explanation = completion.choices[0]?.message.content?.trim();
      if (!explanation) return;
      await this.events.emit({
        sessionId,
        phase: 'diagnose',
        type: 'narration',
        action: 'diagnose_root_cause',
        explanation,
      });
    } catch {
      // Best-effort — the raw health data and timeline already tell the story.
    }
  }

  private async decide(
    sessionId: string,
    phase: Phase,
    state: string,
  ): Promise<AgentDecision> {
    // Deterministic path: no OpenAI call, no retries, no failure events —
    // just the verified action for this phase with clean narration.
    if (!this.settings.openAiEnabled)
      return {
        action: this.fallbackAction(phase),
        explanation: SCRIPTED_NARRATION[phase],
      };
    const allowed = ALLOWED_ACTIONS_BY_PHASE[phase];
    for (
      let attempt = 0;
      attempt <= this.settings.openAiMaxRetries;
      attempt += 1
    ) {
      try {
        return await this.requestDecision(sessionId, phase, state, allowed);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Agent unavailable';
        if (attempt === this.settings.openAiMaxRetries) {
          const action = this.fallbackAction(phase);
          await this.events.emit({
            sessionId,
            phase,
            type: 'action_failed',
            action,
            explanation: `Agent unavailable after ${attempt + 1} attempts: ${message}. Using the verified fallback action.`,
          });
          return {
            action,
            explanation:
              'The agent is unavailable, so the platform is continuing with the predefined safe action for this lesson step.',
          };
        }
        const delayMs = 500 * 2 ** attempt;
        await this.events.emit({
          sessionId,
          phase,
          type: 'action_failed',
          explanation: `Agent temporarily unavailable; retrying in ${delayMs} ms (${attempt + 1}/${this.settings.openAiMaxRetries + 1}).`,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new ServiceUnavailableException(
      'Agent decision retries were exhausted.',
    );
  }

  private async requestDecision(
    sessionId: string,
    phase: Phase,
    state: string,
    allowed: readonly ActionName[],
  ): Promise<AgentDecision> {
    // Unreachable when openAiEnabled is false (decide() short-circuits), but
    // this keeps the optional client type-safe and fails loudly if that
    // invariant is ever broken.
    if (!this.client)
      throw new ServiceUnavailableException('OpenAI client is not configured.');
    const completion = await this.client.chat.completions.create({
      model: this.settings.openAiModel,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are the Build. Break. Fix. infrastructure lesson orchestrator. Return JSON only. Select exactly one action from the allow-list. Never propose commands, credentials, IAM changes, or actions outside the allow-list.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            sessionId,
            phase,
            state,
            allowedActions: allowed,
            requiredJson: {
              action: 'one allow-listed action',
              explanation: 'plain English, max 240 chars',
            },
          }),
        },
      ],
      response_format: { type: 'json_object' },
    });
    const content = completion.choices[0]?.message.content;
    if (!content)
      throw new ServiceUnavailableException('Agent returned no decision.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException('Agent returned invalid JSON.');
    }
    if (!this.isDecision(parsed, allowed))
      throw new ServiceUnavailableException(
        'Agent proposed an action outside the permitted schema.',
      );
    return parsed;
  }

  private fallbackAction(phase: Phase): ActionName {
    const actions: Record<Phase, ActionName> = {
      build: 'provision_load_balancer',
      explore: 'inspect_load_balancers',
      break: 'inject_target_failure',
      diagnose: 'diagnose_target_health',
      fix: 'restore_target',
    };
    return actions[phase];
  }

  private isDecision(
    value: unknown,
    allowed: readonly ActionName[],
  ): value is AgentDecision {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { action?: unknown; explanation?: unknown };
    return (
      typeof candidate.action === 'string' &&
      allowed.includes(candidate.action as ActionName) &&
      typeof candidate.explanation === 'string' &&
      candidate.explanation.length > 0 &&
      candidate.explanation.length <= 240
    );
  }
}
