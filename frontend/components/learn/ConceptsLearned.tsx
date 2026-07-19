'use client';

import { motion } from 'motion/react';
import { Check, Lock } from 'lucide-react';
import { useSession } from '@/components/session/SessionProvider';
import {
  CONCEPT_PHASES,
  getLesson,
  isPhaseComplete,
} from '@/lib/curriculum';

// A persistent, gamified strip showing the concepts a student has actually
// earned so far — each one lights up the moment that phase's real
// infrastructure work completes. It sits under the phase stepper: the
// stepper says where you are, this says what you've learned. Small on
// purpose; it's ambient reinforcement, not a wall of text.
export function ConceptsLearned() {
  const { session } = useSession();
  const concept = session?.concept ?? 'load_balancing';
  const state = session?.state ?? 'created';

  const items = CONCEPT_PHASES.map((phase) => ({
    phase,
    label: getLesson(concept, phase).concept,
    earned: isPhaseComplete(phase, state),
  }));
  const earnedCount = items.filter((item) => item.earned).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
        Concepts learned {earnedCount}/{items.length}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => (
          <motion.span
            key={item.phase}
            animate={
              item.earned
                ? { scale: [1, 1.08, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.4 }}
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
              item.earned
                ? 'border-status-healthy/40 bg-status-healthy/10 text-status-healthy'
                : 'border-white/10 bg-white/[0.02] text-white/35',
            ].join(' ')}
          >
            {item.earned ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : (
              <Lock className="h-2.5 w-2.5" />
            )}
            {item.label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
