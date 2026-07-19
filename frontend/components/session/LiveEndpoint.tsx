'use client';

import { Check, Copy, ExternalLink, Radio } from 'lucide-react';
import { useState } from 'react';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { useSession } from '@/components/session/SessionProvider';
import type { SessionEvent } from '@/lib/types';

// The "it's real, not a diagram" proof. The provision result carries the
// load balancer's public DNS name (and the health path it serves), streamed
// in over the event feed. This surfaces it as an openable link, so a learner
// — or a judge — can hit the actual Application Load Balancer on AWS and get
// a live response served by one of the three EC2 targets. Renders nothing
// until a build has produced a DNS name.
function latestResult(events: SessionEvent[], action: string): SessionEvent['result'] {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.type === 'action_completed' && event.action === action) return event.result;
  }
  return undefined;
}

export function LiveEndpoint() {
  const { events } = useSession();
  const [copied, setCopied] = useState(false);

  const result = latestResult(events, 'provision_load_balancer');
  const dnsName = typeof result?.dnsName === 'string' ? result.dnsName : undefined;
  if (!dnsName) return null;

  const rawPath = typeof result?.healthPath === 'string' && result.healthPath ? result.healthPath : '/health';
  const healthPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const url = `http://${dnsName}${healthPath}`;

  async function copyDns() {
    try {
      await navigator.clipboard.writeText(dnsName!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context / permissions) — the
      // DNS is still visible and the open link still works, so just no-op.
    }
  }

  return (
    <GlassPanel className="flex flex-col gap-3 p-5" delay={0.12}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-healthy/15 text-status-healthy">
          <Radio className="h-4 w-4" />
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-status-healthy">
            Live endpoint
          </div>
          <h3 className="text-sm font-semibold text-white">
            Your real load balancer, on the public internet
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-white/80">{dnsName}</code>
        <button
          type="button"
          onClick={copyDns}
          aria-label="Copy load balancer DNS name"
          className="shrink-0 text-white/40 transition-colors hover:text-white"
        >
          {copied ? (
            <Check className="h-4 w-4 text-status-healthy" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-status-healthy/40 bg-status-healthy/10 px-3 py-2 text-sm font-medium text-status-healthy transition-colors hover:bg-status-healthy/20"
      >
        <ExternalLink className="h-4 w-4" />
        Open the live endpoint
      </a>

      <p className="text-xs leading-relaxed text-white/50">
        This is the real Application Load Balancer the agent just provisioned on AWS. Open it for a
        live response served by one of the three EC2 targets — proof the system is genuinely
        running, not a simulation.
      </p>
    </GlassPanel>
  );
}
