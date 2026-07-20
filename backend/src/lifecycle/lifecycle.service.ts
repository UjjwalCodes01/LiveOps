import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ApplicationConfiguration } from '../config/configuration';
import { Phase, Session } from '../events/domain';
import { EventsService } from '../events/events.service';
import { ExecutorService } from '../executor/executor.service';
import { SessionService } from '../sessions/session.service';

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);
  private running = false;
  constructor(
    private readonly config: ConfigService,
    private readonly executor: ExecutorService,
    private readonly sessions: SessionService,
    private readonly events: EventsService,
  ) {}

  // Explicit, on-demand teardown of a finished demo's AWS resources — the
  // manual counterpart to the TTL cron. Restricted to terminal sessions
  // (completed/failed) so it can't race a phase that's still running, and
  // narrated through the same event pipeline as everything else, so the
  // cleanup streams to the UI live.
  async teardownSession(sessionId: string): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (session.state !== 'completed' && session.state !== 'failed')
      throw new BadRequestException(
        `Only a completed or failed session can be torn down (this one is "${session.state}").`,
      );
    const settings = this.config.getOrThrow<ApplicationConfiguration>('app');
    const phase: Phase = 'fix';
    // Serialize under the session's operation lock so two teardown clicks
    // can't delete the same resources at once (the second caller gets a 409),
    // and the TTL cron — which skips sessions with an active lock via
    // excludeSessionsWithActiveOperation — can't race it either.
    return this.sessions.withOperationLock(sessionId, 'teardown', async () => {
      await this.events
        .emit({
          sessionId,
          phase,
          type: 'action_started',
          action: 'teardown_session',
          explanation: "Tearing down this session's AWS resources on request.",
        })
        .catch(() => undefined);
      if (!settings.awsEnabled) {
        await this.events
          .emit({
            sessionId,
            phase,
            type: 'action_completed',
            action: 'teardown_session',
            explanation:
              'AWS is disabled, so there are no live resources to remove.',
          })
          .catch(() => undefined);
        return session;
      }
      try {
        await this.executor.cleanupSession(sessionId);
        await this.events
          .emit({
            sessionId,
            phase,
            type: 'action_completed',
            action: 'teardown_session',
            explanation:
              'All AWS resources for this session have been removed.',
          })
          .catch(() => undefined);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown cleanup failure';
        this.logger.error(
          `Manual teardown failed for session ${sessionId}: ${message}`,
        );
        await this.events
          .emit({
            sessionId,
            phase,
            type: 'action_failed',
            action: 'teardown_session',
            explanation: `Teardown failed: ${message}`,
          })
          .catch(() => undefined);
        throw new ServiceUnavailableException(`Teardown failed: ${message}`);
      }
      return session;
    });
  }

  @Cron('0 */5 * * * *')
  async removeExpiredResources(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const settings = this.config.getOrThrow<ApplicationConfiguration>('app');
      await this.cleanupExpiredAwsResources(settings);
      await this.expireStaleSessions(settings);
      await this.deleteRetainedSessions(settings);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown cleanup failure';
      this.logger.error(`Resource cleanup failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async cleanupExpiredAwsResources(
    settings: ApplicationConfiguration,
  ): Promise<void> {
    const candidates = await this.executor.discoverExpiredAwsSessions(
      settings.awsResourceTtlMinutes,
    );
    if (!candidates.length) return;
    // Age-based discovery is blind to whether a session is actively
    // running fix/diagnose right now — never tear resources down out from
    // under an in-progress operation. Anything skipped here just gets
    // caught on a later run once its lock clears.
    const safeToClean =
      await this.sessions.excludeSessionsWithActiveOperation(candidates);
    const skipped = candidates.length - safeToClean.length;
    if (skipped)
      this.logger.warn(
        `Skipped AWS cleanup for ${skipped} session(s) still mid-operation; will retry next sweep.`,
      );
    if (!safeToClean.length) return;
    this.logger.warn(
      `Cleaning up AWS resources for ${safeToClean.length} session(s) past the ${settings.awsResourceTtlMinutes}-minute resource TTL.`,
    );
    for (const sessionId of safeToClean) {
      // Best-effort: this sweep is keyed off AWS resource age, not session
      // state, so the session row may already be gone (e.g. retention
      // deletion) by the time we try to narrate it.
      await this.events
        .emit({
          sessionId,
          phase: 'build',
          type: 'action_started',
          action: 'cleanup_expired_resources',
          explanation: `AWS resources tagged for this session exceeded the ${settings.awsResourceTtlMinutes}-minute resource TTL and are being removed.`,
        })
        .catch(() => undefined);
      try {
        await this.executor.cleanupSession(sessionId);
        await this.events
          .emit({
            sessionId,
            phase: 'build',
            type: 'action_completed',
            action: 'cleanup_expired_resources',
            explanation: `AWS resources tagged for this session exceeded the ${settings.awsResourceTtlMinutes}-minute resource TTL and were removed.`,
          })
          .catch(() => undefined);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown cleanup failure';
        this.logger.error(
          `Failed to clean up expired AWS resources for session ${sessionId}: ${message}`,
        );
        await this.events
          .emit({
            sessionId,
            phase: 'build',
            type: 'action_failed',
            action: 'cleanup_expired_resources',
            explanation: `Failed to clean up AWS resources past the resource TTL: ${message}`,
          })
          .catch(() => undefined);
      }
    }
  }

  private async expireStaleSessions(
    settings: ApplicationConfiguration,
  ): Promise<void> {
    const expired = await this.sessions.expireStale(settings.sessionTtlMinutes);
    if (!expired.length) return;
    this.logger.warn(
      `Expired ${expired.length} stale Build. Break. Fix. sessions.`,
    );
    for (const { id, phase } of expired) {
      await this.events
        .emit({
          sessionId: id,
          phase,
          type: 'action_failed',
          explanation: `Session expired after ${settings.sessionTtlMinutes} minutes of inactivity and was marked failed.`,
        })
        .catch(() => undefined);
    }
    if (!settings.awsEnabled) return;
    for (const { id, phase } of expired) {
      await this.cleanupExpiredSessionResources(id, phase);
    }
  }

  private async cleanupExpiredSessionResources(
    sessionId: string,
    phase: Phase,
  ): Promise<void> {
    await this.events
      .emit({
        sessionId,
        phase,
        type: 'action_started',
        action: 'cleanup_expired_session',
        explanation: 'Tearing down AWS resources for the expired session.',
      })
      .catch(() => undefined);
    try {
      await this.executor.cleanupSession(sessionId);
      await this.events
        .emit({
          sessionId,
          phase,
          type: 'action_completed',
          action: 'cleanup_expired_session',
          explanation: 'AWS resources for the expired session were removed.',
        })
        .catch(() => undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown cleanup failure';
      this.logger.error(
        `Failed to clean up AWS resources for expired session ${sessionId}: ${message}`,
      );
      await this.events
        .emit({
          sessionId,
          phase,
          type: 'action_failed',
          action: 'cleanup_expired_session',
          explanation: `Failed to clean up AWS resources for the expired session: ${message}`,
        })
        .catch(() => undefined);
    }
  }

  private async deleteRetainedSessions(
    settings: ApplicationConfiguration,
  ): Promise<void> {
    const deleted = await this.sessions.deleteExpiredSessions(
      settings.sessionRetentionDays,
    );
    if (deleted)
      this.logger.warn(
        `Deleted ${deleted} sessions (and their event logs) past the ${settings.sessionRetentionDays}-day retention window.`,
      );
  }
}
