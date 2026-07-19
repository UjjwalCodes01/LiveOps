import {
  CreateLoadBalancerCommand,
  CreateListenerCommand,
  CreateTargetGroupCommand,
  DeleteTargetGroupCommand,
  DeleteLoadBalancerCommand,
  DeregisterTargetsCommand,
  DescribeLoadBalancersCommand,
  DescribeTagsCommand,
  DescribeTargetHealthCommand,
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client,
  RegisterTargetsCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  _InstanceType,
  RunInstancesCommand,
  TerminateInstancesCommand,
  waitUntilInstanceRunning,
} from '@aws-sdk/client-ec2';
import {
  waitUntilLoadBalancersDeleted,
  waitUntilTargetInService,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ApplicationConfiguration } from '../../config/configuration';
import { ActionName } from '../actions';

export type ProgressReporter = (
  action: string,
  type: 'action_started' | 'action_completed',
  command: string,
  explanation: string,
  result?: Record<string, unknown>,
) => Promise<void>;

export interface PreflightCheck {
  // Stable machine key, e.g. 'credentials', 'vpc', 'ami'.
  key: string;
  label: string;
  status: 'ok' | 'failed' | 'skipped';
  detail: string;
}

export interface PreflightReport {
  // True only if every non-skipped check passed — i.e. a live build should
  // actually succeed against this environment right now.
  ready: boolean;
  region: string;
  checks: PreflightCheck[];
}

@Injectable()
export class AwsAdapter {
  private readonly client: ElasticLoadBalancingV2Client;
  private readonly ec2: EC2Client;
  private readonly sts: STSClient;
  private sandboxAccountVerified = false;
  constructor(private readonly config: ConfigService) {
    this.client = new ElasticLoadBalancingV2Client({
      region: this.settings.awsRegion,
    });
    this.ec2 = new EC2Client({ region: this.settings.awsRegion });
    this.sts = new STSClient({ region: this.settings.awsRegion });
  }

  async run(
    action: ActionName,
    sessionId: string,
    report?: ProgressReporter,
  ): Promise<Record<string, unknown>> {
    this.requireEnabled();
    await this.ensureSandboxAccount();
    switch (action) {
      case 'inspect_load_balancers':
        return this.inspect(sessionId);
      case 'provision_load_balancer':
        return this.provision(sessionId, report);
      case 'inject_target_failure':
        return this.updateTarget(sessionId, false);
      case 'diagnose_target_health':
        return this.diagnose(sessionId);
      case 'restore_target':
        return this.updateTarget(sessionId, true);
    }
  }

