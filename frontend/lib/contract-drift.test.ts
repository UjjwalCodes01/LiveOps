import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The frontend's event contract (lib/types.ts) is hand-mirrored from the
// backend rather than shared via a package (AGENT.md proposes a shared-types
// workspace; a full monorepo restructure is disproportionate risk near a
// deadline for a working, deployed app). This guard is the cheaper safety
// net: it reads both source files and fails if the event enums drift, so the
// two can't silently disagree on the wire contract. If a shared package is
// adopted later, this test can be deleted.

const FRONTEND = join(process.cwd(), 'lib', 'types.ts');
const BACKEND_DOMAIN = join(process.cwd(), '..', 'backend', 'src', 'events', 'domain.ts');
const BACKEND_ACTIONS = join(process.cwd(), '..', 'backend', 'src', 'executor', 'actions.ts');

function stringArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!match) throw new Error(`could not find "${name}" array`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort();
}

// Skip gracefully if the backend isn't checked out alongside the frontend
// (e.g. someone builds the frontend in isolation). In CI the whole repo is
// present, so the guard runs.
const backendPresent = existsSync(BACKEND_DOMAIN) && existsSync(BACKEND_ACTIONS);

describe.runIf(backendPresent)('frontend/backend event contract', () => {
  const frontend = readFileSync(FRONTEND, 'utf8');
  const domain = readFileSync(BACKEND_DOMAIN, 'utf8');
  const actions = readFileSync(BACKEND_ACTIONS, 'utf8');

  it('PHASES match', () => {
    expect(stringArray(frontend, 'PHASES')).toEqual(stringArray(domain, 'PHASES'));
  });

  it('EVENT_TYPES match', () => {
    expect(stringArray(frontend, 'EVENT_TYPES')).toEqual(stringArray(domain, 'EVENT_TYPES'));
  });

  it('ACTIONS match', () => {
    expect(stringArray(frontend, 'ACTIONS')).toEqual(stringArray(actions, 'ACTIONS'));
  });
});
