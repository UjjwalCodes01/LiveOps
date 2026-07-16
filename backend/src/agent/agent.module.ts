import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { SessionModule } from '../sessions/session.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [SessionModule, OrchestrationModule, EventsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
