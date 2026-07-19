'use client';

import { GlassPanel } from '@/components/glass/GlassPanel';
import { LiveEndpoint } from '@/components/session/LiveEndpoint';
import { PhaseActionPanel } from '@/components/session/PhaseActionPanel';
import { PhaseWorkspace } from '@/components/session/PhaseWorkspace';
import { useSession } from '@/components/session/SessionProvider';
import type { Phase, SessionEvent } from '@/lib/types';

const STORY_PHASES: Array<{ phase: Phase; label: string }> = [
  { phase: 'break', label: 'What broke' },
  { phase: 'diagnose', label: 'What the agent found' },
  { phase: 'fix', label: 'How it was fixed' },
];

function lastNarrationFor(events: SessionEvent[], phase: Phase): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.phase === phase && (event.type === 'action_completed' || event.type === 'narration'))
      return event.explanation;
  }
  return undefined;
}

function RecoverySummary() {
  const { session, events } = useSession();
  if (session?.state !== 'completed') return null;
  return (
    <GlassPanel className="p-6" delay={0.2}>
      <h3 className="mb-4 text-sm font-semibold text-white">The story, start to finish</h3>
      <ol className="space-y-4">
        {STORY_PHASES.map(({ phase, label }, index) => {
          const explanation = lastNarrationFor(events, phase);
          return (
            <li key={phase} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-white/60">
                {index + 1}
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/40">{label}</p>
                <p className="text-sm text-white/80">{explanation ?? 'No record of this step.'}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </GlassPanel>
  );
}

export default function FixPage() {
  return (
    <div className="flex flex-col gap-5">
      <PhaseActionPanel
        phase="fix"
        title="Fix & Recovery"
        description="The agent re-registers the failed target with the load balancer and the system visibly recovers — watch the diagram turn green again."
        actionLabel="Fix it"
        completedHint="Fixed — this session is complete."
        invalidHint={(state) => `Nothing to fix yet (currently "${state}"). Diagnose the failure first.`}
      />
      <PhaseWorkspace phase="fix" emptyFeedHint="Run the fix to watch the system recover." />
      <LiveEndpoint />
      <RecoverySummary />
    </div>
  );
}
