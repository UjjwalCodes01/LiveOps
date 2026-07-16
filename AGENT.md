# AGENT.md — Build. Break. Fix.

This file is the single source of truth for any AI agent (Codex, GPT-5.6, or a human contributor) working on this codebase. Read this fully before generating or modifying code. When in doubt, follow the guardrails in Section 6 over feature requests — safety and demo reliability outrank feature completeness.

---

## 1. Project Summary

**Build. Break. Fix.** is an education platform where a backend agent provisions *real* infrastructure (AWS resources and/or Docker containers) live, in front of a student, then injects a real failure into that system, diagnoses it, and fixes it — with every action streamed to the frontend as a structured event, in real time. Nothing is pre-recorded or faked; the agent's literal commands, reasoning, and results are shown as they happen.

**Non-goal:** this is not a chatbot that talks about infrastructure. Every claim the UI makes about "what's happening" must correspond to a real action the executor actually ran. If a feature can't be backed by a real action within the time budget, cut the feature — do not fake the event stream.

---

## 2. Core Architecture

```
Student Browser (Next.js)
     ↕ WebSocket (Socket.IO, event stream)
NestJS Backend
     ├─ Agent Orchestrator (calls GPT-5.6 / Codex, decides next action)
     ├─ Instrumented Executor  ← ALL side effects go through this, no exceptions
     │      ├─ AWS Adapter (AWS SDK for JavaScript v3)
     │      ├─ Docker Adapter (dockerode)
     │      └─ (future) any other adapter
     └─ Session Store (DynamoDB/Postgres via TypeORM or Prisma) — event log + progress
```

**Golden rule:** the agent orchestrator never calls the AWS SDK, Docker, or any external system directly. It only calls `executor.run(action)`. This is what guarantees the UI is always showing something real, and what makes adding a new concept (e.g., replication) a matter of writing a new adapter, not rewriting the pipeline.

---

## 3. Event Schema (must not be broken without updating both frontend and backend together)

```json
{
  "session_id": "string",
  "phase": "build | explore | break | diagnose | fix",
  "type": "action_started | action_completed | action_failed | narration | metric_update",
  "action": "create_load_balancer | inject_instance_failure | ...",
  "command": "literal command or API call string, sanitized (see 6.4)",
  "explanation": "plain-English narration for the student",
  "result": { "...": "..." },
  "timestamp": "ISO8601",
  "duration_ms": 0
}
```
Every panel in the UI (diagram, command feed, narration, metrics) subscribes to this one stream and filters by `type`/`phase`. Do not introduce a second, page-specific event format — this is what keeps 8 pages consistent.

---

## 4. Tech Stack (see project spec doc for rationale)

- Frontend: **Next.js** (App Router), Tailwind CSS, Framer Motion, React Flow, xterm.js, Recharts, `socket.io-client`
- Backend: **NestJS**, `@aws-sdk/*` (v3 modular clients), `dockerode`, NestJS `WebSocketGateway` (Socket.IO)
- Agent: OpenAI GPT-5.6 / Codex via function-calling, invoked from a dedicated NestJS `AgentModule` — no heavyweight agent framework
- Storage: DynamoDB (or Postgres via Prisma/TypeORM) for session/event history
- Deployment: Vercel or AWS Amplify (frontend), ECS Fargate or single EC2 (NestJS backend)
- Shared types: a shared TypeScript package/workspace (`packages/shared-types`) for the event schema, so frontend and backend can never drift out of sync on the event contract

---

## 5. Directory Structure (proposed — monorepo)

```
/apps
  /web (Next.js)
    /app              (8 routes/pages, one folder each — App Router)
    /components        (DiagramView, CommandFeed, NarrationPanel, MetricsChart)
    /lib/socket.ts      (Socket.IO client + event bus hook)
  /api (NestJS)
    /agent              (AgentModule: orchestrator, prompts, function-calling schemas)
    /executor           (ExecutorModule: executor.service.ts, adapters/aws.adapter.ts, adapters/docker.adapter.ts)
    /concepts           (load-balancing, caching, container-orchestration modules)
    /events             (EventsGateway — Socket.IO WebSocketGateway)
    /session            (SessionModule — DynamoDB/Postgres persistence)
    /infra              (teardown scripts, cost guard jobs, IAM policy docs)
/packages
  /shared-types         (event schema + DTOs shared between web and api)
```

---

## 6. Guardrails (non-negotiable)

### 6.1 Destructive action limits
- The executor maintains an explicit allow-list of actions per concept. The agent cannot invent a new AWS action outside this list, even if the LLM suggests one.
- Any action tagged `destructive` (terminate instance, delete resource) requires it to be part of the current concept's defined failure set — never arbitrary.
- Hard block: no IAM changes, no billing changes, no deleting resources outside the sandboxed demo account/VPC, ever.

