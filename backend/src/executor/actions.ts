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
  // Build must provision — it's the only action that creates the
  // infrastructure the later phases operate on. Inspecting is what the
  // Explore phase is for; allowing the read-only inspect here let the agent
  // "complete" Build as a no-op (describe only), leaving nothing built while
  // the session still advanced to `ready`. The decision narration is still
  // generated regardless of the allow-list size.
  build: ['provision_load_balancer'],
  explore: ['inspect_load_balancers'],
  break: ['inject_target_failure'],
  diagnose: ['diagnose_target_health'],
  fix: ['restore_target'],
};
