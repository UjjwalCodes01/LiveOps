'use client';

import { Clock, Globe, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { getStatus, type PlatformStatus } from '@/lib/api';
import type { SessionEvent } from '@/lib/types';

// A live cost/status strip for operational clarity + judge confidence:
// a "sandbox only" badge, the real AWS region, and a ticking "auto-cleanup
// in MM:SS" countdown to when this session's billable resources are torn
// down. Region/TTLs come from the public /status endpoint; the exact
// expiry comes from the provision result on the event stream.

function latestResult(events: SessionEvent[], action: string): SessionEvent['result'] {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.type === 'action_completed' && event.action === action) return event.result;
  }
  return undefined;
}

type Tone = 'healthy' | 'info' | 'warning' | 'neutral';

function Chip({
  icon: Icon,
  tone = 'neutral',
  children,
}: {
  icon: LucideIcon;
  tone?: Tone;
  children: React.ReactNode;
}) {
  const toneClass: Record<Tone, string> = {
    healthy: 'border-status-healthy/40 bg-status-healthy/10 text-status-healthy',
    info: 'border-status-info/40 bg-status-info/10 text-status-info',
    warning: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
    neutral: 'border-white/12 bg-white/[0.04] text-white/60',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass[tone]}`}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function StatusPanel() {
  const { events } = useSession();
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  // Null until mounted so the ticking clock never causes a hydration
  // mismatch (server has no notion of "now").
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStatus()
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Seed the clock on mount (server has no "now", so this deliberately
    // happens client-side only) and tick it every second. This is external
    // synchronization to wall-clock time, not the derived-state anti-pattern
    // the rule targets — same justification as the other disables in this repo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const provision = latestResult(events, 'provision_load_balancer');
  const expiresAtRaw = typeof provision?.expiresAt === 'string' ? provision.expiresAt : undefined;
  const expiresAt = expiresAtRaw ? Date.parse(expiresAtRaw) : undefined;
  const remaining = expiresAt !== undefined && now !== null ? expiresAt - now : undefined;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip icon={ShieldCheck} tone="healthy">
        Sandbox mode
      </Chip>

      {status &&
        (status.awsEnabled ? (
          <Chip icon={Globe}>{status.awsRegion}</Chip>
        ) : (
          <Chip icon={Globe}>AWS off · no billable resources</Chip>
        ))}

      {status?.awsEnabled &&
        now !== null &&
        (remaining === undefined ? (
          <Chip icon={Clock}>No live resources yet</Chip>
        ) : remaining > 0 ? (
          <Chip icon={Clock} tone="info">
            Auto-cleanup in {formatCountdown(remaining)}
          </Chip>
        ) : (
          <Chip icon={Trash2} tone="warning">
            Cleanup due — auto-deleting
          </Chip>
        ))}
    </div>
  );
}