### 6.2 Cost control
- All demo resources are tagged (`project=bbf-demo`, `session_id=...`) on creation.
- A background job auto-tears down any session's resources after a fixed TTL (e.g., 20 minutes of inactivity), regardless of UI state.
- A hard AWS budget alarm is configured independently of the app — if the app fails, the alarm still fires.
- Use the smallest viable instance sizes / free-tier-eligible resources for every concept.

### 6.3 Isolation between concurrent students
- Every resource name/tag is namespaced by `session_id` to avoid collisions if two students (or a judge + a teammate) run the platform simultaneously.
- Each session gets its own VPC subnet or Docker network where feasible, to prevent one student's failure injection from affecting another's session.

### 6.4 Command sanitization
- Before any `command` field is sent to the frontend, strip credentials, account IDs if sensitive, and any secrets. Never stream raw AWS access keys, tokens, or `.env` contents even if they appear in a command's arguments.

### 6.5 LLM output validation
- The agent's proposed action must be validated against a strict JSON schema (function-calling) before the executor runs it. Reject and retry (max 2 retries) on malformed output — never pass raw LLM text straight to `executor.run`.
- If GPT-5.6/Codex API call fails, times out, or rate-limits: emit an `action_failed` event with a clear narration ("Agent temporarily unavailable, retrying…"), retry with backoff, and after 3 failures fall back to a pre-defined static fallback action for that step so the demo doesn't hang.

---

## 7. Edge Cases and Required Handling

| Edge case | Required behavior |
|---|---|
| WebSocket disconnects mid-session | Frontend auto-reconnects and requests event replay from `session_id` since last received `timestamp`; backend must persist all events so replay is possible. |
| Student refreshes browser mid-build | On reconnect, frontend rehydrates full diagram/command feed state from the session's stored event log, not from scratch. |
| AWS resource creation is slow (e.g., ALB takes minutes) | Emit intermediate `action_started`/progress narration events so the UI never looks frozen; show a progress indicator, not a spinner with no context. |
| AWS API throttling / rate limits | Executor implements exponential backoff; UI shows "waiting on AWS" narration rather than erroring immediately. |
| A concept's build step partially fails (e.g., 2 of 3 target instances created) | Emit `action_failed` for the failed sub-step, but continue the session in a degraded-but-honest state — never silently pretend it fully succeeded. |
| Student selects a failure that doesn't apply to current system state (e.g., "kill instance" before any instance exists) | Disable/hide invalid failure options in the UI based on current build state; backend re-validates regardless of what the UI sent. |
| Demo network fails during judging (no internet/AWS access) | Maintain a "fallback replay mode": a stored, real (not fabricated) event log from an earlier successful run that can be replayed through the exact same UI components, clearly labeled as a replay, as a judging-day safety net. |
| Two teammates test simultaneously and collide on shared AWS resources | Session namespacing (6.3) prevents this; document this clearly in README so testers know to use separate sessions. |
| Orphaned AWS resources after a crash | Nightly (or hourly during hackathon week) sweep script that deletes any resource tagged `project=bbf-demo` older than TTL, independent of app logic. |
| Judge tries to break the sandbox intentionally | Executor allow-list (6.1) prevents any action outside the defined concept/failure set regardless of what's requested through the UI or API directly. |
| LLM hallucinates a plausible-sounding but nonexistent AWS action | Schema validation (6.5) rejects it before execution; logged as a validation failure event for debugging, not shown to the student as if it happened. |
| Long OpenAI API latency stalls the whole demo | Set explicit request timeouts; degrade to fallback narration/action rather than blocking the event stream indefinitely. |
| Session storage grows unbounded over the week | TTL-based cleanup of old session event logs; keep only a small number of "replay" sessions intentionally curated for demo/judging use. |

---

## 8. Non-Goals / Explicitly Out of Scope for the Hackathon Build

- Full generality across "all technical work" — ship 1–3 concepts (load balancing required, caching and container orchestration as stretch) done completely, not many concepts done partially.
- User authentication/accounts beyond a simple session ID — not worth the time budget.
- Multi-region AWS support — single region only.
- Production-grade security hardening beyond the guardrails above — this is a sandboxed demo environment, not a real ops platform, and the README/demo video should say so explicitly.

---

## 9. Definition of Done (for judging readiness)

- [ ] One concept (load balancing) works end-to-end live: build → explore → break → diagnose → fix, with zero manual intervention.
- [ ] Fallback replay mode tested and works with no internet dependency.
- [ ] Teardown/cost-guard scripts verified to actually delete all demo resources.
- [ ] README documents Codex usage narrative + `/feedback` session ID per submission requirements.
- [ ] Public test instance (or credentials) provided per submission rules, confirmed accessible from a clean browser/session.
- [ ] Demo video under 3 minutes, recorded against the *live* system (not the replay fallback), with the replay kept only as a backup.
