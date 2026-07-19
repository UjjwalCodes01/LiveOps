'use client';

import { ArchitectureDiagram } from '@/components/diagram/ArchitectureDiagram';
import { CommandFeed } from '@/components/command-feed/CommandFeed';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { LessonPanel } from '@/components/learn/LessonPanel';
import { useSession } from '@/components/session/SessionProvider';
import type { Phase } from '@/lib/types';

// The live workspace shared by every phase page (build/break/diagnose/fix).
// Top row is the "doing" — the data-driven diagram plus any phase-specific
// visual (extra: build progress, health timeline), both rendered off the one
// shared event stream (AGENT.md §3: nothing is a canned, page-specific
// animation). Bottom row pairs the teaching panel (the concept) on the left
// with the live technical feed on its right. The feed is height-capped and
// scrolls internally, so no volume of events can stretch the page.
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
    <div className="flex flex-col gap-5">
      {/* Diagram hero + phase-specific visual. With no extra, the diagram
          spans the full width instead of leaving an empty column. */}
      <div className="grid gap-5 lg:grid-cols-5">
        <GlassPanel
          className={`p-4 ${extra ? 'lg:col-span-3' : 'lg:col-span-5'}`}
          delay={0.05}
        >
          <ArchitectureDiagram events={events} />
        </GlassPanel>
        {extra && <div className="lg:col-span-2">{extra}</div>}
      </div>
      {/* Concept (left) beside the live technical feed (right). The feed
          panel is height-capped; CommandFeed's own overflow scrolls within
          it so it never grows the page. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <LessonPanel phase={phase} />
        <GlassPanel className="h-[32rem] p-4" delay={0.1}>
          <CommandFeed events={feedEvents} emptyHint={emptyFeedHint} />
        </GlassPanel>
      </div>
    </div>
  );
}
