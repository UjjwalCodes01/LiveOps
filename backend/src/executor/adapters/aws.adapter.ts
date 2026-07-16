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
  DescribeInstancesCommand,
  DescribeSubnetsCommand,
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
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ApplicationConfiguration } from '../../config/configuration';
import { ActionName } from '../actions';

@Injectable()
export class AwsAdapter {
  private readonly client: ElasticLoadBalancingV2Client;
  private readonly ec2: EC2Client;
  constructor(private readonly config: ConfigService) {
    this.client = new ElasticLoadBalancingV2Client({
      region: this.settings.awsRegion,
    });
    this.ec2 = new EC2Client({ region: this.settings.awsRegion });
  }

  async run(
    action: ActionName,
    sessionId: string,
  ): Promise<Record<string, unknown>> {
    this.requireEnabled();
    switch (action) {
      case 'inspect_load_balancers':
        return this.inspect(sessionId);
      case 'provision_load_balancer':
        return this.provision(sessionId);
      case 'inject_target_failure':
        return this.updateTarget(sessionId, false);
      case 'diagnose_target_health':
        return this.diagnose(sessionId);
      case 'restore_target':
        return this.updateTarget(sessionId, true);
    }
  }

  async teardown(loadBalancerArn: string): Promise<void> {
    this.requireEnabled();
    await this.deleteLoadBalancerAndWait(loadBalancerArn);
  }

  async cleanupExpiredLoadBalancers(maxAgeMinutes: number): Promise<string[]> {
    if (!this.settings.awsEnabled) return [];
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
    const deleted = [...expiredSessionIds];
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
    for (const sessionId of expiredSessionIds)
      await this.cleanupSession(sessionId);
    return deleted;
  }

  async cleanupSession(sessionId: string): Promise<void> {
    this.requireEnabled();
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

  private get settings(): ApplicationConfiguration {
    return this.config.getOrThrow<ApplicationConfiguration>('app');
  }
  private requireEnabled(): void {
    if (!this.settings.awsEnabled)
      throw new ServiceUnavailableException(
        'AWS execution is disabled. Set AWS_ENABLED=true only in the dedicated demo account.',
      );
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
  private async provision(sessionId: string): Promise<Record<string, unknown>> {
    const { awsVpcSubnets, awsSecurityGroupId, awsAmiId, awsInstanceType } =
      this.settings;
    if (awsVpcSubnets.length < 2 || !awsSecurityGroupId || !awsAmiId)
      throw new BadRequestException(
        'AWS_VPC_SUBNET_IDS, AWS_SECURITY_GROUP_ID, and AWS_EC2_AMI_ID are required to provision the load-balancing lesson.',
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
      const instances = await this.ec2.send(
        new RunInstancesCommand({
          ImageId: awsAmiId,
          InstanceType: awsInstanceType as _InstanceType,
          MinCount: 3,
          MaxCount: 3,
          SubnetId: awsVpcSubnets[0],
          SecurityGroupIds: [awsSecurityGroupId],
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
      );
      instanceIds =
        instances.Instances?.flatMap((instance) =>
          instance.InstanceId ? [instance.InstanceId] : [],
        ) ?? [];
      if (instanceIds.length !== 3)
        throw new ServiceUnavailableException(
          'AWS did not create all three target instances.',
        );
      const subnet = await this.ec2.send(
        new DescribeSubnetsCommand({ SubnetIds: [awsVpcSubnets[0]] }),
      );
      const vpcId = subnet.Subnets?.[0]?.VpcId;
      if (!vpcId)
        throw new ServiceUnavailableException(
          'AWS did not return a VPC for the configured subnet.',
        );
      const targetGroup = await this.client.send(
        new CreateTargetGroupCommand({
          Name: `bbf-tg-${suffix}`,
          Protocol: 'HTTP',
          Port: this.settings.awsTargetPort,
          VpcId: vpcId,
          TargetType: 'instance',
          HealthCheckProtocol: 'HTTP',
          HealthCheckPath: '/',
          Tags: [
            { Key: 'project', Value: 'bbf-demo' },
            { Key: 'session_id', Value: sessionId },
            { Key: 'managed_by', Value: 'build-break-fix' },
            { Key: 'expires_at', Value: expiresAt },
          ],
        }),
      );
      targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;
      if (!targetGroupArn)
        throw new ServiceUnavailableException(
          'AWS did not return a target group ARN.',
        );
      const response = await this.client.send(
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
      );
      const loadBalancer = response.LoadBalancers?.[0];
      if (!loadBalancer?.LoadBalancerArn)
        throw new ServiceUnavailableException(
          'AWS did not return an Application Load Balancer ARN.',
        );
      loadBalancerArn = loadBalancer.LoadBalancerArn;
      await waitUntilInstanceRunning(
        { client: this.ec2, maxWaitTime: 300 },
        { InstanceIds: instanceIds },
      );
      await this.client.send(
        new RegisterTargetsCommand({
          TargetGroupArn: targetGroupArn,
          Targets: instanceIds.map((Id) => ({
            Id,
            Port: this.settings.awsTargetPort,
          })),
        }),
      );
      await this.client.send(
        new CreateListenerCommand({
          LoadBalancerArn: loadBalancer.LoadBalancerArn,
          Protocol: 'HTTP',
          Port: 80,
          DefaultActions: [{ Type: 'forward', TargetGroupArn: targetGroupArn }],
        }),
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
    if (register) await this.client.send(new RegisterTargetsCommand(target));
    else await this.client.send(new DeregisterTargetsCommand(target));
    return {
      targetId: target.Targets[0].Id,
      state: register ? 'registered' : 'deregistered',
    };
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
