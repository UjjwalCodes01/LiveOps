import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SessionService } from '../sessions/session.service';
import { Public } from './public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @Public()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @Public()
  async ready() {
    try {
      await this.sessions.checkConnection();
    } catch {
      throw new ServiceUnavailableException('Database is not reachable.');
    }
    return { status: 'ready', timestamp: new Date().toISOString() };
  }
}
