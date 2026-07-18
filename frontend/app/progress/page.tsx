'use client';

import { CheckCircle2, ExternalLink, Hammer, Layers, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatedNumber } from '@/components/glass/AnimatedNumber';
import { Badge, StateBadge } from '@/components/glass/Badge';
import { GlassButton } from '@/components/glass/GlassButton';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Skeleton } from '@/components/glass/Skeleton';
import { ApiError, getSession } from '@/lib/api';
import { listStoredSessions, type StoredSession } from '@/lib/session-history';
import type { Session, SessionState } from '@/lib/types';

interface SessionRow {
  stored: StoredSession;
  state?: SessionState;
  error?: string;
}

const EMPTY_SESSIONS: StoredSession[] = [];
const EMPTY_SESSIONS_ROWS: SessionRow[] = [];

function noopSubscribe(): () => void {
  return () => undefined;
}

const PHASE_BY_STATE: Record<SessionState, string> = {
  created: 'build',
  building: 'build',
  ready: 'explore',
  broken: 'break',
  diagnosing: 'diagnose',
  fixing: 'fix',
  completed: 'fix',
  failed: 'fix',
};

export default function ProgressPage() {
  // Synchronous, SSR-safe read of this browser's session list — see
  // listStoredSessions' snapshot caching, required for useSyncExternalStore.
  const stored = useSyncExternalStore(noopSubscribe, listStoredSessions, () => EMPTY_SESSIONS);
  const [rows, setRows] = useState<SessionRow[] | null>(null);

  useEffect(() => {
    if (!stored.length) return; // nothing to fetch; render falls back to `stored` below
    let cancelled = false;
    Promise.all(
      stored.map(async (entry): Promise<SessionRow> => {
        try {
          const session: Session = await getSession(entry.sessionId, entry.accessToken);
          return { stored: entry, state: session.state };
        } catch (error) {
          return {
            stored: entry,
            error: error instanceof ApiError ? error.message : 'Unreachable',
          };
        }
      }),
    ).then((results) => {
      if (!cancelled) setRows(results);
    });
    return () => {
      cancelled = true;
    };
  }, [stored]);

  const displayRows = stored.length === 0 ? EMPTY_SESSIONS_ROWS : rows;
  const loaded = displayRows?.filter((row) => row.state) ?? [];
  const completed = loaded.filter((row) => row.state === 'completed').length;
  const everBuilt = loaded.filter((row) => row.state !== 'created').length;
  const isLoading = displayRows === null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Progress & Mastery</h1>
        <p className="mt-2 text-white/60">
          Every number here comes from sessions this browser actually ran — nothing is simulated.
        </p>
      </motion.div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <GlassPanel className="p-5" hover>
          <p className="text-3xl font-semibold text-white">
            {isLoading ? <Skeleton className="h-9 w-12" /> : <AnimatedNumber value={loaded.length} />}
          </p>
          <p className="text-sm text-white/50">Sessions started</p>
        </GlassPanel>
        <GlassPanel className="p-5" delay={0.05} hover>
          <p className="text-3xl font-semibold text-white">
            {isLoading ? <Skeleton className="h-9 w-12" /> : <AnimatedNumber value={completed} />}
          </p>
          <p className="text-sm text-white/50">Fixes completed</p>
        </GlassPanel>
        <GlassPanel className="p-5" delay={0.1} hover>
          <p className="text-3xl font-semibold text-white">
            <AnimatedNumber value={1} />
          </p>
          <p className="text-sm text-white/50">Concept available</p>
        </GlassPanel>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Badge tone={everBuilt > 0 ? 'healthy' : 'neutral'}>
          <span className="inline-flex items-center gap-1">
            {everBuilt > 0 && <CheckCircle2 className="h-3 w-3" />}
            First build
          </span>
        </Badge>
        <Badge tone={completed > 0 ? 'healthy' : 'neutral'}>
          <span className="inline-flex items-center gap-1">
            {completed > 0 && <Sparkles className="h-3 w-3" />}
            Fixed a failure
          </span>
        </Badge>
      </div>

      <h2 className="mb-3 mt-10 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/40">
        <Layers className="h-4 w-4" /> Sessions
      </h2>
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}
      {!isLoading && displayRows.length === 0 && (
        <GlassPanel className="p-8 text-center">
          <Hammer className="mx-auto mb-3 h-8 w-8 text-white/30" />
          <p className="text-white/60">No sessions yet in this browser.</p>
          <Link href="/concepts" className="mt-4 inline-block">
            <GlassButton>Start your first session</GlassButton>
          </Link>
        </GlassPanel>
      )}
      <div className="flex flex-col gap-3">
        {displayRows?.map((row, index) => (
          <GlassPanel
            key={row.stored.sessionId}
            delay={index * 0.04}
            hover
            className="flex items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-white/50">{row.stored.sessionId}</p>
              <p className="text-xs text-white/30">
                {new Date(row.stored.createdAt).toLocaleString()}
              </p>
            </div>
            {row.state ? (
              <div className="flex items-center gap-3">
                <StateBadge state={row.state} />
                <Link href={`/session/${row.stored.sessionId}/${PHASE_BY_STATE[row.state]}`}>
                  <GlassButton variant="secondary">
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </GlassButton>
                </Link>
              </div>
            ) : (
              <span className="text-xs text-status-error">{row.error ?? 'Unavailable'}</span>
            )}
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
