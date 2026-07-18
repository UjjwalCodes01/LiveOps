import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}
  // Tighter than the global default: every session created is a potential
  // real AWS provisioning attempt once a phase runs, and the API key is a
  // single shared secret shipped to the browser (see the frontend build
  // plan) — this bounds the blast radius of that key leaking, on top of
  // the existing per-session-token isolation.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post()
  async create() {
    return this.sessions.create();
  }
  @Get(':sessionId') async get(
    @Param('sessionId') sessionId: string,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.sessions.get(sessionId);
  }
  @Get(':sessionId/events') async events(
    @Param('sessionId') sessionId: string,
    @Query('since') since?: string,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.sessions.eventsSince(sessionId, since);
  }
}
