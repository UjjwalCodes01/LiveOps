import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Pool } from 'pg';
import { ApplicationConfiguration } from '../config/configuration';
import { CreatedSession, Session, SessionEvent } from '../events/domain';

interface SessionRow {
  id: string;
  concept: 'load_balancing';
  state: Session['state'];
  created_at: Date;
  updated_at: Date;
}
interface EventRow {
  id: string;
  session_id: string;
  phase: SessionEvent['phase'];
  type: SessionEvent['type'];
  action: string | null;
  command: string | null;
  explanation: string;
  result: Record<string, unknown> | null;
  timestamp: Date;
  duration_ms: number | null;
}

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly pool?: Pool;
  private readonly testSessions = new Map<string, Session>();
  private readonly testEvents = new Map<string, SessionEvent[]>();
  private readonly testLocks = new Set<string>();
  private readonly testTokenHashes = new Map<string, string>();

  constructor(config: ConfigService) {
    const settings = config.getOrThrow<ApplicationConfiguration>('app');
    if (settings.databaseUrl)
      this.pool = new Pool({
        connectionString: settings.databaseUrl,
        max: 20,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
    else if (settings.environment !== 'test')
      throw new Error('DATABASE_URL is required outside the test environment.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async withOperationLock<T>(
    sessionId: string,
    operation: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    if (!this.pool) {
      if (this.testLocks.has(sessionId))
        throw new Error(
          `Session ${sessionId} already has an active operation.`,
        );
      this.testLocks.add(sessionId);
      try {
        return await callback();
      } finally {
        this.testLocks.delete(sessionId);
      }
    }
    await this.pool.query(
      "DELETE FROM session_operations WHERE locked_at < now() - interval '15 minutes'",
    );
    const result = await this.pool.query(
      'INSERT INTO session_operations (session_id, operation) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING session_id',
      [sessionId, operation],
    );
    if (!result.rowCount)
      throw new Error(`Session ${sessionId} already has an active operation.`);
    try {
      return await callback();
    } finally {
      await this.pool.query(
        'DELETE FROM session_operations WHERE session_id = $1',
        [sessionId],
      );
    }
  }

  async create(): Promise<CreatedSession> {
    const timestamp = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      concept: 'load_balancing',
      state: 'created',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const accessToken = randomBytes(32).toString('base64url');
    const accessTokenHash = this.hashToken(accessToken);
    if (!this.pool) {
      this.testSessions.set(session.id, session);
      this.testEvents.set(session.id, []);
      this.testTokenHashes.set(session.id, accessTokenHash);
      return { session, accessToken };
    }
    await this.pool.query(
      'INSERT INTO sessions (id, concept, state, created_at, updated_at, access_token_hash) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        session.id,
        session.concept,
        session.state,
        session.createdAt,
        session.updatedAt,
        accessTokenHash,
      ],
    );
    return { session, accessToken };
  }

  async authorize(sessionId: string, token?: string): Promise<void> {
    if (!token) throw new NotFoundException('Session was not found.');
    const expected = !this.pool
      ? this.testTokenHashes.get(sessionId)
      : (
          await this.pool.query<{ access_token_hash: string | null }>(
            'SELECT access_token_hash FROM sessions WHERE id = $1',
            [sessionId],
          )
        ).rows[0]?.access_token_hash;
    if (!expected || !this.tokensMatch(expected, this.hashToken(token)))
      throw new NotFoundException('Session was not found.');
  }

  async get(sessionId: string): Promise<Session> {
    if (!this.pool) return this.testSession(sessionId);
    const response = await this.pool.query<SessionRow>(
      'SELECT id, concept, state, created_at, updated_at FROM sessions WHERE id = $1',
      [sessionId],
    );
    if (!response.rowCount)
      throw new NotFoundException(`Session ${sessionId} was not found`);
    return this.mapSession(response.rows[0]);
  }

  async transition(
    sessionId: string,
    state: Session['state'],
  ): Promise<Session> {
    if (!this.pool) {
      const updated = {
        ...this.testSession(sessionId),
        state,
        updatedAt: new Date().toISOString(),
      };
      this.testSessions.set(sessionId, updated);
      return updated;
    }
    const response = await this.pool.query<SessionRow>(
      'UPDATE sessions SET state = $2, updated_at = now() WHERE id = $1 RETURNING id, concept, state, created_at, updated_at',
      [sessionId, state],
    );
    if (!response.rowCount)
      throw new NotFoundException(`Session ${sessionId} was not found`);
    return this.mapSession(response.rows[0]);
  }

  async appendEvent(event: SessionEvent): Promise<void> {
    if (!this.pool) {
      const events = this.testEvents.get(event.sessionId);
      if (!events)
        throw new NotFoundException(`Session ${event.sessionId} was not found`);
      events.push(event);
      return;
    }
    await this.pool.query(
      'INSERT INTO session_events (id, session_id, phase, type, action, command, explanation, result, timestamp, duration_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        event.id,
        event.sessionId,
        event.phase,
        event.type,
        event.action ?? null,
        event.command ?? null,
        event.explanation,
        event.result ?? null,
        event.timestamp,
        event.durationMs ?? null,
      ],
    );
  }

  async eventsSince(
    sessionId: string,
    since?: string,
  ): Promise<SessionEvent[]> {
    if (!this.pool) {
      const events = this.testEvents.get(sessionId);
      if (!events)
        throw new NotFoundException(`Session ${sessionId} was not found`);
      return since
        ? events.filter((event) => event.timestamp > since)
        : [...events];
    }
    const response = await this.pool.query<EventRow>(
      'SELECT id, session_id, phase, type, action, command, explanation, result, timestamp, duration_ms FROM session_events WHERE session_id = $1 AND ($2::timestamptz IS NULL OR timestamp > $2::timestamptz) ORDER BY timestamp ASC',
      [sessionId, since ?? null],
    );
    return response.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      phase: row.phase,
      type: row.type,
      action: row.action ?? undefined,
      command: row.command ?? undefined,
      explanation: row.explanation,
      result: row.result ?? undefined,
      timestamp: new Date(row.timestamp).toISOString(),
      durationMs: row.duration_ms ?? undefined,
    }));
  }

  private testSession(sessionId: string): Session {
    const session = this.testSessions.get(sessionId);
    if (!session)
      throw new NotFoundException(`Session ${sessionId} was not found`);
    return session;
  }
  private mapSession(row: SessionRow): Session {
    return {
      id: row.id,
      concept: row.concept,
      state: row.state,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private tokensMatch(expected: string, actual: string): boolean {
    const left = Buffer.from(expected);
    const right = Buffer.from(actual);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
