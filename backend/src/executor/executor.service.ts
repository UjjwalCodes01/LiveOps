import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { AwsAdapter } from './adapters/aws.adapter';
import { ALLOWED_ACTIONS_BY_PHASE, ExecutorAction } from './actions';

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);
  constructor(
    private readonly events: EventsService,
    private readonly aws: AwsAdapter,
  ) {}

  async run(action: ExecutorAction): Promise<Record<string, unknown>> {
    if (!ALLOWED_ACTIONS_BY_PHASE[action.phase].includes(action.name))
      throw new BadRequestException(
        `Action ${action.name} is not allowed during ${action.phase}`,
      );
    const command = this.operationFor(action.name);
    const startedAt = performance.now();
    await this.events.emit({
      sessionId: action.sessionId,
      phase: action.phase,
      type: 'action_started',
      action: action.name,
      command,
      explanation: `Starting ${action.name.replaceAll('_', ' ')}.`,
    });
    try {
      const result = await this.aws.run(action.name, action.sessionId);
      await this.events.emit({
        sessionId: action.sessionId,
        phase: action.phase,
        type: 'action_completed',
        action: action.name,
        command,
        explanation: `${action.name.replaceAll('_', ' ')} completed.`,
        result,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown executor error';
      this.logger.error(message);
      await this.events.emit({
        sessionId: action.sessionId,
        phase: action.phase,
        type: 'action_failed',
        action: action.name,
        command,
        explanation: `Action failed: ${message}`,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw error;
    }
  }

  private operationFor(action: ExecutorAction['name']): string {
    const operations: Record<ExecutorAction['name'], string> = {
      inspect_load_balancers:
        'AWS SDK ELBv2: DescribeLoadBalancers + DescribeTags',
      provision_load_balancer: 'AWS SDK ELBv2: CreateLoadBalancer',
      inject_target_failure: 'AWS SDK ELBv2: DeregisterTargets',
      diagnose_target_health: 'AWS SDK ELBv2: DescribeTargetHealth',
      restore_target: 'AWS SDK ELBv2: RegisterTargets',
    };
    return operations[action];
  }
}
