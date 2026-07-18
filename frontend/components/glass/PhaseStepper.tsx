'use client';

import { Check, Compass, Hammer, Stethoscope, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { PHASES, type Phase, type SessionState } from '@/lib/types';

const PHASE_LABEL: Record<Phase, string> = {
  build: 'Build',
  explore: 'Explore',
  break: 'Break',
  diagnose: 'Diagnose',
  fix: 'Fix',
};
const PHASE_ICON: Record<Phase, LucideIcon> = {
  build: Hammer,
  explore: Compass,
  break: Zap,
  diagnose: Stethoscope,
  fix: Wrench,
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
        const Icon = PHASE_ICON[phase];
        return (
          <Link
            key={phase}
            href={`/session/${sessionId}/${phase}`}
            className="relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium"
          >
            {isCurrent && (
              <motion.span
                layoutId="phase-active-pill"
                className={`absolute inset-0 rounded-full ${isErrored ? 'bg-status-error/25' : 'bg-status-info/30'}`}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span
              className={`relative z-10 flex items-center gap-2 transition-colors ${
                isCurrent ? 'text-white' : isPast ? 'text-white/70 hover:text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] transition-colors ${
                  isErrored
                    ? 'bg-status-error text-black'
                    : isCurrent
                      ? 'bg-status-info text-black'
                      : isPast
                        ? 'bg-status-healthy text-black'
                        : 'bg-white/10 text-white/50'
                }`}
              >
                {isPast && !isErrored ? <Check className="h-3 w-3" strokeWidth={3} /> : <Icon className="h-3 w-3" />}
              </span>
              {PHASE_LABEL[phase]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
