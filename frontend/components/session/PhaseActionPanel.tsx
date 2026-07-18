'use client';

import type { ReactNode } from 'react';
import { GlassButton } from '@/components/glass/GlassButton';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { useSession } from '@/components/session/SessionProvider';
import { VALID_STATES_BY_PHASE, type Phase, type SessionState } from '@/lib/types';

export function PhaseActionPanel({
  phase,
  title,
  description,
  actionLabel,
  completedHint,
  invalidHint,
}: {
  phase: Phase;
  title: string;
  description: ReactNode;
  actionLabel: string;
  completedHint: string;
  invalidHint: (state: SessionState) => string;
}) {
  const { session, runPhase, running, runError } = useSession();
  const validStates = VALID_STATES_BY_PHASE[phase];
  const canRun = !!session && validStates.includes(session.state);
  const alreadyRan = !!session && !validStates.includes(session.state) && session.state !== 'created';

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div className="mt-1 text-sm text-white/60">{description}</div>
      </div>
      {runError && (
        <div className="rounded-lg border border-status-error/40 bg-status-error/10 p-3 text-sm text-status-error">
          {runError}
        </div>
      )}
      <div className="flex items-center gap-3">
        <GlassButton onClick={() => void runPhase(phase)} disabled={!canRun} loading={running}>
          {actionLabel}
        </GlassButton>
        {!session ? (
          <span className="text-xs text-white/40">Loading session…</span>
        ) : !canRun ? (
          <span className="text-xs text-white/40">
            {alreadyRan ? completedHint : invalidHint(session.state)}
          </span>
        ) : null}
      </div>
    </GlassPanel>
  );
}
