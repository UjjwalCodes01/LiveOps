'use client';

import { Download } from 'lucide-react';
import { useSession } from '@/components/session/SessionProvider';

// Capture path for the fallback replay: once a session completes, download
// its real event log as replay-log.json. Commit that file over
// lib/replay/replay-log.json to turn a genuine run into the replay — the
// events come straight from what actually streamed to this browser, so
// nothing is fabricated. Only appears on a completed session.
export function DownloadReplay() {
  const { session, events } = useSession();
  if (!session || session.state !== 'completed') return null;

  function download() {
    const log = {
      capturedAt: new Date().toISOString(),
      concept: session!.concept,
      events,
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'replay-log.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-2 self-start rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      <Download className="h-4 w-4" />
      Download this run (for replay mode)
    </button>
  );
}
