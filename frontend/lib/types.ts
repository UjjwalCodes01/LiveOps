// Hand-mirrored from backend/src/events/domain.ts and
// backend/src/executor/actions.ts — there is no shared package between
// frontend/ and backend/ (no workspace tooling set up), so this file must
// be kept in sync by hand if the backend's event/session contract changes.

export const PHASES = ['build', 'explore', 'break', 'diagnose', 'fix'] as const;
export type Phase = (typeof PHASES)[number];

export const EVENT_TYPES = [
  'action_started',
  'action_completed',
  'action_failed',
  'narration',
  'metric_update',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ACTIONS = [
  'inspect_load_balancers',
  'provision_load_balancer',
  'inject_target_failure',
  'diagnose_target_health',
  'restore_target',
] as const;
export type ActionName = (typeof ACTIONS)[number];

export const SESSION_STATES = [
  'created',
  'building',
  'ready',
  'broken',
  'diagnosing',
  'fixing',
  'completed',
  'failed',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export interface SessionEvent {
  id: string;
  sessionId: string;
  phase: Phase;
  type: EventType;
  action?: string;
  command?: string;
  explanation: string;
  result?: Record<string, unknown>;
  timestamp: string;
  durationMs?: number;
}

export interface Session {
  id: string;
  concept: 'load_balancing';
  state: SessionState;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedSession {
  session: Session;
  accessToken: string;
}

// Mirrors STATE_BY_PHASE in backend/src/agent/agent.service.ts — the
// session states each phase is valid to run from. Used purely to disable
// phase actions in the UI the backend would reject anyway; the backend
// re-validates regardless (see AGENT.md's "student selects an invalid
// failure" edge case).
export const VALID_STATES_BY_PHASE: Record<Phase, SessionState[]> = {
  build: ['created'],
  explore: ['ready'],
  break: ['ready'],
  diagnose: ['broken'],
  fix: ['diagnosing'],
};
