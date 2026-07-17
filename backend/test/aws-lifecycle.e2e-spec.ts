import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { AwsAdapter } from '../src/executor/adapters/aws.adapter';

interface SessionResponse {
  session: { id: string };
  accessToken: string;
}
interface SessionStateResponse {
  state: string;
}
interface SessionEventResponse {
  type: string;
  action?: string;
}
const runSandboxTest = process.env.RUN_AWS_INTEGRATION_TESTS === 'true';

function requireSandboxConfiguration(): void {
  const required = [
    'DATABASE_URL',
    'API_KEYS',
    'OPENAI_API_KEY',
    'AWS_REGION',
    'AWS_ACCOUNT_ID',
    'AWS_VPC_ID',
    'AWS_VPC_SUBNET_IDS',
    'AWS_SECURITY_GROUP_ID',
    'AWS_EC2_AMI_ID',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (process.env.AWS_ENABLED !== 'true') missing.push('AWS_ENABLED=true');
  if (
    (process.env.AWS_VPC_SUBNET_IDS?.split(',').filter(Boolean).length ?? 0) < 2
  )
    missing.push('at least two AWS_VPC_SUBNET_IDS');
  if (missing.length)
    throw new Error(`AWS integration test requires: ${missing.join(', ')}.`);
}

(runSandboxTest ? describe : describe.skip)(
  'real AWS load-balancer lifecycle',
  () => {
    let app: INestApplication;
    let aws: AwsAdapter;
    let apiKey: string;
    let sessionId: string;
    let sessionToken: string;

    beforeAll(async () => {
      requireSandboxConfiguration();
      apiKey = process.env.API_KEYS?.split(',')[0] ?? '';
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      configureApplication(app);
      await app.init();
      aws = app.get(AwsAdapter);
    }, 30_000);

    afterAll(async () => {
      if (sessionId) {
        await aws.cleanupSession(sessionId);
        expect(await aws.inspectSessionResources(sessionId)).toEqual({
          loadBalancerArns: [],
          targetGroupArns: [],
          activeInstanceIds: [],
        });
      }
      await app?.close();
    }, 330_000);

    it('builds, breaks, diagnoses, fixes, and tears down real resources', async () => {
      const headers: Record<string, string> = { 'x-api-key': apiKey };
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const session = await request(server)
        .post('/api/sessions')
        .set(headers)
        .expect(201);
      const created = session.body as SessionResponse;
      sessionId = created.session.id;
      sessionToken = created.accessToken;
      headers['x-session-token'] = sessionToken;
      const built = await request(server)
        .post(`/api/sessions/${sessionId}/build`)
        .set(headers)
        .expect(201);
      expect((built.body as SessionStateResponse).state).toBe('ready');
      const broken = await request(server)
        .post(`/api/sessions/${sessionId}/break`)
        .set(headers)
        .expect(201);
      expect((broken.body as SessionStateResponse).state).toBe('broken');
      const diagnosed = await request(server)
        .post(`/api/sessions/${sessionId}/diagnose`)
        .set(headers)
        .expect(201);
      expect((diagnosed.body as SessionStateResponse).state).toBe('diagnosing');
      const fixed = await request(server)
        .post(`/api/sessions/${sessionId}/fix`)
        .set(headers)
        .expect(201);
      expect((fixed.body as SessionStateResponse).state).toBe('completed');
      const events = await request(server)
        .get(`/api/sessions/${sessionId}/events`)
        .set(headers)
        .expect(200);
      const completedActions = (events.body as SessionEventResponse[])
        .filter((event) => event.type === 'action_completed')
        .map((event) => event.action);
      expect(completedActions).toEqual(
        expect.arrayContaining([
          'create_ec2_targets',
          'create_target_group',
          'create_application_load_balancer',
          'create_listener',
          'wait_for_target_health',
          'provision_load_balancer',
          'inject_target_failure',
          'diagnose_target_health',
          'restore_target',
        ]),
      );
    }, 330_000);
  },
);
