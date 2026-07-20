// Runs one full session against the deployed backend (build → break →
// diagnose → fix), then saves its REAL event log as the fallback replay
// (frontend/lib/replay/replay-log.json). Provisions real AWS resources that
// auto-clean on their TTL. Run with the backend .env loaded:
//   node -r dotenv/config scripts/run-and-capture-replay.cjs dotenv_config_path=.env
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const BASE = (process.env.PREFLIGHT_URL || 'https://liveops.onrender.com').replace(/\/+$/, '');
const API_KEY = (process.env.API_KEYS || '').split(',')[0]?.trim();
const OUT = join(__dirname, '..', '..', 'frontend', 'lib', 'replay', 'replay-log.json');

const PHASES = [
  { phase: 'build', expect: 'ready' },
  { phase: 'break', expect: 'broken' },
  { phase: 'diagnose', expect: 'diagnosing' },
  { phase: 'fix', expect: 'completed' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!API_KEY) throw new Error('API_KEYS is required in the environment.');
  const headers = { 'x-api-key': API_KEY, 'content-type': 'application/json' };

  process.stdout.write(`Creating a session on ${BASE} …\n`);
  const created = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers }).then((r) =>
    r.json(),
  );
  const sessionId = created.session.id;
  const token = created.accessToken;
  const authed = { ...headers, 'x-session-token': token };
  process.stdout.write(`  session ${sessionId}\n`);

  for (const { phase, expect } of PHASES) {
    process.stdout.write(`Running ${phase} … (real AWS, may take a few minutes)\n`);
    const state = await runPhase(sessionId, authed, phase, expect);
    process.stdout.write(`  ${phase} → ${state}\n`);
    if (state !== expect)
      throw new Error(`Phase ${phase} ended in "${state}", expected "${expect}".`);
  }

  const events = await fetch(`${BASE}/api/sessions/${sessionId}/events`, { headers: authed }).then(
    (r) => r.json(),
  );
  const phases = [...new Set(events.map((e) => e.phase))];
  const log = {
    capturedAt: events.length ? events[events.length - 1].timestamp : null,
    concept: created.session.concept,
    events,
  };
  writeFileSync(OUT, `${JSON.stringify(log, null, 2)}\n`);
  process.stdout.write(
    `\nCaptured ${events.length} events (phases: ${phases.join(', ')})\n  written: ${OUT}\n`,
  );
}

// POST the phase with a long timeout. If the connection drops (proxy cutoff)
// the backend keeps running the phase, so fall back to polling the session
// state until it reaches the expected value.
async function runPhase(sessionId, authed, phase, expect) {
  try {
    const response = await fetch(`${BASE}/api/sessions/${sessionId}/agent/execute`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ phase }),
      signal: AbortSignal.timeout(340_000),
    });
    if (response.ok) {
      const body = await response.json();
      return body.session.state;
    }
    process.stdout.write(`  (execute returned ${response.status}; polling state…)\n`);
  } catch (error) {
    process.stdout.write(`  (execute connection ended: ${error.message}; polling state…)\n`);
  }
  return pollUntil(sessionId, authed, expect);
}

async function pollUntil(sessionId, authed, expect) {
  const deadline = Date.now() + 300_000;
  for (;;) {
    await sleep(5_000);
    const session = await fetch(`${BASE}/api/sessions/${sessionId}`, { headers: authed }).then(
      (r) => r.json(),
    );
    if (session.state === expect || session.state === 'failed') return session.state;
    if (Date.now() > deadline) return session.state;
  }
}

main().catch((error) => {
  process.stderr.write(`\nCapture failed: ${error.message}\n`);
  process.exitCode = 1;
});
