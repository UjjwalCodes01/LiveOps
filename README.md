# Build. Break. Fix.

**Learn how real systems survive failure — by watching an AI agent build one on real AWS, break it on purpose, then diagnose and fix it live.**

> Cloud reliability is taught with slides and diagrams. Build. Break. Fix. teaches it the only way it's ever really learned: by watching real infrastructure fail and recover. An AI agent provisions a genuine load-balanced system on AWS, injects a real failure, and walks through the full incident loop — every AWS SDK call narrated on a live event stream, every concept unlocked the moment you watch it actually happen.

🎓 **Track:** Education
🔗 **Live demo:** https://live-ops-plum.vercel.app
🖥️ **Backend API:** https://liveops.onrender.com

---

## The problem

Concepts like load balancing, health checks, chaos engineering, and incident response are the core of modern SRE/DevOps — and they're almost impossible to *feel* from a textbook. Students read "a load balancer routes around failure" but never watch a server actually die and traffic actually reroute. Interactive tutorials fake it with animations; real cloud labs are intimidating, slow to set up, and easy to break in ways that don't teach anything.

**Build. Break. Fix. closes that gap.** It runs a real, disposable AWS system in front of the learner and narrates the entire build → break → diagnose → fix lifecycle as an AI agent drives it — pairing every real action with the concept it teaches.

## What it does

A learner picks a concept (Load Balancing) and walks through five phases, each backed by **real AWS infrastructure** and a **live teaching layer**:

| Phase | What really happens on AWS | What you learn |
|-------|----------------------------|----------------|
| **Build** | Provisions a real Application Load Balancer, 3 EC2 targets, a target group + health checks | Horizontal scaling — why one server is a single point of failure |
| **Explore** | Queries live AWS state into an interactive diagram | Reading live infrastructure vs. trusting the whiteboard |
| **Break** | Deregisters a healthy target — a real, controlled failure | Chaos engineering — proving resilience by causing failure |
| **Diagnose** | Calls `DescribeTargetHealth`, reads the real reason code | Observability — asking the system what's wrong instead of guessing |
| **Fix** | Re-registers the target, waits for it to pass health checks | Remediation & self-healing — the full detect→diagnose→fix→verify loop |

Every AWS SDK call scrolls past on a live Socket.IO event feed as it happens — **nothing is faked or pre-recorded.** As each phase's real work completes, its **takeaway unlocks** and a **concept badge** lights up, so the learning is earned by watching the infrastructure actually do the thing.

### What makes it different

- **It's real, not a simulation.** The diagram is driven off actual AWS API responses; the "broken" target is genuinely deregistered; "healthy" means the ALB really passed a health check.
- **Learning is welded to doing.** A per-phase teaching panel explains the concept, the real-world stakes, what the agent is doing under the jargon, and what to watch for — then locks the takeaway until the real phase completes, and offers an active-recall checkpoint quiz.
- **It's safe and cost-bounded by design** (see [Safety & cost controls](#safety--cost-controls)) — a dedicated sandbox account, resource TTLs, auto-teardown, and budget alarms mean a teaching tool can't run up a surprise bill.
- **It degrades gracefully.** If the LLM is unavailable (or you have no OpenAI budget), the agent falls back to verified deterministic actions and keeps teaching — the demo never hard-fails on an external dependency.

---

## Testing it as a judge

**No install, no login, no rebuild required.** Sessions are anonymous.

1. Open **https://live-ops-plum.vercel.app**
2. Go to **Pick something to learn → Load Balancing → Start building**.
3. Click **Build the system** and watch the live event feed + provisioning checklist. A real build takes ~2–4 minutes (real EC2 boot + health checks).
4. Walk **Explore → Break → Diagnose → Fix**, running each phase and reading the teaching panel beside the live feed.

> **Note on cold starts:** the backend runs on Render's free tier and spins down after ~15 min idle. The very first request may take ~50s to wake it — just retry once.

> **Note on live AWS:** each session provisions real, billable AWS resources that are automatically torn down after a TTL. If a build ever stalls at "waiting for health checks," it's an AWS-environment config issue, not the app — the built-in pre-flight (`GET /api/diagnostics/aws`) reports exactly what's wrong.

---

## Architecture

