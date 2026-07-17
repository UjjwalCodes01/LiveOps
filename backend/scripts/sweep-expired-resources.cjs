#!/usr/bin/env node
// Standalone, NestJS/Postgres-independent sweep of orphaned AWS demo
// resources tagged project=bbf-demo. This exists specifically so cleanup
// still happens even if the backend app itself is crashed, not deployed,
// or its in-process LifecycleService cron never runs — see AGENT.md §6.2
// ("A background job auto-tears down any session's resources... A hard
// AWS budget alarm is configured independently of the app") and the "no
// independent external sweeper" gap this closes.
//
// Usage:
//   node -r dotenv/config scripts/sweep-expired-resources.cjs dotenv_config_path=.env [--dry-run]
//
// Required env: AWS_ENABLED=true, AWS_REGION, AWS_ACCOUNT_ID.
// Optional env: AWS_RESOURCE_TTL_MINUTES (default 20).
//
// Intended to run on an external schedule independent of the app process
// (see .github/workflows/sweep.yml for a ready-made hourly GitHub Actions
// version), not as part of `npm run start`.
'use strict';

const {
  EC2Client,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} = require('@aws-sdk/client-ec2');
const {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  DescribeTagsCommand,
  DeleteLoadBalancerCommand,
  DeleteTargetGroupCommand,
  waitUntilLoadBalancersDeleted,
} = require('@aws-sdk/client-elastic-load-balancing-v2');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (process.env.AWS_ENABLED !== 'true') {
    process.stdout.write('AWS_ENABLED is not true; nothing to sweep.\n');
    return;
  }
  const region = requireEnv('AWS_REGION');
  const accountId = requireEnv('AWS_ACCOUNT_ID');
  const ttlMinutes = Number.parseInt(
    process.env.AWS_RESOURCE_TTL_MINUTES ?? '20',
    10,
  );
  const cutoff = Date.now() - ttlMinutes * 60_000;

  const ec2 = new EC2Client({ region });
  const elbv2 = new ElasticLoadBalancingV2Client({ region });
  const sts = new STSClient({ region });

  const identity = await sts.send(new GetCallerIdentityCommand({}));
  if (identity.Account !== accountId)
    throw new Error(
      `AWS credentials belong to account ${identity.Account}, not the configured sandbox account ${accountId}. Refusing to sweep.`,
    );

  const expiredSessionIds = new Set();

  const instances = await ec2.send(
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
  for (const reservation of instances.Reservations ?? [])
    for (const instance of reservation.Instances ?? []) {
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

  const targetGroups = await elbv2.send(new DescribeTargetGroupsCommand({}));
  for (const targetGroup of targetGroups.TargetGroups ?? []) {
    if (!targetGroup.TargetGroupArn) continue;
    const tags = await describeTags(elbv2, targetGroup.TargetGroupArn);
    if (!tags.some((tag) => tag.Key === 'project' && tag.Value === 'bbf-demo'))
      continue;
    const sessionId = tags.find((tag) => tag.Key === 'session_id')?.Value;
    const expiresAt = tags.find((tag) => tag.Key === 'expires_at')?.Value;
    if (sessionId && expiresAt && Date.parse(expiresAt) <= Date.now())
      expiredSessionIds.add(sessionId);
  }

  const loadBalancers = await elbv2.send(new DescribeLoadBalancersCommand({}));
  for (const loadBalancer of loadBalancers.LoadBalancers ?? []) {
    if (
      !loadBalancer.LoadBalancerArn ||
      !loadBalancer.CreatedTime ||
      loadBalancer.CreatedTime.getTime() > cutoff
    )
      continue;
    const tags = await describeTags(elbv2, loadBalancer.LoadBalancerArn);
    const isDemoResource = tags.some(
      (tag) => tag.Key === 'project' && tag.Value === 'bbf-demo',
    );
    const sessionId = tags.find((tag) => tag.Key === 'session_id')?.Value;
    if (isDemoResource && sessionId) expiredSessionIds.add(sessionId);
  }

  if (!expiredSessionIds.size) {
    process.stdout.write('No expired bbf-demo resources found.\n');
    return;
  }
  process.stdout.write(
    `${dryRun ? '[dry-run] Would delete' : 'Deleting'} resources for ${expiredSessionIds.size} expired session(s): ${[...expiredSessionIds].join(', ')}\n`,
  );
  if (dryRun) return;

  for (const sessionId of expiredSessionIds)
    await cleanupSession(ec2, elbv2, sessionId);
  process.stdout.write('Sweep complete.\n');
}

async function cleanupSession(ec2, elbv2, sessionId) {
  const loadBalancers = await elbv2.send(new DescribeLoadBalancersCommand({}));
  for (const loadBalancer of loadBalancers.LoadBalancers ?? []) {
    if (!loadBalancer.LoadBalancerArn) continue;
    const tags = await describeTags(elbv2, loadBalancer.LoadBalancerArn);
    if (tags.some((tag) => tag.Key === 'session_id' && tag.Value === sessionId))
      // Must wait for the ALB to actually finish deleting before deleting
      // its target group below — DeleteLoadBalancer only starts an async
      // teardown, and the target group can still be "in use" by the ALB's
      // listener for a while after the delete call returns. Mirrors
      // AwsAdapter.deleteLoadBalancerAndWait in src/executor/adapters/aws.adapter.ts.
      await deleteLoadBalancerAndWait(elbv2, loadBalancer.LoadBalancerArn);
  }
  const targetGroups = await elbv2.send(new DescribeTargetGroupsCommand({}));
  for (const targetGroup of targetGroups.TargetGroups ?? []) {
    if (!targetGroup.TargetGroupArn) continue;
    const tags = await describeTags(elbv2, targetGroup.TargetGroupArn);
    if (tags.some((tag) => tag.Key === 'session_id' && tag.Value === sessionId))
      await elbv2.send(
        new DeleteTargetGroupCommand({
          TargetGroupArn: targetGroup.TargetGroupArn,
        }),
      );
  }
  const instances = await ec2.send(
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
  const instanceIds = (instances.Reservations ?? [])
    .flatMap((reservation) => reservation.Instances ?? [])
    .flatMap((instance) => (instance.InstanceId ? [instance.InstanceId] : []));
  if (instanceIds.length)
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: instanceIds }));
}

async function deleteLoadBalancerAndWait(elbv2, loadBalancerArn) {
  await elbv2.send(
    new DeleteLoadBalancerCommand({ LoadBalancerArn: loadBalancerArn }),
  );
  await waitUntilLoadBalancersDeleted(
    { client: elbv2, maxWaitTime: 300 },
    { LoadBalancerArns: [loadBalancerArn] },
  );
}

async function describeTags(elbv2, resourceArn) {
  const tags = await elbv2.send(
    new DescribeTagsCommand({ ResourceArns: [resourceArn] }),
  );
  return tags.TagDescriptions?.[0]?.Tags ?? [];
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to run the sweep.`);
  return value;
}

main().catch((error) => {
  process.stderr.write(
    `Sweep failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
