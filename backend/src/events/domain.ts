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
  state:
    | 'created'
    | 'building'
    | 'ready'
    | 'broken'
    | 'diagnosing'
    | 'fixing'
    | 'completed'
    | 'failed';
  createdAt: string;
  updatedAt: string;
}