  // Pre-flight: verify, without provisioning anything, that a live build
  // would actually succeed against this environment right now — creds,
  // sandbox account, VPC, subnets, security group, and AMI all present and
  // consistent. This is the single most valuable de-risking step before a
  // live demo: it turns "the build mysteriously timed out in front of
  // judges" into "check #4 says subnet-abc isn't in the VPC" up front.
  // Every check is isolated: one failure is reported, never thrown, so the
  // report always covers all of them.
  async verifySetup(): Promise<PreflightReport> {
    const checks: PreflightCheck[] = [];
    const s = this.settings;

    checks.push({
      key: 'enabled',
      label: 'AWS execution enabled',
      status: s.awsEnabled ? 'ok' : 'failed',
      detail: s.awsEnabled
        ? 'AWS_ENABLED=true — live provisioning is on.'
        : 'AWS_ENABLED is not true, so live builds are disabled. Set it to true in the demo account.',
    });

    const missing = [
      !s.awsAccountId && 'AWS_ACCOUNT_ID',
      !s.awsVpcId && 'AWS_VPC_ID',
      s.awsVpcSubnets.length < 2 && 'AWS_VPC_SUBNET_IDS (need ≥2)',
      !s.awsSecurityGroupId && 'AWS_SECURITY_GROUP_ID',
      !s.awsAmiId && 'AWS_EC2_AMI_ID',
    ].filter((value): value is string => typeof value === 'string');
    checks.push({
      key: 'config',
      label: 'Required configuration present',
      status: missing.length ? 'failed' : 'ok',
      detail: missing.length
        ? `Missing/invalid: ${missing.join(', ')}.`
        : 'All required AWS environment variables are set.',
    });

    // Credentials + correct sandbox account. If this fails, every AWS call
    // below would fail the same way, so skip them and say so rather than
    // emit a wall of identical credential errors.
    let credentialsOk = false;
    try {
      const identity = await this.sts.send(new GetCallerIdentityCommand({}));
      if (s.awsAccountId && identity.Account !== s.awsAccountId) {
        checks.push({
          key: 'credentials',
          label: 'Credentials & sandbox account',
          status: 'failed',
          detail: `Credentials resolve to account ${identity.Account ?? 'unknown'}, not the configured sandbox account ${s.awsAccountId}. Refusing to touch the wrong account.`,
        });
      } else {
        credentialsOk = true;
        checks.push({
          key: 'credentials',
          label: 'Credentials & sandbox account',
          status: 'ok',
          detail: `Authenticated as account ${identity.Account ?? 'unknown'} in ${s.awsRegion}.`,
        });
      }
    } catch (error) {
      checks.push({
        key: 'credentials',
        label: 'Credentials & sandbox account',
        status: 'failed',
        detail: `Could not authenticate to AWS: ${this.errorMessage(error)}. On a non-AWS host (Render, local) this usually means AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are unset.`,
      });
    }

    const skipRest = (key: string, label: string): PreflightCheck => ({
      key,
      label,
      status: 'skipped',
      detail: 'Skipped — fix the credentials check first.',
    });

    // VPC
    if (!credentialsOk || !s.awsVpcId) {
      checks.push(skipRest('vpc', 'VPC exists'));
    } else {
      try {
        const vpcs = await this.ec2.send(
          new DescribeVpcsCommand({ VpcIds: [s.awsVpcId] }),
        );
        const found = vpcs.Vpcs?.length === 1;
        checks.push({
          key: 'vpc',
          label: 'VPC exists',
          status: found ? 'ok' : 'failed',
          detail: found
            ? `VPC ${s.awsVpcId} found.`
            : `VPC ${s.awsVpcId} not found in ${s.awsRegion}.`,
        });
      } catch (error) {
        checks.push({
          key: 'vpc',
          label: 'VPC exists',
          status: 'failed',
          detail: `Could not describe VPC ${s.awsVpcId}: ${this.errorMessage(error)}.`,
        });
      }
    }

    // Subnets — exist, count ≥2, all in the configured VPC
    if (!credentialsOk || s.awsVpcSubnets.length < 2) {
      checks.push(skipRest('subnets', 'Subnets valid'));
    } else {
      try {
        const subnets = await this.ec2.send(
          new DescribeSubnetsCommand({ SubnetIds: s.awsVpcSubnets }),
        );
        const found = subnets.Subnets ?? [];
        const wrongVpc = found.filter((subnet) => subnet.VpcId !== s.awsVpcId);
        const ok = found.length === s.awsVpcSubnets.length && !wrongVpc.length;
        checks.push({
          key: 'subnets',
          label: 'Subnets valid',
          status: ok ? 'ok' : 'failed',
          detail: ok
            ? `${found.length} subnets found, all in ${s.awsVpcId}.`
            : wrongVpc.length
              ? `Subnet(s) not in the configured VPC: ${wrongVpc.map((subnet) => subnet.SubnetId).join(', ')}.`
              : `Expected ${s.awsVpcSubnets.length} subnets, found ${found.length}.`,
        });
      } catch (error) {
        checks.push({
          key: 'subnets',
          label: 'Subnets valid',
          status: 'failed',
          detail: `Could not describe subnets: ${this.errorMessage(error)}.`,
        });
      }
    }

    // Security group — exists and is in the configured VPC
    if (!credentialsOk || !s.awsSecurityGroupId) {
      checks.push(skipRest('security_group', 'Security group valid'));
    } else {
      try {
        const groups = await this.ec2.send(
          new DescribeSecurityGroupsCommand({
            GroupIds: [s.awsSecurityGroupId],
          }),
        );
        const group = groups.SecurityGroups?.[0];
        const ok = !!group && group.VpcId === s.awsVpcId;
        checks.push({
          key: 'security_group',
          label: 'Security group valid',
          status: ok ? 'ok' : 'failed',
          detail: ok
            ? `Security group ${s.awsSecurityGroupId} found in ${s.awsVpcId}.`
            : group
              ? `Security group ${s.awsSecurityGroupId} is in VPC ${group.VpcId}, not ${s.awsVpcId}.`
              : `Security group ${s.awsSecurityGroupId} not found.`,
        });
      } catch (error) {
        checks.push({
          key: 'security_group',
          label: 'Security group valid',
          status: 'failed',
          detail: `Could not describe security group ${s.awsSecurityGroupId}: ${this.errorMessage(error)}.`,
        });
      }
    }

    // AMI — exists and is available to launch
    if (!credentialsOk || !s.awsAmiId) {
      checks.push(skipRest('ami', 'AMI available'));
    } else {
      try {
        const images = await this.ec2.send(
          new DescribeImagesCommand({ ImageIds: [s.awsAmiId] }),
        );
        const image = images.Images?.[0];
        const ok = !!image && image.State === 'available';
        checks.push({
          key: 'ami',
          label: 'AMI available',
          status: ok ? 'ok' : 'failed',
          detail: ok
            ? `AMI ${s.awsAmiId} is available.`
            : image
              ? `AMI ${s.awsAmiId} state is "${image.State}", not "available".`
              : `AMI ${s.awsAmiId} not found in ${s.awsRegion} (is it region-specific?).`,
        });
      } catch (error) {
        checks.push({
          key: 'ami',
          label: 'AMI available',
          status: 'failed',
          detail: `Could not describe AMI ${s.awsAmiId}: ${this.errorMessage(error)}.`,
        });
      }
    }

    return {
      ready: checks.every((check) => check.status !== 'failed'),
      region: s.awsRegion,
      checks,
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async teardown(loadBalancerArn: string): Promise<void> {
    this.requireEnabled();
    await this.ensureSandboxAccount();
    await this.deleteLoadBalancerAndWait(loadBalancerArn);
  }

  // Pure discovery — deliberately does NOT tear anything down itself.
  // Whether a discovered session is actually safe to clean up depends on
  // session_operations (a Postgres concept this AWS-only adapter has no
  // access to), so that decision belongs to the caller — see
  // LifecycleService.cleanupExpiredAwsResources, which filters this list
  // against active operation locks before calling cleanupSession() on
  // whatever survives.
  async discoverExpiredSessions(maxAgeMinutes: number): Promise<string[]> {
    if (!this.settings.awsEnabled) return [];
    await this.ensureSandboxAccount();
    const cutoff = Date.now() - maxAgeMinutes * 60_000;
    const expiredSessionIds = new Set<string>();
    const instances = await this.ec2.send(
      new DescribeInstancesCommand({
        Filters: [
          { Name: 'tag:project', Values: ['bbf-demo'] },
          {
            Name: 'instance-state-name',
            Values: ['pending', 'running', 'stopping', 'stopped'],
          },
        ],
      }),
    );
    for (const instance of instances.Reservations?.flatMap(
      (reservation) => reservation.Instances ?? [],
    ) ?? []) {
      const sessionId = instance.Tags?.find(
        (tag) => tag.Key === 'session_id',
      )?.Value;
      if (
        sessionId &&
        instance.LaunchTime &&
        instance.LaunchTime.getTime() <= cutoff
      )
        expiredSessionIds.add(sessionId);
    }
    const targetGroups = await this.client.send(
      new DescribeTargetGroupsCommand({}),
    );
    for (const targetGroup of targetGroups.TargetGroups ?? []) {
      if (!targetGroup.TargetGroupArn) continue;
      const tags = await this.client.send(
        new DescribeTagsCommand({
          ResourceArns: [targetGroup.TargetGroupArn],
        }),
      );
      const resourceTags = tags.TagDescriptions?.[0]?.Tags ?? [];
      if (
        !resourceTags.some(
          (tag) => tag.Key === 'project' && tag.Value === 'bbf-demo',
        )
      )
        continue;
      const sessionId = resourceTags.find(
        (tag) => tag.Key === 'session_id',
      )?.Value;
      const expiresAt = resourceTags.find(
        (tag) => tag.Key === 'expires_at',
      )?.Value;
      if (sessionId && expiresAt && Date.parse(expiresAt) <= Date.now())
        expiredSessionIds.add(sessionId);
    }
    const response = await this.client.send(
      new DescribeLoadBalancersCommand({}),
    );
    for (const loadBalancer of response.LoadBalancers ?? []) {
      if (
        !loadBalancer.LoadBalancerArn ||
        !loadBalancer.CreatedTime ||
        loadBalancer.CreatedTime.getTime() > cutoff
      )
        continue;
      const tags = await this.client.send(
        new DescribeTagsCommand({
          ResourceArns: [loadBalancer.LoadBalancerArn],
        }),
      );
      const resourceTags = tags.TagDescriptions?.[0]?.Tags ?? [];
      const isDemoResource = resourceTags.some(
        (tag) => tag.Key === 'project' && tag.Value === 'bbf-demo',
      );
      const sessionId = resourceTags.find(
        (tag) => tag.Key === 'session_id',
      )?.Value;
      if (!isDemoResource || !sessionId) continue;
      expiredSessionIds.add(sessionId);
    }
    // Snapshot only after every discovery path (instances, target groups,
    // load balancers) has had a chance to add to the set — taking it any
    // earlier silently drops ALB-only expirations from the returned list.
    return [...expiredSessionIds];
  }

  async cleanupSession(sessionId: string): Promise<void> {
    this.requireEnabled();
    await this.ensureSandboxAccount();
    const loadBalancers = await this.client.send(
      new DescribeLoadBalancersCommand({}),
    );
    for (const loadBalancer of loadBalancers.LoadBalancers ?? []) {
      if (!loadBalancer.LoadBalancerArn) continue;
      const tags = await this.client.send(
        new DescribeTagsCommand({
          ResourceArns: [loadBalancer.LoadBalancerArn],
        }),
      );
      if (
        (tags.TagDescriptions?.[0]?.Tags ?? []).some(
          (tag) => tag.Key === 'session_id' && tag.Value === sessionId,
        )
      )
        await this.deleteLoadBalancerAndWait(loadBalancer.LoadBalancerArn);
    }
    const targetGroups = await this.client.send(
      new DescribeTargetGroupsCommand({}),
    );
    for (const targetGroup of targetGroups.TargetGroups ?? []) {
      if (!targetGroup.TargetGroupArn) continue;
      const tags = await this.client.send(
        new DescribeTagsCommand({ ResourceArns: [targetGroup.TargetGroupArn] }),
      );
      if (
        (tags.TagDescriptions?.[0]?.Tags ?? []).some(
          (tag) => tag.Key === 'session_id' && tag.Value === sessionId,
        )
      )
        await this.client.send(
          new DeleteTargetGroupCommand({
            TargetGroupArn: targetGroup.TargetGroupArn,
          }),
        );
    }
    const instances = await this.ec2.send(
      new DescribeInstancesCommand({
        Filters: [
          { Name: 'tag:session_id', Values: [sessionId] },
          { Name: 'tag:project', Values: ['bbf-demo'] },
          {
            Name: 'instance-state-name',
            Values: ['pending', 'running', 'stopping', 'stopped'],
          },
        ],
      }),
    );
    const instanceIds =
      instances.Reservations?.flatMap(
        (reservation) => reservation.Instances ?? [],
      ).flatMap((instance) =>
        instance.InstanceId ? [instance.InstanceId] : [],
      ) ?? [];
    if (instanceIds.length)
      await this.ec2.send(
        new TerminateInstancesCommand({ InstanceIds: instanceIds }),
      );
  }

  async inspectSessionResources(sessionId: string): Promise<{
    loadBalancerArns: string[];
    targetGroupArns: string[];
    activeInstanceIds: string[];
  }> {
    this.requireEnabled();
    await this.ensureSandboxAccount();
    const [loadBalancers, targetGroups, instances] = await Promise.all([
      this.client.send(new DescribeLoadBalancersCommand({})),
      this.client.send(new DescribeTargetGroupsCommand({})),
      this.ec2.send(
        new DescribeInstancesCommand({
          Filters: [
            { Name: 'tag:session_id', Values: [sessionId] },
            { Name: 'tag:project', Values: ['bbf-demo'] },
            {
              Name: 'instance-state-name',
              Values: ['pending', 'running', 'stopping', 'stopped'],
            },
          ],
        }),
      ),
    ]);
    const matchingLoadBalancers = await this.resourcesForSession(
      loadBalancers.LoadBalancers?.flatMap((resource) =>
        resource.LoadBalancerArn ? [resource.LoadBalancerArn] : [],
      ) ?? [],
      sessionId,
    );
    const matchingTargetGroups = await this.resourcesForSession(
      targetGroups.TargetGroups?.flatMap((resource) =>
        resource.TargetGroupArn ? [resource.TargetGroupArn] : [],
      ) ?? [],
      sessionId,
    );
    return {
      loadBalancerArns: matchingLoadBalancers,
      targetGroupArns: matchingTargetGroups,
      activeInstanceIds:
        instances.Reservations?.flatMap(
          (reservation) => reservation.Instances ?? [],
        ).flatMap((instance) =>
          instance.InstanceId ? [instance.InstanceId] : [],
        ) ?? [],
    };
  }

  private get settings(): ApplicationConfiguration {
    return this.config.getOrThrow<ApplicationConfiguration>('app');
  }

  private async resourcesForSession(
    arns: string[],
    sessionId: string,
  ): Promise<string[]> {
    const matching: string[] = [];
    for (const arn of arns) {
      const tags = await this.client.send(
        new DescribeTagsCommand({ ResourceArns: [arn] }),
      );
      if (
        (tags.TagDescriptions?.[0]?.Tags ?? []).some(
          (tag) => tag.Key === 'session_id' && tag.Value === sessionId,
        )
      )
        matching.push(arn);
    }
    return matching;
  }

  private async ensureSandboxAccount(): Promise<void> {
    if (this.sandboxAccountVerified) return;
    const settings = this.settings;
    if (!settings.awsAccountId || !settings.awsVpcId)
      throw new ServiceUnavailableException(
        'AWS_ACCOUNT_ID and AWS_VPC_ID are required for sandbox validation.',
      );
    const identity = await this.sts.send(new GetCallerIdentityCommand({}));
    if (identity.Account !== settings.awsAccountId)
      throw new ServiceUnavailableException(
        'AWS credentials do not belong to the configured sandbox account.',
      );
    this.sandboxAccountVerified = true;
  }
  private requireEnabled(): void {
    if (!this.settings.awsEnabled)
      throw new ServiceUnavailableException(
        'AWS execution is disabled. Set AWS_ENABLED=true only in the dedicated demo account.',
      );
  }

  // EC2 launches never carry any startup instructions of their own — this
  // is the only bootstrap a target instance gets. It has to make the
  // configured AMI answer the target group's HTTP health check
  // (AWS_TARGET_HEALTH_PATH on AWS_TARGET_PORT), or waitUntilTargetInService
  // in provision() below just times out after 5 minutes with a stock AMI.
  // Assumes an Amazon Linux 2023 (or comparably systemd + python3) base
  // image, which is what the setup docs recommend for AWS_EC2_AMI_ID.
  private healthCheckUserData(): string {
    // Must resolve to exactly the same path CreateTargetGroupCommand's
    // HealthCheckPath checks below (this.settings.awsTargetHealthPath,
    // unmodified) — any independent fallback here (there used to be one:
    // defaulting to the literal string 'health' regardless of what was
    // actually configured) can silently diverge from what the ALB is
    // really requesting. A trailing slash also used to break this outright:
    // `echo ok > ".../health/"` fails against a path ending in `/`, and
    // `set -e` aborts the whole boot script, so every target would fail
    // its health check and the build would time out.
    const relativePath = this.settings.awsTargetHealthPath
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
    const path = relativePath === '' ? 'index.html' : relativePath;
    const port = this.settings.awsTargetPort;
    const script = `#!/bin/bash
set -e
mkdir -p "/var/www/$(dirname "${path}")"
echo ok > "/var/www/${path}"
cat <<'UNIT' > /etc/systemd/system/bbf-health.service
[Unit]
Description=Build.Break.Fix health check server
After=network.target

[Service]
WorkingDirectory=/var/www
ExecStart=/usr/bin/python3 -m http.server ${port}
Restart=always
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now bbf-health.service
`;
    return Buffer.from(script).toString('base64');
  }

  // The AWS SDK already retries throttling internally, but silently — the
  // student watching the event stream sees nothing until either success or
  // an outright failure. This adds a further, *observable* retry layer on
  // top for the build phase specifically, narrating each backoff instead of
  // letting a throttled request look like a stall or a hang.
  private isThrottlingError(error: unknown): boolean {
    const name =
      error && typeof error === 'object' && 'name' in error
        ? String(error.name)
        : '';
    return [
      'ThrottlingException',
      'Throttling',
      'RequestLimitExceeded',
      'TooManyRequestsException',
      'RequestThrottledException',
    ].includes(name);
  }
  private async withThrottleNarration<T>(
    operation: () => Promise<T>,
    describe: string,
    report: ProgressReporter | undefined,
    maxAttempts = 4,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isThrottlingError(error) || attempt >= maxAttempts - 1)
          throw error;
        const delayMs = 1_000 * 2 ** attempt;
        await report?.(
          'aws_throttled',
          'action_started',
          describe,
          `AWS is throttling requests; retrying ${describe} in ${delayMs} ms (attempt ${attempt + 2}/${maxAttempts}).`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  private async target(sessionId: string) {
    const groups = await this.client.send(new DescribeTargetGroupsCommand({}));
    for (const group of groups.TargetGroups ?? []) {
      if (!group.TargetGroupArn) continue;
      const tags = await this.client.send(
        new DescribeTagsCommand({ ResourceArns: [group.TargetGroupArn] }),
      );
      if (
        !(tags.TagDescriptions?.[0]?.Tags ?? []).some(
          (tag) => tag.Key === 'session_id' && tag.Value === sessionId,
        )
      )
        continue;
      const instances = await this.ec2.send(
        new DescribeInstancesCommand({
          Filters: [
            { Name: 'tag:session_id', Values: [sessionId] },
            { Name: 'tag:project', Values: ['bbf-demo'] },
            { Name: 'instance-state-name', Values: ['pending', 'running'] },
          ],
        }),
      );
      const targets =
        instances.Reservations?.flatMap(
          (reservation) => reservation.Instances ?? [],
        ).flatMap((instance) =>
          instance.InstanceId
            ? [{ Id: instance.InstanceId, Port: this.settings.awsTargetPort }]
            : [],
        ) ?? [];
      if (targets.length)
        return { TargetGroupArn: group.TargetGroupArn, Targets: targets };
    }
    throw new BadRequestException(
      `No tagged target group and instances were found for session ${sessionId}.`,
    );
  }
  private async inspect(sessionId: string): Promise<Record<string, unknown>> {
    const response = await this.client.send(
      new DescribeLoadBalancersCommand({}),
    );
    const loadBalancers = response.LoadBalancers ?? [];
    const taggedLoadBalancers = await Promise.all(
      loadBalancers.map(async (loadBalancer) => {
        if (!loadBalancer.LoadBalancerArn) return undefined;
        const tags = await this.client.send(
          new DescribeTagsCommand({
            ResourceArns: [loadBalancer.LoadBalancerArn],
          }),
        );
        const resourceTags = tags.TagDescriptions?.[0]?.Tags ?? [];
        const belongsToSession = resourceTags.some(
          (tag) => tag.Key === 'session_id' && tag.Value === sessionId,
        );
        return belongsToSession
          ? {
              arn: loadBalancer.LoadBalancerArn,
              name: loadBalancer.LoadBalancerName,
              dnsName: loadBalancer.DNSName,
              state: loadBalancer.State?.Code,
            }
          : undefined;
      }),
    );
    return { loadBalancers: taggedLoadBalancers.filter(Boolean) };
  }
  private async provision(
    sessionId: string,
    report?: ProgressReporter,
  ): Promise<Record<string, unknown>> {
    const { awsVpcSubnets, awsSecurityGroupId, awsAmiId, awsInstanceType } =
      this.settings;
    if (awsVpcSubnets.length < 2 || !awsSecurityGroupId || !awsAmiId)
      throw new BadRequestException(
        'AWS_VPC_SUBNET_IDS, AWS_SECURITY_GROUP_ID, and AWS_EC2_AMI_ID are required to provision the load-balancing lesson.',
      );
    const subnetValidation = await this.ec2.send(
      new DescribeSubnetsCommand({ SubnetIds: awsVpcSubnets }),
    );
    const vpcIds = new Set(
      subnetValidation.Subnets?.map((subnet) => subnet.VpcId).filter(Boolean),
    );
    if (vpcIds.size !== 1 || !vpcIds.has(this.settings.awsVpcId))
      throw new BadRequestException(
        'All configured subnets must belong to the configured sandbox VPC.',
      );
    const suffix = createHash('sha256')
      .update(sessionId)
      .digest('hex')
      .slice(0, 10);
    const expiresAt = new Date(
      Date.now() + this.settings.awsResourceTtlMinutes * 60_000,
    ).toISOString();
    let instanceIds: string[] = [];
    let targetGroupArn: string | undefined;
    let loadBalancerArn: string | undefined;
    try {
      await report?.(
        'create_ec2_targets',
        'action_started',
        'AWS SDK EC2: RunInstances',
        'Creating three EC2 targets across the configured subnets.',
      );
      const instanceResponses = await Promise.all(
        Array.from({ length: 3 }, (_, index) =>
          this.withThrottleNarration(
            () =>
              this.ec2.send(
                new RunInstancesCommand({
                  ImageId: awsAmiId,
                  InstanceType: awsInstanceType as _InstanceType,
                  MinCount: 1,
                  MaxCount: 1,
                  SubnetId: awsVpcSubnets[index % awsVpcSubnets.length],
                  SecurityGroupIds: [awsSecurityGroupId],
                  UserData: this.healthCheckUserData(),
                  TagSpecifications: [
                    {
                      ResourceType: 'instance',
                      Tags: [
                        { Key: 'project', Value: 'bbf-demo' },
                        { Key: 'session_id', Value: sessionId },
                        { Key: 'managed_by', Value: 'build-break-fix' },
                        { Key: 'expires_at', Value: expiresAt },
                      ],
                    },
                  ],
                }),
              ),
            'AWS SDK EC2: RunInstances',
            report,
          ),
        ),
      );
      instanceIds = instanceResponses.flatMap(
        (instances) =>
          instances.Instances?.flatMap((instance) =>
            instance.InstanceId ? [instance.InstanceId] : [],
          ) ?? [],
      );
      if (instanceIds.length !== 3)
        throw new ServiceUnavailableException(
          'AWS did not create all three target instances.',
        );
      await report?.(
        'create_ec2_targets',
        'action_completed',
        'AWS SDK EC2: RunInstances',
        'Created three EC2 targets.',
        { instanceIds },
      );
      const subnet = await this.ec2.send(
        new DescribeSubnetsCommand({ SubnetIds: [awsVpcSubnets[0]] }),
      );
      const vpcId = subnet.Subnets?.[0]?.VpcId;
      if (!vpcId)
        throw new ServiceUnavailableException(
          'AWS did not return a VPC for the configured subnet.',
        );
      await report?.(
        'create_target_group',
        'action_started',
        'AWS SDK ELBv2: CreateTargetGroup',
        'Creating the HTTP target group.',
      );
      const targetGroup = await this.withThrottleNarration(
        () =>
          this.client.send(
            new CreateTargetGroupCommand({
              Name: `bbf-tg-${suffix}`,
              Protocol: 'HTTP',
              Port: this.settings.awsTargetPort,
              VpcId: vpcId,
              TargetType: 'instance',
              HealthCheckProtocol: 'HTTP',
              HealthCheckPath: this.settings.awsTargetHealthPath,
              Tags: [
                { Key: 'project', Value: 'bbf-demo' },
                { Key: 'session_id', Value: sessionId },
                { Key: 'managed_by', Value: 'build-break-fix' },
                { Key: 'expires_at', Value: expiresAt },
              ],
            }),
          ),
        'AWS SDK ELBv2: CreateTargetGroup',
        report,
      );
      targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;
      if (!targetGroupArn)
        throw new ServiceUnavailableException(
          'AWS did not return a target group ARN.',
        );
      await report?.(
        'create_target_group',
        'action_completed',
        'AWS SDK ELBv2: CreateTargetGroup',
        'Created the target group.',
      );
      await report?.(
        'create_application_load_balancer',
        'action_started',
        'AWS SDK ELBv2: CreateLoadBalancer',
        'Creating the Application Load Balancer.',
      );
      const response = await this.withThrottleNarration(
        () =>
          this.client.send(
            new CreateLoadBalancerCommand({
              Name: `bbf-${suffix}`,
              Type: 'application',
              Scheme: 'internet-facing',
              IpAddressType: 'ipv4',
              Subnets: awsVpcSubnets,
              SecurityGroups: [awsSecurityGroupId],
              Tags: [
                { Key: 'project', Value: 'bbf-demo' },
                { Key: 'session_id', Value: sessionId },
                { Key: 'managed_by', Value: 'build-break-fix' },
                { Key: 'expires_at', Value: expiresAt },
              ],
            }),
          ),
        'AWS SDK ELBv2: CreateLoadBalancer',
        report,
      );
      const loadBalancer = response.LoadBalancers?.[0];
      if (!loadBalancer?.LoadBalancerArn)
        throw new ServiceUnavailableException(
          'AWS did not return an Application Load Balancer ARN.',
        );
      loadBalancerArn = loadBalancer.LoadBalancerArn;
      await report?.(
        'create_application_load_balancer',
        'action_completed',
        'AWS SDK ELBv2: CreateLoadBalancer',
        'Created the Application Load Balancer.',
        { dnsName: loadBalancer.DNSName ?? '' },
      );
      await report?.(
        'wait_for_ec2_targets',
        'action_started',
        'AWS SDK EC2 waiter: waitUntilInstanceRunning',
        'Waiting for all EC2 targets to enter the running state.',
      );
      await waitUntilInstanceRunning(
        { client: this.ec2, maxWaitTime: 300 },
        { InstanceIds: instanceIds },
      );
      await report?.(
        'wait_for_ec2_targets',
        'action_completed',
        'AWS SDK EC2 waiter: waitUntilInstanceRunning',
        'All EC2 targets are running.',
      );
      await report?.(
        'register_targets',
        'action_started',
        'AWS SDK ELBv2: RegisterTargets',
        'Registering the EC2 targets with the target group.',
      );
      await this.withThrottleNarration(
        () =>
          this.client.send(
            new RegisterTargetsCommand({
              TargetGroupArn: targetGroupArn,
              Targets: instanceIds.map((Id) => ({
                Id,
                Port: this.settings.awsTargetPort,
              })),
            }),
          ),
        'AWS SDK ELBv2: RegisterTargets',
        report,
      );
      await report?.(
        'register_targets',
        'action_completed',
        'AWS SDK ELBv2: RegisterTargets',
        'Registered the EC2 targets.',
      );
      await report?.(
        'create_listener',
        'action_started',
        'AWS SDK ELBv2: CreateListener',
        'Creating the HTTP listener that forwards traffic to the target group.',
      );
      await this.withThrottleNarration(
        () =>
          this.client.send(
            new CreateListenerCommand({
              LoadBalancerArn: loadBalancer.LoadBalancerArn,
              Protocol: 'HTTP',
              Port: 80,
              DefaultActions: [
                { Type: 'forward', TargetGroupArn: targetGroupArn },
              ],
            }),
          ),
        'AWS SDK ELBv2: CreateListener',
        report,
      );
      await report?.(
        'create_listener',
        'action_completed',
        'AWS SDK ELBv2: CreateListener',
        'Created the HTTP listener.',
      );
      await report?.(
        'wait_for_target_health',
        'action_started',
        'AWS SDK ELBv2 waiter: waitUntilTargetInService',
        'Waiting for all registered targets to pass health checks.',
      );
      await waitUntilTargetInService(
        { client: this.client, maxWaitTime: 300 },
        {
          TargetGroupArn: targetGroupArn,
          Targets: instanceIds.map((Id) => ({
            Id,
            Port: this.settings.awsTargetPort,
          })),
        },
      );
      await report?.(
        'wait_for_target_health',
        'action_completed',
        'AWS SDK ELBv2 waiter: waitUntilTargetInService',
        'All targets are healthy and receiving traffic.',
      );
      return {
        loadBalancerArn: loadBalancer.LoadBalancerArn,
        dnsName: loadBalancer.DNSName,
        state: loadBalancer.State?.Code,
        targetGroupArn,
        instanceIds,
      };
    } catch (error) {
      await this.rollback(loadBalancerArn, targetGroupArn, instanceIds);
      throw error;
    }
  }

  private async rollback(
    loadBalancerArn: string | undefined,
    targetGroupArn: string | undefined,
    instanceIds: string[],
  ): Promise<void> {
    if (loadBalancerArn)
      await this.deleteLoadBalancerAndWait(loadBalancerArn).catch(
        () => undefined,
      );
    if (targetGroupArn)
      await this.client
        .send(new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }))
        .catch(() => undefined);
    if (instanceIds.length)
      await this.ec2
        .send(new TerminateInstancesCommand({ InstanceIds: instanceIds }))
        .catch(() => undefined);
  }

  private async deleteLoadBalancerAndWait(
    loadBalancerArn: string,
  ): Promise<void> {
    await this.client.send(
      new DeleteLoadBalancerCommand({ LoadBalancerArn: loadBalancerArn }),
    );
    await waitUntilLoadBalancersDeleted(
      { client: this.client, maxWaitTime: 300 },
      { LoadBalancerArns: [loadBalancerArn] },
    );
  }

  private async updateTarget(
    sessionId: string,
    register: boolean,
  ): Promise<Record<string, unknown>> {
    const target = await this.target(sessionId);
    const health = await this.client.send(
      new DescribeTargetHealthCommand(target),
    );
    const selected = this.selectTarget(
      target.Targets,
      health.TargetHealthDescriptions ?? [],
      register,
    );
    if (!selected.Id)
      throw new ServiceUnavailableException(
        'Selected target has no instance ID.',
      );
    const selectedTarget = {
      TargetGroupArn: target.TargetGroupArn,
      Targets: [{ Id: selected.Id, Port: selected.Port }],
    };
    if (register)
      await this.client.send(new RegisterTargetsCommand(selectedTarget));
    else await this.client.send(new DeregisterTargetsCommand(selectedTarget));
    return {
      targetId: selected.Id,
      state: register ? 'registered' : 'deregistered',
    };
  }

  private selectTarget(
    targets: { Id?: string; Port?: number }[],
    health: { Target?: { Id?: string }; TargetHealth?: { State?: string } }[],
    register: boolean,
  ): { Id?: string; Port?: number } {
    const states = new Map(
      health.map((description) => [
        description.Target?.Id,
        description.TargetHealth?.State,
      ]),
    );
    const sortedTargets = [...targets].sort((left, right) =>
      (left.Id ?? '').localeCompare(right.Id ?? ''),
    );
    const selected = register
      ? sortedTargets.find((target) => states.get(target.Id) !== 'healthy')
      : sortedTargets.find((target) => states.get(target.Id) === 'healthy');
    if (!selected)
      throw new BadRequestException(
        register
          ? 'No failed target is available to restore.'
          : 'No healthy target is available to fail.',
      );
    return selected;
  }
  private async diagnose(sessionId: string): Promise<Record<string, unknown>> {
    const target = await this.target(sessionId);
    const response = await this.client.send(
      new DescribeTargetHealthCommand(target),
    );
    return {
      targetHealth:
        response.TargetHealthDescriptions?.map((entry) => ({
          targetId: entry.Target?.Id,
          state: entry.TargetHealth?.State,
          reason: entry.TargetHealth?.Reason,
          description: entry.TargetHealth?.Description,
        })) ?? [],
    };
  }
}
