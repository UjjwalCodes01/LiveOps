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
                { SubnetId: 'subnet-1', VpcId: 'vpc-abc' },
                { SubnetId: 'subnet-2', VpcId: 'vpc-abc' },
              ],
            };
          case 'DescribeSecurityGroupsCommand':
            return {
              SecurityGroups: [{ GroupId: 'sg-abc', VpcId: 'vpc-abc' }],
            };
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
              { SubnetId: 'subnet-1', VpcId: 'vpc-abc' },
              { SubnetId: 'subnet-2', VpcId: 'vpc-OTHER' },
            ],
          };
        if (name === 'DescribeSecurityGroupsCommand')
          return { SecurityGroups: [{ GroupId: 'sg-abc', VpcId: 'vpc-abc' }] };
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

  it('fails the AMI check when the image is not yet available', async () => {
    const adapter = makeAdapter(BASE_CONFIG, {
      sts: () => ({ Account: '123456789012' }),
      ec2: (name) => {
        if (name === 'DescribeVpcsCommand')
          return { Vpcs: [{ VpcId: 'vpc-abc' }] };
        if (name === 'DescribeSubnetsCommand')
          return {
            Subnets: [
              { SubnetId: 'subnet-1', VpcId: 'vpc-abc' },
              { SubnetId: 'subnet-2', VpcId: 'vpc-abc' },
            ],
          };
        if (name === 'DescribeSecurityGroupsCommand')
          return { SecurityGroups: [{ GroupId: 'sg-abc', VpcId: 'vpc-abc' }] };
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
});
