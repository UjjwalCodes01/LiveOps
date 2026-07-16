import { BadRequestException, Injectable } from '@nestjs/common';
import { ExecutorService } from '../executor/executor.service';
import { Session } from '../events/domain';
import { SessionService } from '../sessions/session.service';

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
    await this.transition(sessionId, 'building');
    await this.executor.run({
      sessionId,
      phase: 'build',
      name: 'provision_load_balancer',
    });
    return this.sessions.transition(sessionId, 'ready');
  }
  async break(sessionId: string) {
    await this.transition(sessionId, 'broken');
    await this.executor.run({
      sessionId,
      phase: 'break',
      name: 'inject_target_failure',
    });
    return this.sessions.get(sessionId);
  }
  async diagnose(sessionId: string) {
    await this.transition(sessionId, 'diagnosing');
    await this.executor.run({
      sessionId,
      phase: 'diagnose',
      name: 'diagnose_target_health',
    });
    return this.sessions.get(sessionId);
  }
  async fix(sessionId: string) {
    await this.transition(sessionId, 'fixing');
    await this.executor.run({
      sessionId,
      phase: 'fix',
      name: 'restore_target',
    });
    return this.sessions.transition(sessionId, 'completed');
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
