# Build. Break. Fix.
### Learn Infrastructure by Watching It Happen — Live

**Track:** Education
**Built with:** OpenAI Codex + GPT-5.6
**Team:** Backend/Autonomous Systems · Frontend/UI-UX · DevOps/Infra & AWS

---

## 1. The Problem

Infrastructure and systems concepts — load balancing, caching, replication, container orchestration — are almost always taught through static slides, pre-recorded videos, or read-only diagrams. Students memorize *what* a load balancer does, but never watch one get created, never see it break, and never see someone actually fix it. The gap between "I understand the concept" and "I could operate this in production" stays huge, because nothing in traditional infra education shows the real commands, the real failures, or the real recovery process.

**Build. Break. Fix.** closes that gap by turning an AI agent's real, live actions on real infrastructure into the lesson itself. Nothing is staged or pre-recorded — every diagram update, every command, every failure, and every fix the student sees is happening in that moment, driven by Codex/GPT-5.6 operating actual AWS resources (and containerized/local systems) in response to the student's choices.

---

## 2. The Core Idea, In One Loop

1. **Choose** — student picks a concept ("load balancing," "caching," "container orchestration," "database replication").
2. **Build** — the agent provisions a real, minimal working system for that concept, narrating every action as it happens.
3. **Explore** — student clicks around the live architecture to understand what was just built and why.
4. **Break** — student chooses a failure to inject; the agent shows the exact mechanism of the failure as it applies it.
5. **Diagnose** — the agent investigates the failure live, showing its reasoning step by step.
6. **Fix** — the agent remediates (or guides the student to), and the system visibly recovers.
7. **Reflect** — student's learning history, concepts covered, and mastery are tracked and shown back to them.

Every one of these seven steps is a real event flowing through the same pipeline — nothing is a canned animation.

---

## 3. Why This Is Technically Non-Trivial

The hard engineering problem isn't "call the AWS API" — it's making *every* agent action, across totally different underlying technologies (AWS SDK calls, Docker commands, database operations), show up in the UI through one consistent, honest, real-time channel. That's solved with an **instrumented executor pattern**:

