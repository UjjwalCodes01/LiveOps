'use client';

import confetti from 'canvas-confetti';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { ApiError, getSession, runAgentPhase } from '@/lib/api';
import { friendlyAction, friendlyExplanation } from '@/lib/humanize';
import { createEventsSocket, joinSession } from '@/lib/socket';
import type { Phase, Session, SessionEvent } from '@/lib/types';
import type { ConnectionState } from '@/components/glass/ConnectionStatus';

const TOAST_EVENT_TYPES = new Set(['action_completed', 'action_failed', 'narration']);
// Retry-attempt noise ("agent temporarily unavailable, retrying...") is
// already visible, less intrusively, in the command feed — a full toast
// per retry is more clutter than signal for a student watching.
const RETRY_PATTERN = /^Agent temporarily unavailable; retrying/;

function notify(event: SessionEvent): void {
  if (!TOAST_EVENT_TYPES.has(event.type)) return;
  if (event.type === 'action_failed' && RETRY_PATTERN.test(event.explanation)) return;
  const label = friendlyAction(event.action) ?? event.phase;
  const description = friendlyExplanation(event.explanation).text;
  if (event.type === 'action_failed') toast.error(label, { description });
  else if (event.type === 'action_completed') toast.success(label, { description });
  else toast(label, { description });
}

function celebrate(): void {
  const colors = ['#0ca30c', '#818cf8', '#fab219'];
  const end = Date.now() + 800;
  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 60,
      origin: { x: 0 },
      colors,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 60,
      origin: { x: 1 },
      colors,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

interface SessionContextValue {
  session: Session | null;
  sessionError: string | null;
  events: SessionEvent[];
  connection: ConnectionState;
  runPhase: (phase: Phase) => Promise<void>;
  running: boolean;
  runError: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

const STATE_CHANGING_EVENTS = new Set(['action_completed', 'action_failed']);

export function SessionProvider({
  sessionId,
  accessToken,
  children,
}: {
  sessionId: string;
  accessToken: string;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const lastTimestampRef = useRef<string | undefined>(undefined);
  const celebratedRef = useRef(false);

  const appendEvents = useCallback((incoming: SessionEvent[]) => {
    if (!incoming.length) return;
    setEvents((prev) => {
      const seen = new Set(prev.map((event) => event.id));
      const fresh = incoming.filter((event) => !seen.has(event.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastTimestampRef.current = incoming[incoming.length - 1]!.timestamp;
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Bumped on every getSession() call this effect instance makes; a
    // response only gets applied if it's still the most recently
    // *initiated* one when it resolves. Without this, an earlier request
    // resolving after a later one (real network jitter, not exotic —
    // action_completed/action_failed fire 7+ times during a build, each
    // triggering a refresh) can regress the displayed state to stale data.
    let fetchSeq = 0;

    // This component instance is reused across client-side navigation
    // between two different sessions (e.g. Progress page -> "Open" on a
    // different session, no full reload) — sessionId/accessToken change
    // but nothing unmounts. Without resetting here, the new session's
    // command feed would start out mixed with the previous session's
    // events, and a session that happens to already be 'completed' when
    // switched to would inherit celebratedRef=true and never fire confetti.
    // This is a reset-on-identity-change tied to rebuilding the socket
    // subscription below, not derived state — same justification as the
    // other react-hooks/set-state-in-effect disables in this codebase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents([]);
    setSession(null);
    setSessionError(null);
    setConnection('connecting');
    lastTimestampRef.current = undefined;
    celebratedRef.current = false;

    function refreshSession(options: { reportErrors: boolean }) {
      const seq = ++fetchSeq;
      getSession(sessionId, accessToken)
        .then((current) => {
          if (cancelled || seq !== fetchSeq) return;
          setSession(current);
          if (current.state === 'completed' && !celebratedRef.current) {
            celebratedRef.current = true;
            celebrate();
            toast.success('Fixed! The system recovered.', {
              description: 'Build → break → diagnose → fix, all real, all live.',
            });
          }
        })
        .catch((error: unknown) => {
          if (cancelled || seq !== fetchSeq || !options.reportErrors) return;
          setSessionError(
            error instanceof ApiError ? error.message : 'This session could not be loaded.',
          );
        });
    }

    refreshSession({ reportErrors: true });

    const socket = createEventsSocket();

    const connectAndJoin = () => {
      setConnection((current) => (current === 'connected' ? current : 'connecting'));
      joinSession(socket, sessionId, accessToken, lastTimestampRef.current, appendEvents).catch(
        (error: unknown) => {
          setSessionError(error instanceof Error ? error.message : 'Failed to join the session.');
        },
      );
    };

    socket.on('connect', () => {
      setConnection('connected');
      connectAndJoin();
    });
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('error'));
    socket.on('session:event', (event: SessionEvent) => {
      appendEvents([event]);
      notify(event);
      if (STATE_CHANGING_EVENTS.has(event.type)) refreshSession({ reportErrors: false });
    });

    socket.connect();

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [sessionId, accessToken, appendEvents]);

  const runPhase = useCallback(
    async (phase: Phase) => {
      setRunning(true);
      setRunError(null);
      try {
        const { session: updated } = await runAgentPhase(sessionId, accessToken, phase);
        setSession(updated);
      } catch (error) {
        setRunError(
          error instanceof ApiError ? error.message : 'Something went wrong running this phase.',
        );
      } finally {
        setRunning(false);
      }
    },
    [sessionId, accessToken],
  );

  return (
    <SessionContext.Provider
      value={{ session, sessionError, events, connection, runPhase, running, runError }}
    >
      {children}
    </SessionContext.Provider>
  );
}
