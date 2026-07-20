import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationConfiguration } from '../config/configuration';
import { ExecutorService } from '../executor/executor.service';
import { Session } from '../events/domain';
import { SessionService } from '../sessions/session.service';
import { ActionName } from '../executor/actions';
import { Phase } from '../events/domain';

const TRANSITIONS: Record<Session['state'], Session['state'][]> = {
  created: ['building'],
  building: ['ready', 'failed'],
  ready: ['broken'],
  broken: ['diagnosing'],
  diagnosing: ['fixing'],
  fixing: ['completed', 'failed'],
  completed: [],
  failed: [],
};

// Only build and fix have a distinct "in progress" state to show while the
// executor runs (building, fixing) — explore/break/diagnose go straight
// from their precondition state to their completed state, since
// Session['state'] has no "breaking"/"investigating" equivalent. A prior
// version of this map gave break/diagnose a `starting` equal to their
// `completed` value specifically so the old "skip if equal" logic would
// no-op — which also skipped the completed-state write entirely, so
// break()/diagnose() never persisted 'broken'/'diagnosing' at all.
const PHASE_STATES: Record<
  Phase,
  { inProgress?: Session['state']; completed: Session['state'] }
> = {
  build: { inProgress: 'building', completed: 'ready' },
  explore: { completed: 'ready' },
  break: { completed: 'broken' },
  diagnose: { completed: 'diagnosing' },
  fix: { inProgress: 'fixing', completed: 'completed' },
};

@Injectable()
export class OrchestrationService {
  constructor(
    private readonly sessions: SessionService,
    private readonly executor: ExecutorService,
    private readonly config: ConfigService,
  ) {}

  async build(sessionId: string) {
    return this.executeAction(sessionId, 'build', 'provision_load_balancer');
  }
  async break(sessionId: string) {
    return this.executeAction(sessionId, 'break', 'inject_target_failure');
  }
  async diagnose(sessionId: string) {
    return this.executeAction(sessionId, 'diagnose', 'diagnose_target_health');
  }
  async fix(sessionId: string) {
    return this.executeAction(sessionId, 'fix', 'restore_target');
  }

  async executeAction(
    sessionId: string,
    phase: Phase,
    action: ActionName,
  ): Promise<Session> {
    const state = PHASE_STATES[phase];
    return this.sessions.withOperationLock(sessionId, phase, async () => {
      // Only 'build' provisions new AWS resources, so it's the only phase
      // that can grow AWS spend — gate it on the global concurrency cap.
      if (phase === 'build') await this.enforceLiveSessionCap();
      if (state.inProgress) await this.transition(sessionId, state.inProgress);
      try {
        await this.executor.run({ sessionId, phase, name: action });
      } catch (error) {
        // build/fix know their in-progress state already; explore/break/
        // diagnose have none, so read the (unchanged) precondition state
        // back to check whether it has a 'failed' edge.
        const failingState =
          state.inProgress ?? (await this.sessions.get(sessionId)).state;
        if (TRANSITIONS[failingState].includes('failed'))
          await this.sessions.transition(sessionId, 'failed');
        throw error;
      }
      return this.sessions.transition(sessionId, state.completed);
    });
  }

  // Global cost ceiling: refuse to start a new build once the configured
  // number of sessions already hold live AWS resources. This bounds total
  // spend regardless of how many clients use the (necessarily public)
  // frontend API key — something per-IP rate limits can't guarantee. Only
  // meaningful when AWS is actually provisioning; the resource TTL and
  // budget alarm remain the hard backstops.
  private async enforceLiveSessionCap(): Promise<void> {
    const settings = this.config.getOrThrow<ApplicationConfiguration>('app');
    if (!settings.awsEnabled || settings.maxConcurrentLiveSessions <= 0) return;
    const active = await this.sessions.countActiveSessions();
    if (active >= settings.maxConcurrentLiveSessions)
      throw new ServiceUnavailableException(
        `The demo is at capacity (${active}/${settings.maxConcurrentLiveSessions} live environments running). Please try again in a few minutes — each environment auto-releases on its TTL.`,
      );
  }

  private async transition(
    sessionId: string,
    nextState: Session['state'],
  ): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (!TRANSITIONS[session.state].includes(nextState))
      throw new BadRequestException(
        `Cannot transition from ${session.state} to ${nextState}`,
      );
    return this.sessions.transition(sessionId, nextState);
  }
}
