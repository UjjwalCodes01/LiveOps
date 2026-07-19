'use client';

import { ArchitectureDiagram } from '@/components/diagram/ArchitectureDiagram';
import { CommandFeed } from '@/components/command-feed/CommandFeed';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { LessonPanel } from '@/components/learn/LessonPanel';
import { useSession } from '@/components/session/SessionProvider';
import type { Phase } from '@/lib/types';

// The live workspace shared by every phase page. Left column is the "doing"
// — the data-driven diagram plus any phase-specific visual (extra), both
// rendered off the one shared event stream (AGENT.md §3: nothing is a
// canned, page-specific animation). Right column is the "learning + watching"
// — the teaching panel stacked over the live command feed, so a student
// reads why it matters, watches it happen for real, then gets a takeaway
// and quick-check the instant the phase completes.
export function PhaseWorkspace({
  phase,
  emptyFeedHint,
  filterToPhase = false,
  extra,
}: {
  phase: Phase;
  emptyFeedHint: string;
  filterToPhase?: boolean;
  extra?: React.ReactNode;
}) {
  const { events } = useSession();
  const feedEvents = filterToPhase ? events.filter((event) => event.phase === phase) : events;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="flex flex-col gap-5 lg:col-span-3">
        <GlassPanel className="p-4" delay={0.05}>
          <ArchitectureDiagram events={events} />
        </GlassPanel>
        {extra}
      </div>
      <div className="flex flex-col gap-5 lg:col-span-2">
        <LessonPanel phase={phase} />
        <GlassPanel className="flex-1 p-4" delay={0.1}>
          <CommandFeed events={feedEvents} emptyHint={emptyFeedHint} />
        </GlassPanel>
      </div>
    </div>
  );
}
