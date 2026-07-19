// Shared by both HTTP CORS (bootstrap.ts) and the Socket.IO gateway
// (events/socket-io.adapter.ts) so the two can never drift into allowing
// different origins. Supports a `*` wildcard per entry (e.g.
// `https://*.vercel.app`) so Vercel's per-branch preview deployments,
// which each get their own generated subdomain, don't need to be listed
// individually in CORS_ORIGINS.
export function createOriginMatcher(
  patterns: string[],
): (origin: string | undefined) => boolean {
  const matchers = patterns.map((pattern): ((origin: string) => boolean) => {
    if (!pattern.includes('*')) return (origin) => origin === pattern;
    const regex = new RegExp(
      `^${pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );
    return (origin) => regex.test(origin);
  });

  return function isAllowedOrigin(origin: string | undefined): boolean {
    // No Origin header means a non-browser client (server-to-server, curl,
    // the AWS integration test) — CORS is a browser-enforced mechanism, so
    // there's nothing to restrict here; x-api-key still gates the request.
    if (!origin) return true;
    return matchers.some((matches) => matches(origin));
  };
}
