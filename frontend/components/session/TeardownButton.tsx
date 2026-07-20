'use client';

import { AlertTriangle, Check, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';

// Explicit "Reset / Teardown" for a finished demo — lets an authorized user
// (this browser holds the session's access token) delete the session's AWS
// resources on demand instead of waiting for the TTL cron. Two-step confirm
// because it's destructive; the cleanup itself streams into the command feed
// as narrated events. Only appears on completed/failed sessions.
export function TeardownButton() {
  const { session, events, teardown, tearingDown, teardownError } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  if (!session || (session.state !== 'completed' && session.state !== 'failed')) return null;

  // Authoritative across refreshes: the replayed event log is the source of
  // truth, so a completed teardown stays reflected even after reload rather
  // than offering the button again.
  const alreadyTornDown =
    done ||
    events.some(
      (event) => event.type === 'action_completed' && event.action === 'teardown_session',
    );

  async function confirmTeardown() {
    setConfirming(false);
    await teardown();
    setDone(true);
  }

  if (alreadyTornDown && !teardownError) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-status-healthy/40 bg-status-healthy/10 px-2.5 py-1 text-[11px] font-medium text-status-healthy">
        <Check className="h-3 w-3" /> Resources torn down
      </span>
    );
  }

  if (tearingDown) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/70">
        <Loader2 className="h-3 w-3 animate-spin" /> Tearing down…
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-status-error/40 bg-status-error/10 px-2.5 py-1 text-[11px]">
        <span className="text-white/80">Delete this session&rsquo;s AWS resources?</span>
        <button
          type="button"
          onClick={confirmTeardown}
          className="font-semibold text-status-error hover:underline"
        >
          Tear down
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-white/50 transition-colors hover:text-white/80"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/60 transition-colors hover:border-status-error/40 hover:text-status-error"
      >
        <Trash2 className="h-3 w-3" /> Reset / Teardown
      </button>
      {teardownError && (
        <span className="inline-flex items-center gap-1 text-[11px] text-status-error">
          <AlertTriangle className="h-3 w-3" /> {teardownError}
        </span>
      )}
    </div>
  );
}
