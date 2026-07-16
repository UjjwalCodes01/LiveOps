import { Phase } from '../events/domain';

export const ACTIONS = [
  'inspect_load_balancers',
  'provision_load_balancer',
  'inject_target_failure',
  'diagnose_target_health',
  'restore_target',
] as const;
export type ActionName = (typeof ACTIONS)[number];
export interface ExecutorAction {
  name: ActionName;
  phase: Phase;
  sessionId: string;
  parameters?: Record<string, string>;
}

export const ALLOWED_ACTIONS_BY_PHASE: Record<Phase, readonly ActionName[]> = {
  build: ['inspect_load_balancers', 'provision_load_balancer'],
  explore: ['inspect_load_balancers'],
  break: ['inject_target_failure'],
  diagnose: ['diagnose_target_health'],
  fix: ['restore_target'],
};