- Every action the agent wants to take (create a resource, inject a failure, run a diagnostic, apply a fix) passes through a single execution layer.
- That layer emits a structured event *before* running the action (what it's about to do and why) and *after* (the real result), regardless of whether the underlying action was a `boto3` call, a `docker` command, or a database query.
- The frontend never special-cases "this is a load balancer" vs. "this is a cache" — it renders any event from the same schema, which is what makes the platform genuinely extensible beyond AWS.

This is the technical core the judges will see: a real orchestration and event pipeline, not a chatbot with a nice skin.

---

## 4. Tech Stack

### Frontend
| Layer | Choice | Why |
|---|---|---|
| Framework | **React (Vite)** | Fast dev loop, component-driven, easy to split 8 pages across the team |
| Styling | **Tailwind CSS** | Rapid, consistent, professional styling under time pressure |
| Animation | **Framer Motion** | Makes resource creation, failure injection, and recovery feel alive — nodes fade/pop/pulse instead of just appearing |
| Architecture diagram | **React Flow** | Interactive, clickable, live-updating node/edge graph — perfect for "watch the system get built" |
| Command feed / terminal | **xterm.js** (or a custom scrolling log component) | Shows the literal commands/API calls as they execute |
| Charts / metrics | **Recharts** | Live health, latency, and traffic visualizations during failure/recovery |
| Realtime transport | **native WebSocket / socket.io-client** | Keeps diagram, command feed, and narration panel in perfect sync off one event stream |
| Routing | **React Router** | Powers the 8-page structure below |

### Backend
| Layer | Choice | Why |
|---|---|---|
| API/orchestration server | **Python (FastAPI)** | Clean async support for WebSockets, and pairs naturally with `boto3` for AWS calls |
| Agent orchestration | **OpenAI Codex / GPT-5.6 API**, direct function-calling loop (no heavy framework) | Full team visibility and control over every action — no black-box agent framework hiding "how Codex was used," which matters for judging |
| Instrumented executor | Custom Python module | Wraps every AWS/Docker/DB action with pre/post event emission |
| Realtime layer | **WebSockets (FastAPI native)** | Streams the structured event feed to the frontend |
| Session/progress storage | **DynamoDB** (or Postgres if the team prefers relational) | Stores student sessions, concepts completed, event history for replay |
| Infra provisioning | **boto3 (AWS SDK)** + lightweight **Terraform** for a couple of concepts where declarative provisioning tells a cleaner story | Real resource creation, not mocked |
| Containerized demos | **Docker SDK for Python** | Powers the non-AWS concepts (e.g., container orchestration, local caching) so the platform isn't purely AWS-locked |

### Infrastructure (what actually gets built live, per concept)
- **Load Balancing** → real Application Load Balancer + 3 EC2/ECS targets
- **Caching** → Redis container in front of a small API, with cache-hit/miss visualized live
- **Container Orchestration** → small Docker Compose / ECS cluster, scaling and failover shown live
- *(Stretch)* **Replication** → simple primary/replica DB setup showing replication lag and failover

### Deployment
- Frontend: **AWS Amplify** or **Vercel**
- Backend: **AWS ECS (Fargate)** or a single EC2 instance for the hackathon window
- Teardown scripts included so demo resources don't run (or cost) indefinitely

---

## 5. The Website: 8 Pages, Each With Its Own Job

This is not a single-screen demo — it's a full learning platform. Every page has a distinct purpose so a student's journey feels like progress, not a single gimmick.

### Page 1 — Landing / Home
The pitch, in motion. A live, looping mini-preview (real recorded event stream, replayed) of a load balancer being built and then failing/recovering, so a visitor understands the concept before reading a word. CTA: "Pick something to learn."

### Page 2 — Concept Selection
A card grid of concepts (Load Balancing, Caching, Container Orchestration, Replication). Each card shows difficulty, estimated time, and a one-line "what you'll actually see happen." This is the student's learning path entry point.

### Page 3 — Build Studio (the heart of the platform)
Three synchronized live panels:
- **Architecture diagram** (React Flow) — nodes/edges appear as real resources come online
- **Command feed** — the literal AWS/Docker command just executed
- **Narration panel** — plain-English explanation of what just happened and why

This page alone demonstrates the core technical achievement to judges.

### Page 4 — Architecture Explorer
Once built, the student can click any node in the diagram to open a detail panel: what this resource is, its current config/state, and how it connects to its neighbors. Turns the "finished build" into an explorable reference, not just a memory of what streamed by.

### Page 5 — Failure Injection Lab
A curated list of realistic failures for the current concept ("kill an instance," "spike traffic," "add network latency," "corrupt a cache entry"). Selecting one shows the exact injection mechanism (command + explanation) before and as it runs, with the architecture diagram reacting live (a node turns red, a metric spikes).

### Page 6 — Diagnosis Console
A step-by-step, timestamped feed of the agent's actual investigation: which logs/metrics it pulled, what it ruled out, what hypothesis it formed and why. This is where "black box AI" becomes "transparent reasoning trace" — arguably the single most differentiating page for judges.

### Page 7 — Fix & Recovery
Shows the remediation action chosen, the exact command applied, and a live before/after comparison (latency graph recovering, node turning green again, traffic rebalancing). Ends with a plain-English summary connecting the failure → diagnosis → fix into one coherent story.

### Page 8 — Progress & Mastery Dashboard
A student-facing history: concepts completed, failures diagnosed correctly, badges/streaks, and a replay list of past sessions (pulling from stored event logs). Gives the platform a sense of continuity and progression rather than being a one-off demo toy — this is what makes it feel like a real learning product, not a single trick.

---

## 6. Making It Feel "Lively," Not Static

- Every resource creation animates in (Framer Motion) rather than snapping into place.
- The command feed types out character-by-character like a real terminal, not a static text block.
- Health/latency metrics update continuously with small live-chart motion, even during idle build steps.
- Color state changes (green → yellow → red → green) on nodes give instant visual feedback during failure/recovery.
- Sound-free but motion-rich micro-interactions (hover states, click ripples, progress pulses) keep the platform feeling active rather than like a passive report.

---

## 7. Team Roles

| Person | Owns |
|---|---|
| **Backend / Autonomous Systems** | Agent orchestration loop, instrumented executor, event schema, WebSocket server, diagnosis/fix logic |
| **Frontend / UI-UX** | All 8 pages, React Flow diagram, command feed, narration panel, animations, mastery dashboard |
| **DevOps / Infra (you)** | Real AWS resources per concept, Docker setups, teardown/cost-control scripts, deployment, demo environment reliability |

---

## 8. Why This Aligns With the Judging Criteria

- **Technological Implementation** — a real orchestration pipeline (instrumented executor + structured event stream) operating genuine AWS/Docker infrastructure via Codex/GPT-5.6, not a static Q&A bot.
- **Design** — 8 distinct, purposeful pages forming a coherent learning product with a real journey (choose → build → explore → break → diagnose → fix → track progress), not a single proof-of-concept screen.
- **Potential Impact** — a specific, named gap in infra education (concepts taught abstractly, never through live real-system behavior), aimed at a clear audience (students learning DevOps/infra/systems concepts).
- **Quality of the Idea** — "watch the AI build it, break it, and fix it, live" is a distinctive, one-sentence-pitchable concept that differs clearly from typical AI-tutor or slide-based learning tools.

---

## 9. Build Plan (6 Days)

- **Day 1:** Finalize event schema; scaffold FastAPI + React apps; deploy one AWS concept target (load balancer) manually to confirm the resource pattern.
- **Day 2–3:** Backend teammate builds instrumented executor + agent loop for Build/Break/Diagnose/Fix on the load balancing concept end-to-end.
- **Day 3–4:** Frontend teammate builds Pages 3, 5, 6, 7 (the live core) wired to real events; you keep AWS environment stable and add the second concept (caching).
- **Day 5:** Add remaining pages (1, 2, 4, 8), polish animations, add container orchestration as the third concept if time allows.
- **Day 6:** Record demo video, deploy public test instance, write README (Codex-usage narrative + `/feedback` session ID), final QA and teardown safety checks.
