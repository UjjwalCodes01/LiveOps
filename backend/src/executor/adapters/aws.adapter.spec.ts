import { AwsAdapter } from './aws.adapter';
import type { ApplicationConfiguration } from '../../config/configuration';

const BASE_CONFIG: Partial<ApplicationConfiguration> = {
  awsEnabled: true,
  awsRegion: 'ap-south-1',
  awsAccountId: '123456789012',
  awsVpcId: 'vpc-abc',
  awsVpcSubnets: ['subnet-1', 'subnet-2'],
  awsSecurityGroupId: 'sg-abc',
  awsAmiId: 'ami-abc',
  awsInstanceType: 't3.micro',
  awsTargetPort: 80,
  awsTargetHealthPath: '/health',
};

// A security group in the right VPC that admits inbound TCP 80 (the target
// port) — the valid shape the pre-flight now requires.
const SG_WITH_PORT_80 = {
  GroupId: 'sg-abc',
  VpcId: 'vpc-abc',
  IpPermissions: [
    {
      IpProtocol: 'tcp',
      FromPort: 80,
      ToPort: 80,
      IpRanges: [{ CidrIp: '0.0.0.0/0' }],
    },
  ],
};

// Build an adapter with its AWS SDK clients replaced by fakes. The clients
// are constructed in the constructor, so we override the private fields
// after construction — the constructor only reads awsRegion off config.
function makeAdapter(
  config: Partial<ApplicationConfiguration>,
  handlers: { sts?: () => unknown; ec2?: (commandName: string) => unknown },
): AwsAdapter {
  const adapter = new AwsAdapter({
    getOrThrow: () => config,
  } as never);
  const fake = adapter as unknown as {
    sts: { send: (command: unknown) => Promise<unknown> };
    ec2: { send: (command: unknown) => Promise<unknown> };
  };
  fake.sts = {
    send: () =>
      handlers.sts
        ? Promise.resolve(handlers.sts())
        : Promise.reject(new Error('no sts handler')),
  };
  fake.ec2 = {
    send: (command: unknown) => {
      const name = (command as { constructor: { name: string } }).constructor
        .name;
      return handlers.ec2
        ? Promise.resolve(handlers.ec2(name))
        : Promise.reject(new Error('no ec2 handler'));
    },
  };
  return adapter;
}

function checkByKey(report: { checks: { key: string; status: string }[] }) {
  return Object.fromEntries(
    report.checks.map((check) => [check.key, check.status]),
  );
}

