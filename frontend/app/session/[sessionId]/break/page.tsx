'use client';

import { PhaseActionPanel } from '@/components/session/PhaseActionPanel';
import { PhaseWorkspace } from '@/components/session/PhaseWorkspace';

export default function BreakPage() {
  return (
    <div className="flex flex-col gap-5">
      <PhaseActionPanel
        phase="break"
        title="Failure Injection Lab"
        description={
          <>
            <p>
              This concept implements one real failure mode: the agent deregisters a healthy EC2
              target from the load balancer&rsquo;s target group, so it stops receiving traffic —
              the same mechanism a real instance crash or failed health check would trigger.
            </p>
            <p className="mt-1 text-white/40">
              Only one failure exists right now because it&rsquo;s the only one this concept
              actually implements end-to-end — see the Concept Selection page for what&rsquo;s
              coming next.
            </p>
          </>
        }
        actionLabel="Inject the failure"
        completedHint="Failure already injected — head to Diagnose."
        invalidHint={(state) => `The system must be built and ready first (currently "${state}").`}
      />
      <PhaseWorkspace phase="break" emptyFeedHint="Inject the failure to watch it happen." />
    </div>
  );
}
