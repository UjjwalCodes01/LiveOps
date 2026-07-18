'use client';

import { AlertTriangle, SearchX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore, type ReactNode } from 'react';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { GlassButton } from '@/components/glass/GlassButton';
import { ConnectionStatus } from '@/components/glass/ConnectionStatus';
import { PhaseStepper } from '@/components/glass/PhaseStepper';
import { StateBadge } from '@/components/glass/Badge';
import { SessionProvider, useSession } from '@/components/session/SessionProvider';
import { getAccessToken } from '@/lib/session-history';
import { PHASES, type Phase } from '@/lib/types';

// The stored access token for a given session never changes during this
// component's lifetime (it's written once at session-creation time, before
// ever navigating here), so there's nothing to subscribe to — just a
// stable no-op satisfying useSyncExternalStore's contract.
function noopSubscribe(): () => void {
  return () => undefined;
}

function currentPhaseFromPath(pathname: string): Phase {
  const segment = pathname.split('/').filter(Boolean).at(-1);
  return (PHASES as readonly string[]).includes(segment ?? '') ? (segment as Phase) : 'build';
}

function SessionHeader({ sessionId, currentPhase }: { sessionId: string; currentPhase: Phase }) {
  const { session, connection } = useSession();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-display text-sm font-semibold tracking-tight text-white/90"
          >
            Build. Break. Fix.
          </Link>
          {session && <StateBadge state={session.state} />}
        </div>
        <ConnectionStatus state={connection} />
      </div>
      <PhaseStepper
        sessionId={sessionId}
        currentPhase={currentPhase}
        sessionState={session?.state ?? 'created'}
      />
    </div>
  );
}

export function SessionShell({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const currentPhase = currentPhaseFromPath(pathname);
  // localStorage doesn't exist during SSR, so useSyncExternalStore renders
  // the server snapshot (null) through hydration, then synchronously
  // swaps in the real client value right after — no effect, no hydration
  // mismatch warning, no manual "have we read it yet" flag to manage.
  const accessToken = useSyncExternalStore(
    noopSubscribe,
    () => getAccessToken(sessionId) ?? null,
    () => null,
  );

  if (accessToken === null)
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <GlassPanel className="p-8">
          <SearchX className="mx-auto mb-3 h-8 w-8 text-white/30" />
          <h1 className="text-lg font-semibold text-white">Session not found in this browser</h1>
          <p className="mt-2 text-sm text-white/60">
            This session&rsquo;s access token only ever lived in the browser that created it, and
            it isn&rsquo;t in this one. Start a new session to continue.
          </p>
          <Link href="/concepts" className="mt-6 inline-block">
            <GlassButton>Start a new session</GlassButton>
          </Link>
        </GlassPanel>
      </div>
    );

  return (
    <SessionProvider sessionId={sessionId} accessToken={accessToken}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <SessionHeader sessionId={sessionId} currentPhase={currentPhase} />
        <SessionErrorBanner />
        <AnimatePresence mode="wait">
          <motion.main
            key={currentPhase}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex-1"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </SessionProvider>
  );
}

function SessionErrorBanner() {
  const { sessionError } = useSession();
  if (!sessionError) return null;
  return (
    <GlassPanel
      spotlight={false}
      className="flex items-start gap-2 border-status-error/40 p-4 text-sm text-status-error"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {sessionError}
    </GlassPanel>
  );
}
