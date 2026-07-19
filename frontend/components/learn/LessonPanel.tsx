'use client';

import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Eye,
  GraduationCap,
  Lightbulb,
  Lock,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Checkpoint } from '@/components/learn/Checkpoint';
import { useSession } from '@/components/session/SessionProvider';
import { getLesson, isPhaseComplete } from '@/lib/curriculum';
import type { Phase } from '@/lib/types';

// The teaching panel shown on every phase page beside the live workspace.
// It answers "why am I watching this?" — the concept, the real-world stakes,
// what the agent is doing under the AWS jargon, what to watch for, and a
// takeaway that stays locked until the phase's real infrastructure work
// actually completes. That lock ties the *learning* beat to the *doing*
// beat: you earn the lesson by watching it really happen.
export function LessonPanel({ phase }: { phase: Phase }) {
  const { session } = useSession();
  const concept = session?.concept ?? 'load_balancing';
  const lesson = getLesson(concept, phase);
  const complete = !!session && isPhaseComplete(phase, session.state);
  const [showTerms, setShowTerms] = useState(false);

  return (
    <GlassPanel className="flex flex-col gap-4 p-5" delay={0.08}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-info/15 text-status-info">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-status-info">
            The concept
          </div>
          <h3 className="text-base font-semibold text-white">{lesson.concept}</h3>
          <p className="text-sm text-white/50">{lesson.tagline}</p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-white/75">{lesson.intro}</p>

      <Section icon={Terminal} label="What the agent is doing">
        {lesson.whatsHappening}
      </Section>

      <Section icon={Eye} label="Watch for">
        {lesson.watchFor}
      </Section>

      <div>
        <button
          type="button"
          onClick={() => setShowTerms((value) => !value)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/50 transition-colors hover:text-white/80"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Key terms ({lesson.terms.length})
          <span className="text-white/30">{showTerms ? '–' : '+'}</span>
        </button>
        <AnimatePresence initial={false}>
          {showTerms && (
            <motion.dl
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-2 flex flex-col gap-2 overflow-hidden"
            >
              {lesson.terms.map((term) => (
                <div
                  key={term.term}
                  className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2"
                >
                  <dt className="text-sm font-medium text-white">{term.term}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-white/60">
                    {term.definition}
                  </dd>
                </div>
              ))}
            </motion.dl>
          )}
        </AnimatePresence>
      </div>

      <Takeaway text={lesson.takeaway} unlocked={complete} />

      {/* The quick-check only appears once the phase's real work has run, so
          the question lands after the student has actually seen the
          behaviour it asks about — active recall, not a pop quiz on
          something they haven't watched yet. */}
      {complete && lesson.checkpoint && (
        <Checkpoint checkpoint={lesson.checkpoint} />
      )}
    </GlassPanel>
  );
}

function Section({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Eye;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-white/75">{children}</p>
    </div>
  );
}

// Locked until the phase's real work completes, then revealed with emphasis.
// The lock isn't a gimmick: it makes the takeaway something you earn by
// watching the infrastructure actually do the thing, not a spoiler handed
// over up front.
function Takeaway({ text, unlocked }: { text: string; unlocked: boolean }) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl border p-4 transition-colors',
        unlocked
          ? 'border-status-healthy/40 bg-status-healthy/[0.07]'
          : 'border-white/8 bg-white/[0.02]',
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide',
          unlocked ? 'text-status-healthy' : 'text-white/40',
        ].join(' ')}
      >
        {unlocked ? (
          <Sparkles className="h-3.5 w-3.5" />
        ) : (
          <Lock className="h-3.5 w-3.5" />
        )}
        {unlocked ? 'Takeaway' : 'Takeaway — locked until this phase runs'}
      </div>
      {unlocked ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-1.5 flex items-start gap-2 text-sm font-medium leading-relaxed text-white"
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-status-healthy" />
          {text}
        </motion.p>
      ) : (
        <p className="mt-1.5 select-none text-sm leading-relaxed text-white/25 blur-[3px]">
          {text}
        </p>
      )}
    </div>
  );
}
