export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

const CONFIG: Record<ConnectionState, { label: string; dot: string }> = {
  connecting: { label: 'Connecting…', dot: 'bg-status-warning animate-pulse' },
  connected: { label: 'Live', dot: 'bg-status-healthy' },
  disconnected: { label: 'Reconnecting…', dot: 'bg-status-warning animate-pulse' },
  error: { label: 'Connection error', dot: 'bg-status-error' },
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const config = CONFIG[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur-md">
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
