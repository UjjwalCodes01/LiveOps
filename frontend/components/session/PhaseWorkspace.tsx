'use client';

import { ArchitectureDiagram } from '@/components/diagram/ArchitectureDiagram';
import { CommandFeed } from '@/components/command-feed/CommandFeed';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { useSession } from '@/components/session/SessionProvider';
import type { Phase } from '@/lib/types';

// The three-panel live workspace (diagram + command feed) shared by every
// phase page — Build Studio, Explore, Break, Diagnose, and Fix all filter
// the same underlying event stream, matching AGENT.md §3: one event schema
// renders every panel, nothing is a canned, page-specific animation.
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
      <GlassPanel className="p-4 lg:col-span-3" delay={0.05}>
        <ArchitectureDiagram events={events} />
      </GlassPanel>
      <div className="flex flex-col gap-5 lg:col-span-2">
        <GlassPanel className="flex-1 p-4" delay={0.1}>
          <CommandFeed events={feedEvents} emptyHint={emptyFeedHint} />
        </GlassPanel>
        {extra}
      </div>
    </div>
  );
}
