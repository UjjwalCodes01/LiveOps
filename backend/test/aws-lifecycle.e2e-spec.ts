import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AwsAdapter } from '../src/executor/adapters/aws.adapter';

interface SessionResponse {
  id: string;
}
interface SessionEventResponse {
  action?: string;
  result?: { loadBalancerArn?: string };
}

const runSandboxTest = process.env.RUN_AWS_INTEGRATION_TESTS === 'true';

(runSandboxTest ? describe : describe.skip)(
  'real AWS load-balancer lifecycle',
  () => {
    let app: INestApplication;
    let aws: AwsAdapter;
    let apiKey: string;
    let sessionId: string;
    let loadBalancerArn: string | undefined;

    beforeAll(async () => {
      apiKey = process.env.API_KEYS?.split(',')[0] ?? '';
      if (!apiKey)
        throw new Error('API_KEYS is required for the AWS integration test.');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      aws = app.get(AwsAdapter);
    }, 30_000);

    afterAll(async () => {
      if (loadBalancerArn) await aws.teardown(loadBalancerArn);
      await app?.close();
    }, 330_000);

    it('builds, breaks, diagnoses, fixes, and tears down real resources', async () => {
      const headers = { 'x-api-key': apiKey };
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const session = await request(server)
        .post('/api/sessions')
        .set(headers)
        .expect(201);
      sessionId = (session.body as SessionResponse).id;
      await request(server)
        .post(`/api/sessions/${sessionId}/build`)
        .set(headers)
        .expect(201);
      const events = await request(server)
        .get(`/api/sessions/${sessionId}/events`)
        .set(headers)
        .expect(200);
      loadBalancerArn = (events.body as SessionEventResponse[]).find(
        (event) => event.action === 'provision_load_balancer',
      )?.result?.loadBalancerArn;
      await request(server)
        .post(`/api/sessions/${sessionId}/break`)
        .set(headers)
        .expect(201);
      await request(server)
        .post(`/api/sessions/${sessionId}/diagnose`)
        .set(headers)
        .expect(201);
      await request(server)
        .post(`/api/sessions/${sessionId}/fix`)
        .set(headers)
        .expect(201);
    }, 330_000);
  },
);
