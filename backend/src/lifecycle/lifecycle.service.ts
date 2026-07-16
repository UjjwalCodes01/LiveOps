import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ApplicationConfiguration } from '../config/configuration';
import { ExecutorService } from '../executor/executor.service';

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);
  private running = false;
  constructor(
    private readonly config: ConfigService,
    private readonly executor: ExecutorService,
  ) {}

  @Cron('0 */5 * * * *')
  async removeExpiredResources(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const settings = this.config.getOrThrow<ApplicationConfiguration>('app');
      const deleted = await this.executor.cleanupExpiredResources(
        settings.awsResourceTtlMinutes,
      );
      if (deleted.length)
        this.logger.warn(
          `Deleted ${deleted.length} expired Build. Break. Fix. load balancers.`,
        );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown cleanup failure';
      this.logger.error(`Resource cleanup failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
