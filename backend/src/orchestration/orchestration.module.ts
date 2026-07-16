import { Module } from '@nestjs/common';
import { ExecutorModule } from '../executor/executor.module';
import { SessionModule } from '../sessions/session.module';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';

@Module({
  imports: [SessionModule, ExecutorModule],
  controllers: [OrchestrationController],
  providers: [OrchestrationService],
})
export class OrchestrationModule {}
