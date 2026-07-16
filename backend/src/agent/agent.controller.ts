import { Controller, Param, Post, Body } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { PHASES } from '../events/domain';
import type { Phase } from '../events/domain';
import { AgentService } from './agent.service';

class ExecuteAgentDto {
  @IsIn(PHASES) phase!: Phase;
}

@Controller('sessions/:sessionId/agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}
  @Post('execute') execute(
    @Param('sessionId') sessionId: string,
    @Body() body: ExecuteAgentDto,
  ) {
    return this.agent.execute(sessionId, body.phase);
  }
}
