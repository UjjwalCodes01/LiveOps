'use client';

import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CommandFeed } from '@/components/command-feed/CommandFeed';
import { ArchitectureDiagram } from '@/components/diagram/ArchitectureDiagram';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { REPLAY } from '@/lib/replay';

// Plays a stored REAL run back through the exact same diagram and command
// feed the live session uses — the judging-day safety net for when the
// network/AWS is unavailable (AGENT.md §"fallback replay mode"). Events are
// revealed one at a time so the recording unfolds like the live stream did.
// Always clearly labelled "Replay" so it can never be mistaken for live.
const STEP_MS = 650;

export function ReplayPlayer() {
  const events = REPLAY.events;
  const total = events.length;
  const [cursor, setCursor] = useState(total ? 1 : 0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || cursor >= total) return;
    const timer = window.setTimeout(
      () => setCursor((current) => Math.min(current + 1, total)),
      STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, cursor, total]);

  if (!total) {
    return (
      <GlassPanel className="p-6 text-center" spotlight={false}>
        <p className="text-sm text-white/70">No replay has been captured yet.</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-white/40">
          This platform only ever shows real runs. To create the replay, run a live session end to
          end, use <span className="text-white/60">“Download this run”</span> on the completed Fix
          page, and commit that file as <code>lib/replay/replay-log.json</code>. See{' '}
          <code>lib/replay/README.md</code>.
        </p>
      </GlassPanel>
    );
  }

  const atEnd = cursor >= total;
  const shown = events.slice(0, cursor);

  function toggle() {
    if (atEnd) {
      setCursor(1);
      setPlaying(true);
    } else {
      setPlaying((value) => !value);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning/40 bg-status-warning/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-status-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
            Replay
          </span>
          <span className="text-xs text-white/50">
            A recording of a real run
            {REPLAY.capturedAt
              ? ` — captured ${new Date(REPLAY.capturedAt).toLocaleDateString()}`
              : ''}
            . Not live.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-white/40">
            {cursor}/{total}
          </span>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
          >
            {atEnd ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" /> Replay again
              </>
            ) : playing ? (
              <>
                <Pause className="h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Play
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <GlassPanel className="p-4 lg:col-span-3" delay={0.05}>
          <ArchitectureDiagram events={shown} />
        </GlassPanel>
        <GlassPanel className="h-[32rem] p-4 lg:col-span-2" delay={0.1}>
          <CommandFeed events={shown} emptyHint="Replay starting…" />
        </GlassPanel>
      </div>
    </div>
  );
}
