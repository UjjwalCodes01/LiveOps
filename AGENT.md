# Build. Break. Fix. architecture and guardrails

Build. Break. Fix. teaches cloud reliability by running a disposable AWS
Application Load Balancer lesson: build three EC2 targets, inspect the real
state, deregister one target, diagnose it from `DescribeTargetHealth`, and
restore it.

## Request path

1. The Next.js client creates an anonymous session and retains its scoped
   access token in that browser only.
2. It asks `AgentService` to execute a phase. The agent emits narration and
   sends the selected, allow-listed action to `OrchestrationService`.
3. The orchestration state machine takes a Postgres-backed operation lock,
   executes the action through `ExecutorService`, and persists the resulting
   event stream.
4. `AwsAdapter` performs the AWS SDK calls. `EventsService` sanitizes and
   persists each event before Socket.IO publishes it to the session room.
5. The React UI uses that same stream for the command feed, topology, target
   health, lesson completion, and GPT-5.6 root-cause callout.

## Safety model

- The agent never receives arbitrary AWS access: each phase permits only its
  verified action in `backend/src/executor/actions.ts`.
- AWS execution verifies the configured sandbox account via STS before acting.
- Sessions have access tokens, database operation locks, per-route throttles,
  a live-session concurrency cap, TTL cleanup, and explicit teardown.
- Events redact account IDs and common credential/token fields before storage
  and delivery.
- The `/replay` route is a visibly labelled recording of a completed real run;
  it is never presented as live infrastructure.

## GPT-5.6

GPT-5.6 is used for constrained phase narration and to interpret live target
health data after diagnosis. Its output is best-effort enrichment: the raw AWS
telemetry and deterministic safety controls remain authoritative.
