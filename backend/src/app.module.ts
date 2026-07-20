import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiKeyGuard } from './common/api-key.guard';
import { AgentModule } from './agent/agent.module';
import { DiagnosticsController } from './common/diagnostics.controller';
import { HealthController } from './common/health.controller';
import { StatusController } from './common/status.controller';
import { configuration } from './config/configuration';
import { EventsModule } from './events/events.module';
import { ExecutorModule } from './executor/executor.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { SessionModule } from './sessions/session.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [configuration],
      cache: true,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    AgentModule,
    SessionModule,
    EventsModule,
    ExecutorModule,
    OrchestrationModule,
    LifecycleModule,
  ],
  controllers: [HealthController, DiagnosticsController, StatusController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