```
┌─────────────────────────┐        HTTPS + WSS         ┌──────────────────────────┐
│   Frontend (Next.js)     │  ───────────────────────>  │   Backend (NestJS)        │
│   Vercel                 │   REST + Socket.IO feed    │   Render (Docker)         │
│                          │  <───────────────────────  │                           │
│  • ReactFlow live diagram│                            │  • Agent orchestration    │
│  • Teaching layer        │                            │    (OpenAI, live decisions)│
│  • Live command feed      │                            │  • State machine per phase │
│  • Concept/checkpoint UX  │                            │  • Event stream (Postgres) │
└─────────────────────────┘                            │  • AWS adapter (real infra)│
                                                        └────────────┬─────────────┘
                                     ┌───────────────────────────────┼───────────────┐
                                     │                               │               │
                              ┌──────▼──────┐              ┌─────────▼────────┐  ┌───▼────┐
                              │  Postgres    │              │  AWS sandbox      │  │ OpenAI │
                              │ (sessions +  │              │  ELBv2 · EC2 ·STS │  │  agent │
                              │  event log)  │              │  (real resources) │  │        │
                              └──────────────┘              └──────────────────┘  └────────┘
```

**How a phase runs:** the frontend POSTs to the agent endpoint → the **AgentService** asks the LLM (live, from an allow-list of safe actions) which action to take → the **OrchestrationService** advances a strict state machine (`created→building→ready→broken→diagnosing→fixing→completed`) under a Postgres operation lock → the **ExecutorService** runs the real AWS SDK calls through the **AwsAdapter**, emitting a narrated event for every sub-step → events persist to Postgres and stream to the browser over Socket.IO for the live diagram and feed.

The agent is constrained to a **per-phase allow-list** of verified actions rather than arbitrary AWS access — a deliberate guardrail, since the LLM drives real, billable infrastructure.

### Tech stack

