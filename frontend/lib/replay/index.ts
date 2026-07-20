import type { SessionEvent } from '@/lib/types';
import log from './replay-log.json';

// The fallback replay mode's data — a stored, REAL event log from an earlier
// successful run (AGENT.md §"fallback replay mode"), the judging-day safety
// net for when the network/AWS is unavailable during a live demo. It ships
// EMPTY on purpose: the log must be a genuine capture, never fabricated.
// Populate it by running a real session and using the "Download this run"
// button on the completed Fix page, then committing the file over this one.
// See lib/replay/README.md.
export interface ReplayLog {
  capturedAt: string | null;
  concept: string;
  events: SessionEvent[];
}

export const REPLAY = log as unknown as ReplayLog;

// Whether a real run has actually been captured — gates the replay UI so we
// never show an empty or fake "recording".
export const hasReplay = REPLAY.events.length > 0;
