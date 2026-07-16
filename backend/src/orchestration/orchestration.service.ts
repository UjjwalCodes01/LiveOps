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
    const states: Record<
      Phase,
      { starting: Session['state']; completed: Session['state'] }
    > = {
      build: { starting: 'building', completed: 'ready' },
      explore: { starting: 'ready', completed: 'ready' },
      break: { starting: 'broken', completed: 'broken' },
      diagnose: { starting: 'diagnosing', completed: 'diagnosing' },
      fix: { starting: 'fixing', completed: 'completed' },
    };
    return this.sessions.withOperationLock(sessionId, phase, async () => {
      const state = states[phase];
      if (state.starting !== state.completed)
        await this.transition(sessionId, state.starting);
      await this.executor.run({ sessionId, phase, name: action });
      return state.starting === state.completed
        ? this.sessions.get(sessionId)
        : this.sessions.transition(sessionId, state.completed);
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
