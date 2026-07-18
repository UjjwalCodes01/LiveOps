'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, getSession, runAgentPhase } from '@/lib/api';
import { createEventsSocket, joinSession } from '@/lib/socket';
import type { Phase, Session, SessionEvent } from '@/lib/types';
import type { ConnectionState } from '@/components/glass/ConnectionStatus';

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

    getSession(sessionId, accessToken)
      .then((current) => {
        if (!cancelled) setSession(current);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSessionError(
          error instanceof ApiError ? error.message : 'This session could not be loaded.',
        );
      });

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
      if (STATE_CHANGING_EVENTS.has(event.type))
        getSession(sessionId, accessToken)
          .then((current) => {
            if (!cancelled) setSession(current);
          })
          .catch(() => undefined);
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
