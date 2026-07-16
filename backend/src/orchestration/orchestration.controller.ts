import { Controller, Headers, Param, Post } from '@nestjs/common';
import { SessionService } from '../sessions/session.service';
import { OrchestrationService } from './orchestration.service';

@Controller('sessions/:sessionId')
export class OrchestrationController {
  constructor(
    private readonly orchestration: OrchestrationService,
    private readonly sessions: SessionService,
  ) {}
  @Post('build') async build(
    @Param('sessionId') sessionId: string,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.orchestration.build(sessionId);
  }
  @Post('break') async break(
    @Param('sessionId') sessionId: string,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.orchestration.break(sessionId);
  }
  @Post('diagnose') async diagnose(
    @Param('sessionId') sessionId: string,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.orchestration.diagnose(sessionId);
  }
  @Post('fix') async fix(
    @Param('sessionId') sessionId: string,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.orchestration.fix(sessionId);
  }
}
