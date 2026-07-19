'use client';

import { motion } from 'motion/react';
import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { Checkpoint as CheckpointData } from '@/lib/curriculum';

// A lightweight, single-question knowledge check. It's not graded or
// persisted — the point is active recall: making the student commit to an
// answer turns passive watching into learning, and every option (right or
// wrong) reveals a teaching explanation. Unlocks only once the relevant
// phase has actually happened, so the question lands after the student has
// seen the real behaviour it's asking about.
export function Checkpoint({ checkpoint }: { checkpoint: CheckpointData }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-status-info">
        <HelpCircle className="h-3.5 w-3.5" />
        Quick check
      </div>
      <p className="mt-2 text-sm font-medium text-white">{checkpoint.question}</p>
      <div className="mt-3 flex flex-col gap-2">
        {checkpoint.options.map((option, index) => {
          const isSelected = selected === index;
          const reveal = answered && (isSelected || option.correct);
          const tone = !reveal
            ? 'idle'
            : option.correct
              ? 'correct'
              : 'wrong';
          return (
            <button
              key={index}
              type="button"
              disabled={answered}
              onClick={() => setSelected(index)}
              className={[
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                tone === 'idle' &&
                  'border-white/10 bg-white/[0.02] text-white/80 hover:border-white/25 hover:bg-white/[0.05]',
                tone === 'correct' &&
                  'border-status-healthy/50 bg-status-healthy/10 text-white',
                tone === 'wrong' &&
                  'border-status-error/50 bg-status-error/10 text-white',
                answered && !reveal && 'opacity-50',
                answered ? 'cursor-default' : 'cursor-pointer',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="flex items-start gap-2">
                {reveal &&
                  (option.correct ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-healthy" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" />
                  ))}
                <span>{option.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      {answered && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-white/70"
        >
          {checkpoint.options[selected]?.explanation}
        </motion.p>
      )}
    </div>
  );
}
