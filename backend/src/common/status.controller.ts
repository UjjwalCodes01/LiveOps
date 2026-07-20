import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationConfiguration } from '../config/configuration';
import { Public } from './public.decorator';

// Non-sensitive operational metadata for the frontend's live cost/status
// panel: which region, whether real AWS is in play, and the lifecycle TTLs
// that bound cost. Public (@Public) — none of this is a secret (the region
// is already visible in the ALB DNS), and the panel should render without
// friction. `sandbox` is a hardwired invariant: the app verifies its
// credentials belong to the configured sandbox account and refuses any
// other (see AwsAdapter.ensureSandboxAccount), so it only ever operates
// against a sandbox.
@Controller('status')
export class StatusController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @Public()
  status() {
    const settings = this.config.getOrThrow<ApplicationConfiguration>('app');
    return {
      sandbox: true,
      awsEnabled: settings.awsEnabled,
      awsRegion: settings.awsRegion,
      sessionTtlMinutes: settings.sessionTtlMinutes,
      awsResourceTtlMinutes: settings.awsResourceTtlMinutes,
    };
  }
}
