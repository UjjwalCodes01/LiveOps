import { Controller, Get } from '@nestjs/common';
import { ExecutorService } from '../executor/executor.service';
import { PreflightReport } from '../executor/adapters/aws.adapter';

// Deliberately NOT @Public — unlike the health probes, this reveals AWS
// account/VPC/AMI wiring, so it sits behind the same x-api-key guard as
// every real route. Read-only: it provisions nothing, just reports whether
// a live build would succeed right now. Run it before a demo:
//   curl -H "x-api-key: <key>" https://<host>/api/diagnostics/aws
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly executor: ExecutorService) {}

  @Get('aws')
  async aws(): Promise<PreflightReport> {
    return this.executor.verifyAwsSetup();
  }
}
