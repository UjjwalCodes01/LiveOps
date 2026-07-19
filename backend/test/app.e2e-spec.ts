import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';

interface CreatedSessionResponse {
  session: { id: string; state: string };
  accessToken: string;
}

describe('API health and auth contract (e2e)', () => {
  let app: INestApplication<App>;
  const apiKey = 'e2e-test-api-key';

  beforeAll(async () => {
    // Hermetic by construction: this suite tests the HTTP / auth / health
    // contract, not persistence, so it must never touch a real database.
    // Force in-memory mode (SessionService uses maps when there's no
    // DATABASE_URL) and NODE_ENV=test regardless of whatever ambient
    // backend/.env happens to hold — otherwise a developer's .env pointing
    // at a production Postgres (e.g. Supabase) would make these tests try
    // to connect to it. Setting the vars to a present value stops
    // @nestjs/config's dotenv load from re-populating them from .env
    // (dotenv never overrides keys already in process.env).
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = '';
    process.env.API_KEYS = apiKey;
    // AgentService requires OPENAI_API_KEY to construct at all (see
    // src/agent/agent.service.ts), even though this suite never exercises
    // the /agent/execute route — a full AppModule can't be wired up
    // without it. The value is never used against the real OpenAI API here.
    process.env.OPENAI_API_KEY ??= 'e2e-test-openai-key';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health is public and reports liveness without an API key', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('GET /api/health/ready is public and reports readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);
    expect(response.body).toMatchObject({ status: 'ready' });
  });

  it('rejects requests with no or an invalid x-api-key', async () => {
    await request(app.getHttpServer()).post('/api/sessions').expect(401);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .set('x-api-key', 'wrong-key')
      .expect(401);
  });

  it('creates a session and enforces its session token on subsequent access', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/sessions')
      .set('x-api-key', apiKey)
      .expect(201);
    const { session, accessToken } = created.body as CreatedSessionResponse;
    expect(session.state).toBe('created');
    expect(typeof accessToken).toBe('string');

    // A missing or wrong session token returns 404, not 401 — unauthenticated
    // callers must not be able to distinguish an existing session from a
    // nonexistent one.
    await request(app.getHttpServer())
      .get(`/api/sessions/${session.id}`)
      .set('x-api-key', apiKey)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/sessions/${session.id}`)
      .set('x-api-key', apiKey)
      .set('x-session-token', 'wrong-token')
      .expect(404);

    const fetched = await request(app.getHttpServer())
      .get(`/api/sessions/${session.id}`)
      .set('x-api-key', apiKey)
      .set('x-session-token', accessToken)
      .expect(200);
    expect(fetched.body).toMatchObject({ id: session.id, state: 'created' });
  });
});
