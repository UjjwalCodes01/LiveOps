import { Controller, Headers, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SessionService } from '../sessions/session.service';
import { LifecycleService } from './lifecycle.service';

// Lets an authorized client (holding the session's access token) explicitly
// tear down a finished demo's AWS resources instead of waiting for the TTL
// cron. Session-token gated like every other per-session route; the cleanup
// itself streams as narrated events over the same pipeline.
@Controller('sessions')
export class TeardownController {
  constructor(
    private readonly lifecycle: LifecycleService,
    private readonly sessions: SessionService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':sessionId/teardown')
  async teardown(
    @Param('sessionId') sessionId: string,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.lifecycle.teardownSession(sessionId);
  }
}
