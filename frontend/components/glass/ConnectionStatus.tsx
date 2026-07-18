import { Loader2, RadioTower, WifiOff, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

const CONFIG: Record<ConnectionState, { label: string; dot: string; icon: LucideIcon; spin?: boolean }> = {
  connecting: { label: 'Connecting…', dot: 'bg-status-warning', icon: Loader2, spin: true },
  connected: { label: 'Live', dot: 'bg-status-healthy', icon: RadioTower },
  disconnected: { label: 'Reconnecting…', dot: 'bg-status-warning', icon: WifiOff },
  error: { label: 'Connection error', dot: 'bg-status-error', icon: XCircle },
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const config = CONFIG[state];
  const Icon = config.icon;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur-md">
      <span className="relative flex h-2 w-2">
        {state === 'connected' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-healthy opacity-60" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`} />
      </span>
      <Icon className={`h-3 w-3 ${config.spin ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}
