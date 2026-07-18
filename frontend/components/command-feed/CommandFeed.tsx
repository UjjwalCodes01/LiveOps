'use client';

import { useEffect, useRef, useState } from 'react';
import type { SessionEvent } from '@/lib/types';
import { TypedText } from './TypedText';

const TYPE_STYLE: Record<SessionEvent['type'], { label: string; color: string }> = {
  action_started: { label: 'RUNNING', color: 'text-status-info' },
  action_completed: { label: 'DONE', color: 'text-status-healthy' },
  action_failed: { label: 'FAILED', color: 'text-status-error' },
  narration: { label: 'AGENT', color: 'text-white/70' },
  metric_update: { label: 'METRIC', color: 'text-status-warning' },
};

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const animateFrom = replayBaseline ?? 0;

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-[240px] overflow-y-auto rounded-xl bg-black/40 p-4 font-mono text-[13px] leading-relaxed"
    >
      {events.length === 0 && <p className="text-white/35">{emptyHint}</p>}
      {events.map((event, index) => {
        const style = TYPE_STYLE[event.type];
        const animate = index >= animateFrom;
        return (
          <div key={event.id} className="mb-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-white/30">{formatTime(event.timestamp)}</span>
              <span className={`font-semibold ${style.color}`}>{style.label}</span>
              {event.action && <span className="text-white/50">{event.action}</span>}
              {typeof event.durationMs === 'number' && (
                <span className="text-white/25">{event.durationMs}ms</span>
              )}
            </div>
            {event.command && (
              <div className="mt-0.5 text-status-info/80">
                <TypedText text={`$ ${event.command}`} animate={animate} />
              </div>
            )}
            <div className="mt-0.5 text-white/80">
              <TypedText text={event.explanation} animate={animate} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
