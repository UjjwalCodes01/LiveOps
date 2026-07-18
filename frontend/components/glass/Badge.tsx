import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { SessionState } from '@/lib/types';

type Tone = 'healthy' | 'warning' | 'error' | 'info' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  healthy: 'bg-status-healthy/15 text-status-healthy border-status-healthy/40',
  warning: 'bg-status-warning/15 text-status-warning border-status-warning/40',
  error: 'bg-status-error/15 text-status-error border-status-error/40',
  info: 'bg-status-info/15 text-status-info border-status-info/40',
  neutral: 'bg-white/8 text-white/70 border-white/20',
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  healthy: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Loader2,
  neutral: Circle,
};

// Maps every real Session['state'] to a visual tone — kept exhaustive via
// Record<SessionState, Tone> so a new backend state fails the frontend
// build instead of silently rendering as unstyled.
const STATE_TONE: Record<SessionState, Tone> = {
  created: 'neutral',
  building: 'info',
  ready: 'healthy',
  broken: 'error',
  diagnosing: 'warning',
  fixing: 'warning',
  completed: 'healthy',
  failed: 'error',
};

export function StateBadge({ state }: { state: SessionState }) {
  return <Badge tone={STATE_TONE[state]}>{state}</Badge>;
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize backdrop-blur-md ${TONE_CLASSES[tone]}`}
    >
      <Icon className={`h-3 w-3 ${tone === 'info' ? 'animate-spin' : ''}`} strokeWidth={2.5} />
      {children}
    </span>
  );
}