describe('AwsAdapter.verifySetup', () => {
  it('reports ready when every resource is present and consistent', async () => {
    const adapter = makeAdapter(BASE_CONFIG, {
      sts: () => ({ Account: '123456789012' }),
      ec2: (name) => {
        switch (name) {
          case 'DescribeVpcsCommand':
            return { Vpcs: [{ VpcId: 'vpc-abc' }] };
          case 'DescribeSubnetsCommand':
            return {
              Subnets: [
                {
                  SubnetId: 'subnet-1',
                  VpcId: 'vpc-abc',
                  AvailabilityZone: 'us-east-1a',
                },
                {
                  SubnetId: 'subnet-2',
                  VpcId: 'vpc-abc',
                  AvailabilityZone: 'us-east-1b',
                },
              ],
            };
          case 'DescribeSecurityGroupsCommand':
            return { SecurityGroups: [SG_WITH_PORT_80] };
          case 'DescribeImagesCommand':
            return { Images: [{ ImageId: 'ami-abc', State: 'available' }] };
          default:
            return {};
        }
      },
    });

    const report = await adapter.verifySetup();

    expect(report.ready).toBe(true);
    expect(report.checks.every((check) => check.status === 'ok')).toBe(true);
  });

  it('fails the credentials check and skips AWS-dependent checks on the wrong account', async () => {
    const adapter = makeAdapter(BASE_CONFIG, {
      sts: () => ({ Account: '999999999999' }), // not the sandbox account
    });

    const report = await adapter.verifySetup();
    const status = checkByKey(report);

    expect(report.ready).toBe(false);
    expect(status.credentials).toBe('failed');
    // Everything requiring a live AWS call is skipped, not spuriously failed.
    expect(status.vpc).toBe('skipped');
    expect(status.subnets).toBe('skipped');
    expect(status.security_group).toBe('skipped');
    expect(status.ami).toBe('skipped');
  });

  it('flags missing configuration without needing AWS at all', async () => {
    const adapter = makeAdapter(
      { ...BASE_CONFIG, awsAmiId: undefined, awsVpcSubnets: ['subnet-1'] },
      { sts: () => ({ Account: '123456789012' }), ec2: () => ({}) },
    );

    const report = await adapter.verifySetup();
    const configCheck = report.checks.find((check) => check.key === 'config');

    expect(configCheck?.status).toBe('failed');
    expect(configCheck?.detail).toContain('AWS_EC2_AMI_ID');
    expect(report.ready).toBe(false);
  });

  it('catches a subnet that belongs to a different VPC', async () => {
    const adapter = makeAdapter(BASE_CONFIG, {
      sts: () => ({ Account: '123456789012' }),
      ec2: (name) => {
        if (name === 'DescribeVpcsCommand')
          return { Vpcs: [{ VpcId: 'vpc-abc' }] };
        if (name === 'DescribeSubnetsCommand')
          return {
            Subnets: [
              {
                SubnetId: 'subnet-1',
                VpcId: 'vpc-abc',
                AvailabilityZone: 'us-east-1a',
              },
              {
                SubnetId: 'subnet-2',
                VpcId: 'vpc-OTHER',
                AvailabilityZone: 'us-east-1b',
              },
            ],
          };
        if (name === 'DescribeSecurityGroupsCommand')
          return { SecurityGroups: [SG_WITH_PORT_80] };
        if (name === 'DescribeImagesCommand')
          return { Images: [{ ImageId: 'ami-abc', State: 'available' }] };
        return {};
      },
    });

    const report = await adapter.verifySetup();
    const subnets = report.checks.find((check) => check.key === 'subnets');

    expect(subnets?.status).toBe('failed');
    expect(subnets?.detail).toContain('subnet-2');
    expect(report.ready).toBe(false);
  });

  it('catches two subnets that are in the same Availability Zone', async () => {
    const adapter = makeAdapter(BASE_CONFIG, {
      sts: () => ({ Account: '123456789012' }),
      ec2: (name) => {
        if (name === 'DescribeVpcsCommand')
          return { Vpcs: [{ VpcId: 'vpc-abc' }] };
        if (name === 'DescribeSubnetsCommand')
          return {
            Subnets: [
              {
                SubnetId: 'subnet-1',
                VpcId: 'vpc-abc',
                AvailabilityZone: 'us-east-1a',
              },
              {
                SubnetId: 'subnet-2',
                VpcId: 'vpc-abc',
                AvailabilityZone: 'us-east-1a', // same AZ — ALB will reject
              },
            ],
          };
        if (name === 'DescribeSecurityGroupsCommand')
          return { SecurityGroups: [SG_WITH_PORT_80] };
        if (name === 'DescribeImagesCommand')
          return { Images: [{ ImageId: 'ami-abc', State: 'available' }] };
        return {};
      },
    });

    const report = await adapter.verifySetup();
    const subnets = report.checks.find((check) => check.key === 'subnets');

    expect(subnets?.status).toBe('failed');
    expect(subnets?.detail).toContain('same Availability Zone');
    expect(report.ready).toBe(false);
  });

  it('fails the AMI check when the image is not yet available', async () => {
    const adapter = makeAdapter(BASE_CONFIG, {
      sts: () => ({ Account: '123456789012' }),
      ec2: (name) => {
        if (name === 'DescribeVpcsCommand')
          return { Vpcs: [{ VpcId: 'vpc-abc' }] };
        if (name === 'DescribeSubnetsCommand')
          return {
            Subnets: [
              {
                SubnetId: 'subnet-1',
                VpcId: 'vpc-abc',
                AvailabilityZone: 'us-east-1a',
              },
              {
                SubnetId: 'subnet-2',
                VpcId: 'vpc-abc',
                AvailabilityZone: 'us-east-1b',
              },
            ],
          };
        if (name === 'DescribeSecurityGroupsCommand')
          return { SecurityGroups: [SG_WITH_PORT_80] };
        if (name === 'DescribeImagesCommand')
          return { Images: [{ ImageId: 'ami-abc', State: 'pending' }] };
        return {};
      },
    });

    const report = await adapter.verifySetup();
    const ami = report.checks.find((check) => check.key === 'ami');

    expect(ami?.status).toBe('failed');
    expect(ami?.detail).toContain('pending');
  });

  it('fails the security group check when inbound TCP 80 is not allowed', async () => {
    const adapter = makeAdapter(BASE_CONFIG, {
      sts: () => ({ Account: '123456789012' }),
      ec2: (name) => {
        if (name === 'DescribeVpcsCommand')
          return { Vpcs: [{ VpcId: 'vpc-abc' }] };
        if (name === 'DescribeSubnetsCommand')
          return {
            Subnets: [
              {
                SubnetId: 'subnet-1',
                VpcId: 'vpc-abc',
                AvailabilityZone: 'us-east-1a',
              },
              {
                SubnetId: 'subnet-2',
                VpcId: 'vpc-abc',
                AvailabilityZone: 'us-east-1b',
              },
            ],
          };
        if (name === 'DescribeSecurityGroupsCommand')
          // In the VPC, but only opens SSH (22) — not the target port 80.
          return {
            SecurityGroups: [
              {
                GroupId: 'sg-abc',
                VpcId: 'vpc-abc',
                IpPermissions: [
                  {
                    IpProtocol: 'tcp',
                    FromPort: 22,
                    ToPort: 22,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }],
                  },
                ],
              },
            ],
          };
        if (name === 'DescribeImagesCommand')
          return { Images: [{ ImageId: 'ami-abc', State: 'available' }] };
        return {};
      },
    });

    const report = await adapter.verifySetup();
    const sg = report.checks.find((check) => check.key === 'security_group');

    expect(sg?.status).toBe('failed');
    expect(sg?.detail).toContain('TCP 80');
    expect(report.ready).toBe(false);
  });
});

