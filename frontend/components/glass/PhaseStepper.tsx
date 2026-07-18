'use client';

import Link from 'next/link';
import { PHASES, type Phase, type SessionState } from '@/lib/types';

const PHASE_LABEL: Record<Phase, string> = {
  build: 'Build',
  explore: 'Explore',
  break: 'Break',
  diagnose: 'Diagnose',
  fix: 'Fix',
};

export function PhaseStepper({
  sessionId,
  currentPhase,
  sessionState,
}: {
  sessionId: string;
  currentPhase: Phase;
  sessionState: SessionState;
}) {
  const currentIndex = PHASES.indexOf(currentPhase);
  const failed = sessionState === 'failed';

  return (
    <nav aria-label="Session progress" className="glass-panel flex flex-wrap gap-1 p-1.5">
      {PHASES.map((phase, index) => {
        const isCurrent = phase === currentPhase;
        const isPast = index < currentIndex;
        const isErrored = isCurrent && failed;
        return (
          <Link
            key={phase}
            href={`/session/${sessionId}/${phase}`}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              isErrored
                ? 'bg-status-error/25 text-white'
                : isCurrent
                  ? 'bg-status-info/30 text-white'
                  : isPast
                    ? 'text-white/70 hover:bg-white/10'
                    : 'text-white/35 hover:bg-white/5'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                isErrored
                  ? 'bg-status-error text-black'
                  : isCurrent
                    ? 'bg-status-info text-black'
                    : isPast
                      ? 'bg-white/30 text-black'
                      : 'bg-white/10 text-white/50'
              }`}
            >
              {index + 1}
            </span>
            {PHASE_LABEL[phase]}
          </Link>
        );
      })}
    </nav>
  );
}
