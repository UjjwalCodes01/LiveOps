import { Module } from '@nestjs/common';
import { ExecutorModule } from '../executor/executor.module';
import { LifecycleService } from './lifecycle.service';

@Module({ imports: [ExecutorModule], providers: [LifecycleService] })
export class LifecycleModule {}
