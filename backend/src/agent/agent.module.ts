import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ExecutorModule } from '../executor/executor.module';
import { SessionModule } from '../sessions/session.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [SessionModule, ExecutorModule, EventsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