- **Frontend:** Next.js (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Motion · ReactFlow (`@xyflow/react`) · Socket.IO client · Recharts
- **Backend:** NestJS 11 · TypeScript · PostgreSQL (`pg`) · Socket.IO · OpenAI SDK · AWS SDK v3 (ELBv2, EC2, STS) · `@nestjs/throttler` · Helmet
- **Infra:** Vercel (frontend) · Render (Dockerized backend + managed Postgres, or Supabase) · a dedicated sandboxed AWS account

---

## Running it locally

### Prerequisites
- Node.js 22.x
- PostgreSQL (or Docker — `backend/docker-compose.yml` provides one)
- An OpenAI API key *(optional — see `OPENAI_ENABLED` below)*
- A sandboxed AWS account with a VPC, ≥2 subnets **in different AZs**, a security group allowing inbound port 80, and an Amazon Linux 2023 AMI *(only needed for live AWS provisioning)*

### Backend

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL, API_KEYS, OPENAI_API_KEY, AWS_* …
npm install
npm run migrate               # apply DB schema (advisory-locked, safe to re-run)
npm run start:dev             # http://localhost:4000
```

Key environment flags (full docs in `backend/.env.example`):
- `AWS_ENABLED=false` runs everything except real provisioning — good for exploring the app without an AWS account.
- `OPENAI_ENABLED=false` runs the agent **deterministically with no OpenAI calls at all** — the full build/break/fix loop still works on real AWS, with clean narration and no API key needed.
- `DATABASE_SSL=true` for managed Postgres (Render, Supabase, RDS).

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # point NEXT_PUBLIC_* at your backend
npm install
npm run dev                        # http://localhost:3000
```

### Pre-flight check (recommended before any live AWS demo)

A read-only diagnostic that verifies — without provisioning anything — that a live build will actually succeed: credentials, sandbox account, VPC, subnets (including AZ spread), security group, and AMI.

```bash
cd backend
PREFLIGHT_URL=https://your-backend API_KEY=<one of API_KEYS> npm run preflight
```

It prints a ✓/✗ per check and exits non-zero on any failure, so it doubles as a CI/pre-demo gate.

---

## Safety & cost controls

Because the app drives real, billable AWS infrastructure from an LLM, reliability and cost safety are first-class:

- **Dedicated sandbox account** — the app refuses to run against the wrong AWS account (verified via STS `GetCallerIdentity` against `AWS_ACCOUNT_ID`).
- **Least-privilege IAM** — `backend/infra/iam-policy.json` scopes the agent to tagged sandbox resources only.
- **Action allow-list** — the LLM can only choose from verified per-phase actions, never arbitrary AWS calls.
- **Resource TTL + auto-teardown** — a scheduled job reaps each session's tagged resources after `AWS_RESOURCE_TTL_MINUTES`, so nothing lingers.
- **Global concurrency cap** — `MAX_CONCURRENT_LIVE_SESSIONS` bounds how many sessions can hold live AWS resources at once, so total spend is capped regardless of client volume (per-IP rate limits alone can't guarantee this).
- **Per-endpoint rate limits** — session creation and the agent/build endpoint are throttled (20/min and 10/min per IP) on top of a global 120/min.
- **Session lifecycle** — idle sessions expire and clean up; completed sessions and their event logs are retention-pruned from Postgres.
- **Budget alarm** — `backend/infra/create-budget-alarm.sh` pages you on cost overruns independent of app health.
- **Rollback on partial failure** — a failed build tears down anything half-created instead of orphaning it.

> **On the frontend API key:** it ships in the browser bundle by necessity — a public SPA can't hide a shared credential, and the per-session access token (minted server-side) is what actually protects a given session's data. The layers above (concurrency cap + rate limits + resource TTL + budget alarm) are what bound cost from key exposure. A future hardening would move to server-minted, origin-bound session tokens so no shared key ships to the client at all.

---

## Repository structure

```
LiveOps/
├── backend/          NestJS API, agent orchestration, AWS adapter, migrations, infra/
│   ├── src/agent/            LLM agent (live decisions + deterministic fallback)
│   ├── src/orchestration/    phase state machine
│   ├── src/executor/         AWS SDK adapter + pre-flight diagnostics
│   ├── src/events/           Socket.IO gateway + event persistence
│   ├── src/sessions/         anonymous session + operation locks
│   ├── src/lifecycle/        TTL cleanup + retention crons
│   └── infra/                IAM policy, budget alarm, systemd unit
├── frontend/         Next.js app
│   ├── app/session/[id]/     the five phase pages
│   ├── components/learn/      curriculum, lesson panel, checkpoints, progress
│   ├── components/diagram/    ReactFlow live architecture diagram
│   └── lib/curriculum.ts      the teaching content
├── render.yaml       one-click backend + Postgres blueprint for Render
└── README.md
```

Detailed docs: [`backend/README.md`](backend/README.md) (deployment, health checks, pre-flight, migrations) and [`frontend/README.md`](frontend/README.md) (env vars, Vercel deploy).

---

## Deployment

- **Backend → Render:** `render.yaml` is a one-click Blueprint (Dockerized service + managed Postgres). Or deploy `backend/Dockerfile` to any container platform. See `backend/README.md`.
- **Frontend → Vercel:** import the repo, set Root Directory to `frontend`, set the three `NEXT_PUBLIC_*` env vars. See `frontend/README.md`.

---

## Building with Codex & GPT-5.6

**`/feedback` Codex Session ID:** `019f6bf5-f4e9-7b71-8879-8bc8ff430148`

I used Codex and GPT-5.6 as a hands-on engineering collaborator throughout
Build. Break. Fix. Codex helped me design, implement, and repeatedly audit the
NestJS backend, including the persistent session/event pipeline, WebSocket
replay, session-token authorization, the instrumented executor, and the
agent-to-orchestration flow.

For the live AWS load-balancing lesson, I used Codex to work through the real
provisioning lifecycle: EC2 targets, target groups, an Application Load
Balancer, listener creation, target-health verification, failure injection,
diagnosis, recovery, rollback, teardown, and orphan-resource cleanup. It also
helped improve reliability through operation locking, event sanitization,
throttling/backoff narration, database migrations, CI checks, and deployment
configuration.

I used Codex to review the frontend/backend contract and the event-driven UI:
the live architecture diagram, command feed, health polling, teardown controls,
and replay fallback. I made the final product and infrastructure decisions,
configured the real sandbox environment, verified the real AWS lifecycle and
cleanup behavior, captured the replay from a genuine run, and prepared the
demo/deployment setup.

---

## License

See repository licensing. Built for the OpenAI Build Week hackathon (Education track).
