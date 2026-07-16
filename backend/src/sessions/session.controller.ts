import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}
  @Post() async create() {
    return this.sessions.create();
  }
  @Get(':sessionId') async get(@Param('sessionId') sessionId: string) {
    return this.sessions.get(sessionId);
  }
  @Get(':sessionId/events') async events(
    @Param('sessionId') sessionId: string,
    @Query('since') since?: string,
  ) {
    return this.sessions.eventsSince(sessionId, since);
  }
}
