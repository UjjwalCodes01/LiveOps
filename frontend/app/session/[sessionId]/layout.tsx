import { SessionShell } from '@/components/session/SessionShell';

// params is a Promise in Next.js 16 — must be awaited (see the frontend
// build plan for why this differs from older Next.js versions).
export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionShell sessionId={sessionId}>{children}</SessionShell>;
}
