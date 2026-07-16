import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AwsAdapter } from './adapters/aws.adapter';
import { ExecutorService } from './executor.service';

@Module({
  imports: [EventsModule],
  providers: [AwsAdapter, ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}
