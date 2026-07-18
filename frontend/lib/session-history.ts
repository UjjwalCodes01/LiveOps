// Sessions are anonymous — the backend has no user accounts and no
// "list my sessions" endpoint (see AGENT.md §8: user auth beyond a simple
// session ID is an explicit non-goal). This is the only place session
// identity lives client-side: each browser's own localStorage. Page 8
// (Progress/Mastery) reads this list, then asks the backend for each
// session's real, current state — nothing here is a substitute for the
// backend's own data, it's purely "which session IDs belong to this
// browser."
const STORAGE_KEY = 'bbf.sessions';

export interface StoredSession {
  sessionId: string;
  accessToken: string;
  concept: 'load_balancing';
  createdAt: string;
}

function readAll(): StoredSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSession[]) : [];
  } catch {
    return [];
  }
}

function writeAll(sessions: StoredSession[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

// Cached so repeated calls return the same array reference until something
// actually writes — required for safe use with useSyncExternalStore, whose
// getSnapshot must be stable (same reference) when nothing has changed, or
// React re-renders in a loop treating every call as "new" data.
let cachedSnapshot: StoredSession[] | null = null;

export function listStoredSessions(): StoredSession[] {
  cachedSnapshot ??= readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return cachedSnapshot;
}

export function saveStoredSession(entry: StoredSession): void {
  const sessions = readAll().filter((s) => s.sessionId !== entry.sessionId);
  sessions.push(entry);
  writeAll(sessions);
  cachedSnapshot = null;
}

export function getAccessToken(sessionId: string): string | undefined {
  return readAll().find((s) => s.sessionId === sessionId)?.accessToken;
}
