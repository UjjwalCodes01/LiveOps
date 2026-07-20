import Link from 'next/link';
import { ReplayPlayer } from '@/components/replay/ReplayPlayer';

// The fallback replay route — plays a stored real run with no backend, AWS,
// or network dependency, so a demo can always be shown even if the live
// system is unreachable.
export const metadata = {
  title: 'Replay · Build. Break. Fix.',
};

export default function ReplayPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm font-semibold tracking-tight text-white/90">
            Build. Break. Fix.
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-white">Recorded run</h1>
          <p className="text-sm text-white/50">
            A real build → break → diagnose → fix session, replayed through the live UI. No network
            or AWS required — the judging-day safety net.
          </p>
        </div>
        <Link
          href="/concepts"
          className="shrink-0 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          Run it live instead
        </Link>
      </div>
      <ReplayPlayer />
    </main>
  );
}
