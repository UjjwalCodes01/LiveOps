import { Controller, Param, Post } from '@nestjs/common';
import { OrchestrationService } from './orchestration.service';

@Controller('sessions/:sessionId')
export class OrchestrationController {
  constructor(private readonly orchestration: OrchestrationService) {}
  @Post('build') build(@Param('sessionId') sessionId: string) {
    return this.orchestration.build(sessionId);
  }
  @Post('break') break(@Param('sessionId') sessionId: string) {
    return this.orchestration.break(sessionId);
  }
  @Post('diagnose') diagnose(@Param('sessionId') sessionId: string) {
    return this.orchestration.diagnose(sessionId);
  }
  @Post('fix') fix(@Param('sessionId') sessionId: string) {
    return this.orchestration.fix(sessionId);
  }
}
