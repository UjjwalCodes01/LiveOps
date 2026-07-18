'use client';

import {
  ArrowRight,
  Compass,
  Hammer,
  LineChart,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
  Wrench,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { GlassButton } from '@/components/glass/GlassButton';
import { GlassPanel } from '@/components/glass/GlassPanel';

const STEPS: Array<{ label: string; icon: LucideIcon; color: string }> = [
  { label: 'Build', icon: Hammer, color: 'var(--status-info)' },
  { label: 'Explore', icon: Compass, color: 'var(--status-info)' },
  { label: 'Break', icon: Zap, color: 'var(--status-error)' },
  { label: 'Diagnose', icon: Stethoscope, color: 'var(--status-warning)' },
  { label: 'Fix', icon: Wrench, color: 'var(--status-healthy)' },
];

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 px-4 py-20 text-center sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-white/40"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-healthy opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-healthy" />
          </span>
          Learn infrastructure by watching it happen — live
        </motion.p>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Build. Break. Fix.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-white/60">
          An AI agent provisions a real Application Load Balancer, breaks it on purpose, diagnoses
          the failure, and fixes it — live, on real AWS infrastructure. Every command, every
          decision, every event streams to you as it actually happens. Nothing is pre-recorded.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/concepts">
            <GlassButton>
              Pick something to learn <ArrowRight className="h-4 w-4" />
            </GlassButton>
          </Link>
          <Link href="/progress">
            <GlassButton variant="secondary">
              <LineChart className="h-4 w-4" /> View progress
            </GlassButton>
          </Link>
        </div>
      </motion.div>

      <GlassPanel className="w-full p-6" delay={0.2} spotlight={false}>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 + index * 0.08, type: 'spring', stiffness: 260, damping: 20 }}
                className="flex items-center gap-2"
              >
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-white"
                  style={{ borderColor: `${step.color}66`, background: `${step.color}1f` }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: step.color }} />
                  {step.label}
                </span>
                {index < STEPS.length - 1 && (
                  <motion.span
                    className="text-white/20"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: index * 0.15 }}
                  >
                    →
                  </motion.span>
                )}
              </motion.div>
            );
          })}
        </div>
        <p className="mt-5 text-sm text-white/40">
          A live recorded run of this exact loop will play here once a demo session has been
          captured — this platform only ever shows what actually happened, so there&rsquo;s no
          preview until there&rsquo;s something real to show.
        </p>
      </GlassPanel>

      <p className="flex max-w-lg items-center gap-2 text-xs text-white/30">
        <ShieldCheck className="h-4 w-4 shrink-0 text-white/25" />
        Every action the agent takes goes through a single instrumented executor with an
        allow-list — it can build, break, diagnose, and fix, and nothing else. See{' '}
        <span className="font-mono">AGENT.md</span> for the full guardrails.
      </p>
    </div>
  );
}
