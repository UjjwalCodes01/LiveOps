<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

The **Build. Break. Fix.** backend (NestJS). It orchestrates a live-infrastructure
teaching session: an OpenAI-driven agent provisions a real AWS Application
Load Balancer + EC2 targets, injects a real target failure, diagnoses it, and
fixes it — every action streamed to the frontend over Socket.IO as it
happens, through a single allow-listed instrumented executor
(`ExecutorService` → `AwsAdapter`). See `AGENT.md` at the repo root for the
full architecture and guardrails.

## Project setup

```bash
$ npm install
```

## Configuration

Copy `.env.example` to the ignored `.env` file and fill in real values —
`.env.example` documents every variable the app reads, grouped by server,
database, auth, OpenAI, CORS, session lifecycle, and AWS sandbox settings.
Never commit `.env`.

A few defaults worth knowing:
- `PORT` defaults to `4000` (not `3000`) specifically so the backend doesn't
  collide with the frontend's Next.js dev server, which defaults to `3000`.
  `CORS_ORIGINS` defaults to `http://localhost:3000` to match that frontend
  origin — both the HTTP CORS policy and the Socket.IO `/events` gateway use
  this same list.
- `SESSION_TTL_MINUTES` controls how long an unfinished session (not
  `completed`/`failed`) can sit idle before a background job (`LifecycleService`,
  every 5 minutes) marks it `failed` and, if `AWS_ENABLED=true`, tears down
  any AWS resources tagged with that session's ID — independent of
  `AWS_RESOURCE_TTL_MINUTES`, which reaps tagged AWS resources by their own
  creation age regardless of session state. A session actively mid-operation
  (an active row in `session_operations`) is never expired out from under it.
  All of this cleanup is narrated through the same event pipeline as everything
  else, so it's visible in a session's event log, not a silent side effect.
- `SESSION_RETENTION_DAYS` controls how long a `completed`/`failed` session
  (and its full event log, via `ON DELETE CASCADE`) is kept before being
  hard-deleted, so Postgres storage doesn't grow unbounded.
- In production (`NODE_ENV=production`), the app refuses to boot unless the
  database, API key, OpenAI, and full AWS sandbox configuration are all
  present and valid — see `validateProductionConfiguration` in
  `src/bootstrap.ts`.

For deployed workloads, use an ECS task role or EC2 instance role for AWS
credentials. For local sandbox testing only, the AWS SDK also accepts
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional
`AWS_SESSION_TOKEN` in the ignored `.env` file.

## Health checks

- `GET /api/health` — fast liveness probe, no dependencies checked.
- `GET /api/health/ready` — readiness probe; also verifies the database
  connection and returns 503 if it's unreachable. Use this one for load
  balancer / orchestrator health checks.

Both are unauthenticated (`@Public()`), unlike every other route, which
requires a valid `x-api-key` header.

## Database migrations

Set `DATABASE_URL` to the Supabase/Postgres connection string, then run this before every deployment:

```bash
$ npm run migrate
```

The runner serializes concurrent deployments with a PostgreSQL advisory lock and records completed SQL files in `schema_migrations`.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# real AWS sandbox lifecycle test (creates and deletes billable AWS resources)
$ npm run test:aws-integration

# test coverage
$ npm run test:cov
```

`npm run test:aws-integration` is intentionally opt-in. It requires `AWS_ENABLED=true`, a dedicated sandbox account/VPC, at least two subnets, a security group, an AMI serving the configured HTTP health endpoint, `DATABASE_URL`, `API_KEYS`, and `OPENAI_API_KEY` in the ignored `.env` file. It verifies build → break → diagnose → fix, checks the persisted intermediate provisioning events, then confirms teardown removed the session's tagged ALB, target group, and active EC2 instances. Run it only after attaching and validating the sandbox IAM policy.

## Deployment

Per `AGENT.md`, the target deployment shape is ECS Fargate or a single EC2
instance for the NestJS backend, with the frontend deployed separately
(Vercel/Amplify). There is no managed one-command deploy for this app — it
needs a real Postgres instance and a sandboxed AWS account, both outside
Nest's control. The steps:

1. Provision Postgres (e.g. Supabase, RDS) and set `DATABASE_URL`.
2. Create the dedicated sandbox AWS account/VPC described in `AGENT.md` §6.3,
   then render and attach `infra/iam-policy.json` to the ECS task role or
   EC2 instance role that will run this app — see `infra/README.md`.
3. Run `infra/create-budget-alarm.sh` against that account so cost overruns
   page you independently of whether the app is healthy.
4. Set every variable in `.env.example` in your deployment platform's
   secret/config store (never bake `.env` into an image).
5. Build and run:
   ```bash
   npm ci
   npm run build
   npm run start:prod   # runs migrations, then node dist/main
   ```
   `start:prod` runs `npm run migrate` first — make sure the deploying
   principal's `DATABASE_URL` has DDL privileges.
6. Point your load balancer's health check at `GET /api/health/ready`
   (verifies the database connection), and liveness at `GET /api/health`.
7. Schedule `scripts/sweep-expired-resources.cjs` independently of the app
   (`.github/workflows/sweep.yml` is a ready-made hourly GitHub Actions
   version) so orphaned AWS resources still get cleaned up if the app itself
   is down.
8. CI (`.github/workflows/backend-ci.yml`) runs build, lint, unit, and e2e
   tests on every push/PR touching `backend/`; there is no CD step wired up
   — deploying is a manual, deliberate action per the steps above.

None of this has been exercised against a live AWS/Postgres account from
this environment — validate steps 1–3 yourself before treating a deployment
as demo-ready, and run `npm run test:aws-integration` (see above) against
the real sandbox as the final check.

## License

UNLICENSED — private, not for redistribution (see `package.json`).
