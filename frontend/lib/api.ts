import type { CreatedSession, Phase, Session, SessionEvent } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface NestErrorBody {
  message?: string | string[];
  error?: string;
}

async function request<T>(
  path: string,
  options: { method?: string; sessionToken?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'x-api-key': API_KEY };
  if (options.sessionToken) headers['x-session-token'] = options.sessionToken;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as NestErrorBody;
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : (body.message ?? body.error ?? `Request failed with status ${response.status}`);
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface PlatformStatus {
  sandbox: boolean;
  awsEnabled: boolean;
  awsRegion: string;
  sessionTtlMinutes: number;
  awsResourceTtlMinutes: number;
}

// Non-sensitive operational metadata for the cost/status panel (region,
// AWS on/off, lifecycle TTLs). Public endpoint — no session needed.
export function getStatus(): Promise<PlatformStatus> {
  return request<PlatformStatus>('/status');
}

export function createSession(): Promise<CreatedSession> {
  return request<CreatedSession>('/sessions', { method: 'POST' });
}

export function getSession(sessionId: string, sessionToken: string): Promise<Session> {
  return request<Session>(`/sessions/${sessionId}`, { sessionToken });
}

// Explicitly tear down a finished (completed/failed) session's AWS resources.
// The cleanup itself streams back as narrated events over the socket.
export function teardownSession(sessionId: string, sessionToken: string): Promise<Session> {
  return request<Session>(`/sessions/${sessionId}/teardown`, {
    method: 'POST',
    sessionToken,
  });
}

export function getEvents(
  sessionId: string,
  sessionToken: string,
  since?: string,
): Promise<SessionEvent[]> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<SessionEvent[]>(`/sessions/${sessionId}/events${query}`, { sessionToken });
}

// The agent-driven path (POST .../agent/execute) — not the raw
// /build|/break|/diagnose|/fix orchestration shortcuts — is the one this
// UI calls, because the agent's narrated decision is the actual product
// (see AGENT.md §3's "golden rule": the agent only ever calls
// executor.run(action), and every action is narrated on the event stream).
export function runAgentPhase(
  sessionId: string,
  sessionToken: string,
  phase: Phase,
): Promise<{ session: Session }> {
  return request<{ session: Session }>(`/sessions/${sessionId}/agent/execute`, {
    method: 'POST',
    sessionToken,
    body: { phase },
  });
}
