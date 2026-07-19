'use client';

import { useState } from 'react';
import { ArchitectureDiagram, type ResourceDetails } from '@/components/diagram/ArchitectureDiagram';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Badge } from '@/components/glass/Badge';
import { LessonPanel } from '@/components/learn/LessonPanel';
import { PhaseActionPanel } from '@/components/session/PhaseActionPanel';
import { useSession } from '@/components/session/SessionProvider';

const STATUS_TONE = {
  pending: 'neutral',
  healthy: 'healthy',
  warning: 'warning',
  error: 'error',
} as const;

export default function ExplorePage() {
  const { events } = useSession();
  const [selected, setSelected] = useState<ResourceDetails | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PhaseActionPanel
        phase="explore"
        title="Architecture Explorer"
        description="Click any node to see what it actually is right now — its real config and state, pulled fresh from AWS."
        actionLabel="Refresh from AWS"
        completedHint="You can keep refreshing any time — this phase has no side effects."
        invalidHint={(state) => `Build the system first (currently "${state}").`}
      />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <GlassPanel className="p-4" delay={0.05}>
            <ArchitectureDiagram events={events} onNodeSelect={setSelected} selectedNodeId={selected?.id} />
          </GlassPanel>
          <LessonPanel phase="explore" />
        </div>
        <GlassPanel className="p-5 lg:col-span-2" delay={0.1}>
          {selected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{selected.title}</h3>
                <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>
              </div>
              <dl className="space-y-2 text-xs">
                {selected.attributes.map((attribute) => (
                  <div key={attribute.label}>
                    <dt className="text-white/40">{attribute.label}</dt>
                    <dd className="break-all font-mono text-white/80">{attribute.value}</dd>
                  </div>
                ))}
              </dl>
              {selected.neighbors.length > 0 && (
                <div>
                  <p className="text-xs text-white/40">Connects to</p>
                  <p className="text-xs text-white/70">{selected.neighbors.join(', ')}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/40">Click a node in the diagram to inspect it.</p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
