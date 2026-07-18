import { io, type Socket } from 'socket.io-client';
import type { SessionEvent } from './types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';

export interface JoinAck {
  sessionId: string;
  replayed: number;
}

// Mirrors EventsGateway's config exactly (namespace/transports) — the
// server only accepts websocket transport, so the client must too or the
// handshake never completes. See backend/src/events/events.gateway.ts.
export function createEventsSocket(): Socket {
  return io(`${WS_URL}/events`, {
    transports: ['websocket'],
    autoConnect: false,
    auth: { apiKey: API_KEY },
  });
}

// NestJS's WS exception filter never invokes the ack callback when the
// handler throws (e.g. an unknown/unauthorized session) — it emits a
// separate 'exception' event instead. Race both, plus a timeout, so a bad
// session/token rejects instead of hanging forever.
export function joinSession(
  socket: Socket,
  sessionId: string,
  sessionToken: string,
  since: string | undefined,
  onReplay: (events: SessionEvent[]) => void,
): Promise<JoinAck> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.off('exception', onException);
      reject(new Error('Timed out joining the session.'));
    }, 10_000);

    function onException(error: { message?: string } | string) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(typeof error === 'string' ? error : (error.message ?? 'Failed to join session.')));
    }
    socket.once('exception', onException);
    socket.once('session:replay', (events: SessionEvent[]) => onReplay(events));

    socket.emit('session:join', { sessionId, sessionToken, since }, (ack: JoinAck) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.off('exception', onException);
      resolve(ack);
    });
  });
}
