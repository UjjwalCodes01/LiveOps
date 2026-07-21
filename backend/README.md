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

## Pre-flight AWS check (run this before any live demo)

`GET /api/diagnostics/aws` (x-api-key required — it reveals infra wiring) is
a read-only pre-flight that provisions nothing and reports whether a live
build would actually succeed right now: credentials resolve to the
configured sandbox account, and the VPC, both subnets, the security group,
and the AMI all exist and are consistent. It turns "the build mysteriously
timed out in front of judges" into a specific failed check you can fix
beforehand.

Easiest way to run it:

```bash
PREFLIGHT_URL=https://your-backend.onrender.com API_KEY=<one of API_KEYS> npm run preflight
```

It prints a ✓/✗ per check and exits non-zero if anything fails, so it also
works as a CI/pre-demo gate. Every check is isolated — one failure never
hides the others.

## Database migrations

Set `DATABASE_URL` to the Supabase/Postgres connection string, then run this before every deployment:

```bash
$ npm run migrate
```

The runner serializes concurrent deployments with a PostgreSQL advisory lock and records completed SQL files in `schema_migrations`.

### Local Postgres (optional)

Don't want to spin up Supabase for local development? `docker-compose.yml`
provides a plain local Postgres whose credentials match `.env.example`'s
sample `DATABASE_URL` exactly, so copying that file works with no edits:

```bash
$ docker compose up -d
$ cp .env.example .env   # DATABASE_URL already points at the container
$ npm run migrate
```

It only provisions an empty database — schema always comes from
`npm run migrate`, never from container init.

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
Nest's control. Common steps regardless of which compute option you pick:

1. Provision Postgres (e.g. Supabase, RDS) and set `DATABASE_URL`.
2. Create the dedicated sandbox AWS account/VPC described in `AGENT.md` §6.3,
   then render and attach `infra/iam-policy.json` to the ECS task role or
   EC2 instance role that will run this app — see `infra/README.md`.
3. Run `infra/create-budget-alarm.sh` against that account so cost overruns
   page you independently of whether the app is healthy.
4. Set every variable in `.env.example` in your deployment platform's
   secret/config store (never bake `.env` into an image or commit it).
5. Point your load balancer's health check at `GET /api/health/ready`
   (verifies the database connection), and liveness at `GET /api/health`.
6. Schedule `scripts/sweep-expired-resources.cjs` independently of the app
   (for example, with your platform scheduler or GitHub Actions) so orphaned
   AWS resources still get cleaned up if the app itself is down.
7. Before each deployment, run build, lint, unit, and e2e tests from this
   directory. There is no CD step wired up — deploying is a manual,
   deliberate action per the steps below.

### Render (recommended — one-click via `render.yaml`)

`render.yaml` at the repo root is a
[Render Blueprint](https://render.com/docs/blueprint-spec): it provisions the
backend as a Docker web service (from `backend/Dockerfile`) plus a managed
Postgres database, wired together automatically.

1. Push this repo to GitHub/GitLab, then in the Render dashboard: **New** →
   **Blueprint**, and point it at the repo. Render reads `render.yaml` and
   shows you the plan.
2. After the first deploy, open the backend service's **Environment** tab
   and fill in every variable the blueprint marked `sync: false` — at
   minimum `API_KEYS` (generate a real random value; the frontend must send
   it back as `x-api-key`) and `OPENAI_API_KEY`. Leave `AWS_ENABLED=false`
   unless you've set up the sandbox AWS account per `AGENT.md` §6.3, in
   which case fill in the `AWS_*` variables too.
3. Once the frontend has a Vercel URL (see `frontend/README.md`), set
   `CORS_ORIGINS` to it — e.g.
   `https://your-app.vercel.app,https://*.vercel.app` (the wildcard covers
   Vercel's per-branch preview deployments, which each get their own
   generated subdomain).
4. `DATABASE_URL` and `DATABASE_SSL=true` are already wired up by the
   blueprint (`fromDatabase` pulls the connection string from the Postgres
   service Render just created for you). `HOST=0.0.0.0` and `TRUST_PROXY=1`
   are also pre-set — both matter: Render proxies traffic to the container
   from outside it, so a loopback bind or an untrusted-proxy `req.ip` would
   silently break connectivity or rate limiting.
5. Render's health check is set to `GET /api/health` (see `healthCheckPath`
   in `render.yaml`); `npm run migrate` runs automatically on every deploy
   via the Dockerfile's `CMD` (`npm run start:prod`).

Don't want to hand-edit `render.yaml`? A manual **New → Web Service** →
point at `backend/Dockerfile` works too — just replicate the env vars from
`render.yaml` and `.env.example` by hand, and add a separate managed or
external (e.g. Supabase) Postgres instance yourself.

One caveat regardless of how you deploy: `LifecycleService`'s `@Cron`
sweep and Socket.IO's live event stream both assume exactly one
long-running backend process. If you ever scale the Render service beyond
one instance, `withOperationLock`/`excludeSessionsWithActiveOperation`
still prevent data corruption (they're DB-level, not in-memory), but the
cleanup cron will run redundantly on every instance — harmless, just
slightly wasteful AWS API calls.

### Option A: container (ECS Fargate or any container platform)

`Dockerfile` is a multi-stage build (deps → compile → production-only
runtime, non-root user, `HEALTHCHECK` against `/api/health`) — `.dockerignore`
keeps `.env`/`node_modules`/`.git` out of the image.

```bash
docker build -t build-break-fix-backend .
docker run --rm -p 4000:4000 --env-file .env build-break-fix-backend
```

The container's `CMD` runs `npm run start:prod`, which runs `npm run migrate`
first — `scripts/migrate.cjs`'s Postgres advisory lock makes this safe to run
on every container start, including multiple replicas starting concurrently.
Push the built image to ECR and point an ECS Fargate task/service at it,
injecting `.env.example`'s variables via task-definition secrets.

### Option B: a single EC2 instance (no Docker)

`infra/build-break-fix-backend.service` is a systemd unit — the app itself
previously had no process supervision at all, unlike the demo EC2 targets it
provisions, which get their own systemd unit from
`AwsAdapter.healthCheckUserData()`. See the comment block at the top of that
file for the exact setup steps (create a dedicated `bbf` user, deploy
`dist/`+`migrations/`+`scripts/`+production `node_modules` to
`/opt/build-break-fix`, drop a real `.env` there, install the unit, enable
it). `ExecStartPre` runs migrations before every start/restart; `Restart=on-failure`
gives it the same auto-restart behavior Docker/ECS provide for free.

None of this has been exercised against a live AWS/Postgres account from
this environment — validate steps 1–3 yourself before treating a deployment
as demo-ready, and run `npm run test:aws-integration` (see above) against
the real sandbox as the final check.

## License

MIT. See [`../LICENSE`](../LICENSE).
