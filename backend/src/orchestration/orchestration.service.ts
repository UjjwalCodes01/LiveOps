import { BadRequestException, Injectable } from '@nestjs/common';
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