// The private helper behind the teardown "target group in use by a listener"
// fix — reached via a cast so we don't need to stand up a full cleanup.
type WithDelete = {
  client: { send: (command: unknown) => Promise<unknown> };
  deleteTargetGroupWithRetry: (
    arn: string,
    maxAttempts?: number,
    baseDelayMs?: number,
  ) => Promise<void>;
};

describe('AwsAdapter target-group deletion retry', () => {
  function adapterWithClient(send: () => Promise<unknown>): WithDelete {
    const adapter = new AwsAdapter({
      getOrThrow: () => BASE_CONFIG,
    } as never) as unknown as WithDelete;
    adapter.client = { send };
    return adapter;
  }

  it('retries while the target group is transiently in use, then succeeds', async () => {
    let calls = 0;
    const adapter = adapterWithClient(() => {
      calls += 1;
      if (calls < 3)
        return Promise.reject(
          Object.assign(
            new Error(
              'Target group arn:...:targetgroup/x is currently in use by a listener or a rule',
            ),
            { name: 'ResourceInUseException' },
          ),
        );
      return Promise.resolve({});
    });
    // baseDelayMs 0 so the test doesn't actually wait.
    await adapter.deleteTargetGroupWithRetry('tg-arn', 6, 0);
    expect(calls).toBe(3);
  });

  it('rethrows a non-in-use error immediately without retrying', async () => {
    let calls = 0;
    const adapter = adapterWithClient(() => {
      calls += 1;
      return Promise.reject(
        Object.assign(new Error('boom'), { name: 'AccessDenied' }),
      );
    });
    await expect(
      adapter.deleteTargetGroupWithRetry('tg-arn', 6, 0),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});
