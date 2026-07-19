'use client';

import { BuildProgress } from '@/components/session/BuildProgress';
import { PhaseActionPanel } from '@/components/session/PhaseActionPanel';
import { PhaseWorkspace } from '@/components/session/PhaseWorkspace';

export default function BuildPage() {
  return (
    <div className="flex flex-col gap-5">
      <PhaseActionPanel
        phase="build"
        title="Build Studio"
        description="The agent will provision a real Application Load Balancer and three EC2 targets, narrating every AWS SDK call as it happens."
        actionLabel="Build the system"
        completedHint="Already built — head to Explore to look around."
        invalidHint={(state) => `Can't build from state "${state}".`}
      />
      <PhaseWorkspace
        phase="build"
        emptyFeedHint="Run the build to see the agent's first move."
        extra={<BuildProgress />}
      />
    </div>
  );
}
