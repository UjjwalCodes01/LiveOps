'use client';

import {
  AlertCircle,
  ArrowRight,
  Clock,
  Database,
  GitBranch,
  Layers3,
  type LucideIcon,
  Network,
  SignalHigh,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GlassButton } from '@/components/glass/GlassButton';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { ApiError, createSession } from '@/lib/api';
import { saveStoredSession } from '@/lib/session-history';

interface ConceptCard {
  id: string;
  title: string;
  icon: LucideIcon;
  difficulty: string;
  estimate: string;
  description: string;
  available: boolean;
}

const CONCEPTS: ConceptCard[] = [
  {
    id: 'load_balancing',
    title: 'Load Balancing',
    icon: Network,
    difficulty: 'Beginner',
    estimate: '10–15 min',
    description:
      'Watch a real Application Load Balancer and three EC2 targets get built, then watch a target fail and get diagnosed and fixed live.',
    available: true,
  },
  {
    id: 'caching',
    title: 'Caching',
    icon: Database,
    difficulty: 'Intermediate',
    estimate: '10–15 min',
    description: 'A cache in front of a small API, with hit/miss visualized live.',
    available: false,
  },
  {
    id: 'container_orchestration',
    title: 'Container Orchestration',
    icon: Layers3,
    difficulty: 'Advanced',
    estimate: '15–20 min',
    description: 'Scaling and failover on a live cluster.',
    available: false,
  },
  {
    id: 'replication',
    title: 'Database Replication',
    icon: GitBranch,
    difficulty: 'Advanced',
    estimate: '15–20 min',
    description: 'A primary/replica setup showing replication lag and failover.',
    available: false,
  },
];

export default function ConceptsPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setCreating(true);
    setError(null);
    try {
      const { session, accessToken } = await createSession();
      saveStoredSession({
        sessionId: session.id,
        accessToken,
        concept: session.concept,
        createdAt: session.createdAt,
      });
      router.push(`/session/${session.id}/build`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the backend. Confirm it is running and NEXT_PUBLIC_API_BASE_URL is correct.',
      );
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-white">Pick something to learn</h1>
        <p className="mt-3 text-white/60">
          Every card below is a real system the agent will actually build in front of you — not a
          simulation.
        </p>
      </motion.div>

      {error && (
        <GlassPanel
          spotlight={false}
          className="mb-6 flex items-start gap-2 border-status-error/40 p-4 text-sm text-status-error"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </GlassPanel>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {CONCEPTS.map((concept, index) => {
          const Icon = concept.icon;
          return (
            <GlassPanel
              key={concept.id}
              delay={index * 0.06}
              hover={concept.available}
              className={`flex flex-col gap-4 p-6 ${concept.available ? '' : 'opacity-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5">
                    <Icon className="h-5 w-5 text-status-info" />
                  </span>
                  <h2 className="text-lg font-semibold text-white">{concept.title}</h2>
                </div>
                {!concept.available && (
                  <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-sm text-white/60">{concept.description}</p>
              <div className="flex gap-4 text-xs text-white/40">
                <span className="inline-flex items-center gap-1">
                  <SignalHigh className="h-3.5 w-3.5" /> {concept.difficulty}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {concept.estimate}
                </span>
              </div>
              {concept.available ? (
                <GlassButton onClick={start} loading={creating} className="mt-auto self-start">
                  Start building <ArrowRight className="h-3.5 w-3.5" />
                </GlassButton>
              ) : (
                <span className="mt-auto text-xs text-white/40">Not built yet</span>
              )}
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
