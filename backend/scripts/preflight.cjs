// One-command pre-flight check: hits GET /api/diagnostics/aws and prints a
// readable pass/fail report of whether a live build would actually succeed
// right now (creds, sandbox account, VPC, subnets, security group, AMI).
// Run this before a demo.
//
//   PREFLIGHT_URL=https://your-backend.onrender.com \
//   API_KEY=<one of API_KEYS> \
//   npm run preflight
//
// Defaults to http://localhost:4000 so it also works against a local dev
// server with no extra config.
const baseUrl = (process.env.PREFLIGHT_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const apiKey = process.env.API_KEY ?? process.env.API_KEYS?.split(',')[0]?.trim() ?? '';

async function main() {
  if (!apiKey) {
    process.stderr.write(
      'No API key. Set API_KEY (or API_KEYS) so the request can authenticate.\n',
    );
    process.exitCode = 1;
    return;
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/diagnostics/aws`, {
      headers: { 'x-api-key': apiKey },
    });
  } catch (error) {
    process.stderr.write(
      `Could not reach ${baseUrl}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    process.stderr.write(
      `Request failed (${response.status}). ${response.status === 401 || response.status === 403 ? 'Check the API key.' : ''}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const report = await response.json();
  const mark = { ok: '✓', failed: '✗', skipped: '·' };
  process.stdout.write(`\nAWS pre-flight — region ${report.region}\n\n`);
  for (const check of report.checks) {
    process.stdout.write(
      `  ${mark[check.status] ?? '?'} ${check.label}\n      ${check.detail}\n`,
    );
  }
  process.stdout.write(
    `\n${report.ready ? '✓ READY — a live build should succeed.' : '✗ NOT READY — fix the failed checks above before demoing.'}\n\n`,
  );
  process.exitCode = report.ready ? 0 : 1;
}

void main();
