'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { GlassButton } from '@/components/glass/GlassButton';
import { GlassPanel } from '@/components/glass/GlassPanel';

const STEPS = [
  { label: 'Build', color: 'var(--status-info)' },
  { label: 'Explore', color: 'var(--status-info)' },
  { label: 'Break', color: 'var(--status-error)' },
  { label: 'Diagnose', color: 'var(--status-warning)' },
  { label: 'Fix', color: 'var(--status-healthy)' },
];

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 px-4 py-20 text-center sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-white/40">
          Learn infrastructure by watching it happen — live
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Build. Break. Fix.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-white/60">
          An AI agent provisions a real Application Load Balancer, breaks it on purpose, diagnoses
          the failure, and fixes it — live, on real AWS infrastructure. Every command, every
          decision, every event streams to you as it actually happens. Nothing is pre-recorded.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/concepts">
            <GlassButton>Pick something to learn</GlassButton>
          </Link>
          <Link href="/progress">
            <GlassButton variant="secondary">View progress</GlassButton>
          </Link>
        </div>
      </motion.div>

      <GlassPanel className="w-full p-6" delay={0.2}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {STEPS.map((step, index) => (
            <div key={step.label} className="flex items-center gap-3">
              <span
                className="rounded-full border px-4 py-2 text-sm font-medium text-white"
                style={{ borderColor: `${step.color}66`, background: `${step.color}1f` }}
              >
                {step.label}
              </span>
              {index < STEPS.length - 1 && <span className="text-white/20">→</span>}
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-white/40">
          A live recorded run of this exact loop will play here once a demo session has been
          captured — this platform only ever shows what actually happened, so there&rsquo;s no
          preview until there&rsquo;s something real to show.
        </p>
      </GlassPanel>

      <p className="max-w-lg text-xs text-white/30">
        Every action the agent takes goes through a single instrumented executor with an
        allow-list — it can build, break, diagnose, and fix, and nothing else. See{' '}
        <span className="font-mono">AGENT.md</span> for the full guardrails.
      </p>
    </div>
  );
}
