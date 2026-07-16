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
import { ExecutorService } from '../executor/executor.service';
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

@Injectable()
export class AgentService {
  private readonly client: OpenAI;
  private readonly settings: ApplicationConfiguration;
  constructor(
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly executor: ExecutorService,
    private readonly events: EventsService,
  ) {
    this.settings = config.getOrThrow<ApplicationConfiguration>('app');
    if (!this.settings.openAiApiKey)
      throw new Error('OPENAI_API_KEY is required for agent orchestration.');
    this.client = new OpenAI({
      apiKey: this.settings.openAiApiKey,
      timeout: this.settings.openAiTimeoutMs,
      maxRetries: this.settings.openAiMaxRetries,
    });
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
    let decision: AgentDecision;
    try {
      decision = await this.decide(sessionId, phase, session.state);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Agent unavailable';
      await this.events.emit({
        sessionId,
        phase,
        type: 'action_failed',
        explanation: `Agent decision failed: ${message}`,
      });
      throw error;
    }
    await this.events.emit({
      sessionId,
      phase,
      type: 'narration',
      action: decision.action,
      explanation: decision.explanation,
    });
    return this.executor.run({ sessionId, phase, name: decision.action });
  }

  private async decide(
    sessionId: string,
    phase: Phase,
    state: string,
  ): Promise<AgentDecision> {
    const allowed = ALLOWED_ACTIONS_BY_PHASE[phase];
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
