'use client';

import {
  Activity,
  Bot,
  CheckCircle2,
  Code2,
  Loader2,
  RotateCw,
  Terminal,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { friendlyAction, friendlyCommand, friendlyExplanation } from '@/lib/humanize';
import type { SessionEvent } from '@/lib/types';
import { TypedText } from './TypedText';

const TYPE_STYLE: Record<SessionEvent['type'], { label: string; color: string; icon: LucideIcon; spin?: boolean }> = {
  action_started: { label: 'IN PROGRESS', color: 'text-status-info', icon: Loader2, spin: true },
  action_completed: { label: 'DONE', color: 'text-status-healthy', icon: CheckCircle2 },
  action_failed: { label: 'ISSUE', color: 'text-status-error', icon: XCircle },
  narration: { label: 'AI NOTE', color: 'text-white/70', icon: Bot },
  metric_update: { label: 'UPDATE', color: 'text-status-warning', icon: Activity },
};

const RETRY_PATTERN = /^Agent temporarily unavailable; retrying/;

function isRetryEvent(event: SessionEvent): boolean {
  return event.type === 'action_failed' && !event.action && RETRY_PATTERN.test(event.explanation);
}

interface FeedRow {
  key: string;
  latest: SessionEvent;
  retries: number;
}

// Collapses runs of "agent temporarily unavailable, retrying" failures —
// real, distinct events, but showing each one as its own block is noise a
// student doesn't need; one row with a retry count says the same thing.
function groupEvents(events: SessionEvent[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const event of events) {
    const last = rows.at(-1);
    if (isRetryEvent(event) && last && isRetryEvent(last.latest)) {
      last.latest = event;
      last.retries += 1;
    } else {
      rows.push({ key: event.id, latest: event, retries: isRetryEvent(event) ? 1 : 0 });
    }
  }
  return rows;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function CommandFeed({ events, emptyHint }: { events: SessionEvent[]; emptyHint: string }) {
  // The first non-empty update is the replay batch (sent once, before any
  // live events) — that baseline renders instantly; anything appended
  // after it is genuinely new and gets the typed-text animation. Set
  // during render (React's documented pattern for "remembering
  // information from a previous render"), not in an effect — it's a pure
  // function of `events`, not a subscription to anything external.
  const [replayBaseline, setReplayBaseline] = useState<number | null>(null);
  if (replayBaseline === null && events.length > 0) setReplayBaseline(events.length);
  const [showTechnical, setShowTechnical] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const animateFrom = replayBaseline ?? 0;
  const rows = groupEvents(events);

  return (
    <div className="flex h-full min-h-60 flex-col">
      <button
        type="button"
        onClick={() => setShowTechnical((v) => !v)}
        className="mb-2 flex items-center gap-1.5 self-end text-[11px] text-white/35 transition-colors hover:text-white/70"
      >
        <Code2 className="h-3 w-3" />
        {showTechnical ? 'Hide technical detail' : 'Show technical detail'}
      </button>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl bg-black/40 p-4 font-mono text-[13px] leading-relaxed"
      >
        {events.length === 0 && (
          <p className="flex items-center gap-2 text-white/35">
            <Terminal className="h-3.5 w-3.5" /> {emptyHint}
          </p>
        )}
        {rows.map((row, index) => {
          const { latest: event, retries } = row;
          const style = TYPE_STYLE[event.type];
          const Icon = retries > 1 ? RotateCw : style.icon;
          const animate = index >= animateFrom;
          const friendly = friendlyExplanation(event.explanation);
          const actionLabel = friendlyAction(event.action);
          return (
            <motion.div
              key={row.key}
              initial={animate ? { opacity: 0, x: -10 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/30">{formatTime(event.timestamp)}</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${style.color}`}>
                  <Icon className={`h-3 w-3 ${style.spin && retries <= 1 ? 'animate-spin' : ''}`} />
                  {style.label}
                </span>
                {actionLabel && <span className="text-white/50">{actionLabel}</span>}
                {retries > 1 && <span className="text-white/25">retried {retries}×</span>}
                {typeof event.durationMs === 'number' && (
                  <span className="text-white/25">{event.durationMs}ms</span>
                )}
              </div>
              {showTechnical && event.command && (
                <div className="mt-0.5 text-status-info/80">
                  <TypedText text={`$ ${friendlyCommand(event.command)}`} animate={animate} />
                </div>
              )}
              <div className="mt-0.5 text-white/80">
                <TypedText text={friendly.text} animate={animate} />
              </div>
              {showTechnical && friendly.technical && (
                <div className="mt-0.5 text-[11px] text-white/30">{friendly.technical}</div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
