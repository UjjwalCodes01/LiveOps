import { Controller, Param, Post, Body, Headers } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { PHASES } from '../events/domain';
import type { Phase } from '../events/domain';
import { AgentService } from './agent.service';
import { SessionService } from '../sessions/session.service';

class ExecuteAgentDto {
  @IsIn(PHASES) phase!: Phase;
}

@Controller('sessions/:sessionId/agent')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly sessions: SessionService,
  ) {}
  @Post('execute') async execute(
    @Param('sessionId') sessionId: string,
    @Body() body: ExecuteAgentDto,
    @Headers('x-session-token') token?: string,
  ) {
    await this.sessions.authorize(sessionId, token);
    return this.agent.execute(sessionId, body.phase);
  }
}
