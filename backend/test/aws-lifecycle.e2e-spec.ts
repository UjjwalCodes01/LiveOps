import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AwsAdapter } from '../src/executor/adapters/aws.adapter';

interface SessionResponse {
  session: { id: string };
  accessToken: string;
}
const runSandboxTest = process.env.RUN_AWS_INTEGRATION_TESTS === 'true';

(runSandboxTest ? describe : describe.skip)(
  'real AWS load-balancer lifecycle',
  () => {
    let app: INestApplication;
    let aws: AwsAdapter;
    let apiKey: string;
    let sessionId: string;

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
      if (sessionId) await aws.cleanupSession(sessionId);
      await app?.close();
    }, 330_000);

    it('builds, breaks, diagnoses, fixes, and tears down real resources', async () => {
      const headers = { 'x-api-key': apiKey };
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const session = await request(server)
        .post('/api/sessions')
        .set(headers)
        .expect(201);
      const created = session.body as SessionResponse;
      sessionId = created.session.id;
      headers['x-session-token'] = created.accessToken;
      await request(server)
        .post(`/api/sessions/${sessionId}/build`)
        .set(headers)
        .expect(201);
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
