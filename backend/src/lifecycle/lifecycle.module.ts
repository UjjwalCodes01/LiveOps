import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ExecutorModule } from '../executor/executor.module';
import { SessionModule } from '../sessions/session.module';
import { LifecycleService } from './lifecycle.service';
import { TeardownController } from './teardown.controller';

@Module({
  imports: [ExecutorModule, SessionModule, EventsModule],
  controllers: [TeardownController],
  providers: [LifecycleService],
})
export class LifecycleModule {}
