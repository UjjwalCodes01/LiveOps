'use client';

import { GlassPanel } from '@/components/glass/GlassPanel';
import { TargetHealthTimeline } from '@/components/metrics/TargetHealthTimeline';
import { PhaseActionPanel } from '@/components/session/PhaseActionPanel';
import { PhaseWorkspace } from '@/components/session/PhaseWorkspace';
import { RootCauseCallout } from '@/components/session/RootCauseCallout';
import { useSession } from '@/components/session/SessionProvider';

export default function DiagnosePage() {
  const { events } = useSession();
  return (
    <div className="flex flex-col gap-5">
      <PhaseActionPanel
        phase="diagnose"
        title="Diagnosis Console"
        description="The agent pulls real target health from AWS and reasons about what it finds — every hypothesis and conclusion is narrated on the feed, not summarized after the fact."
        actionLabel="Diagnose the failure"
        completedHint="Diagnosis complete — head to Fix to remediate."
        invalidHint={(state) => `Nothing to diagnose yet (currently "${state}"). Break the system first.`}
      />
      <RootCauseCallout />
      <PhaseWorkspace
        phase="diagnose"
        emptyFeedHint="Run diagnosis to see the agent's investigation step by step."
        extra={
          <GlassPanel className="p-4" delay={0.15}>
            <h3 className="mb-2 text-sm font-semibold text-white">Target health over time</h3>
            <TargetHealthTimeline events={events} />
          </GlassPanel>
        }
      />
    </div>
  );
}
