'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, Circle, Server, Cpu, Layers } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type DiagramNodeStatus = 'pending' | 'healthy' | 'warning' | 'error';
export type DiagramNodeKind = 'load_balancer' | 'target_group' | 'instance';

export interface DiagramNodeData extends Record<string, unknown> {
  title: string;
  subtitle?: string;
  status: DiagramNodeStatus;
  kind: DiagramNodeKind;
  selected?: boolean;
}

const KIND_ICON = { load_balancer: Server, target_group: Layers, instance: Cpu };
const STATUS_ICON = { pending: Circle, healthy: CheckCircle2, warning: AlertTriangle, error: AlertTriangle };
const STATUS_COLOR: Record<DiagramNodeStatus, string> = {
  pending: 'rgba(255,255,255,0.4)',
  healthy: 'var(--status-healthy)',
  warning: 'var(--status-warning)',
  error: 'var(--status-error)',
};
const STATUS_BG: Record<DiagramNodeStatus, string> = {
  pending: 'rgba(255,255,255,0.05)',
  healthy: 'rgba(12,163,12,0.14)',
  warning: 'rgba(250,178,25,0.14)',
  error: 'rgba(208,59,59,0.16)',
};

export function DiagramNode({ data }: NodeProps & { data: DiagramNodeData }) {
  const KindIcon = KIND_ICON[data.kind];
  const StatusIcon = STATUS_ICON[data.status];
  const prevStatus = useRef(data.status);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (prevStatus.current !== data.status) {
      prevStatus.current = data.status;
      setPulsing(true);
      const timer = window.setTimeout(() => setPulsing(false), 900);
      return () => window.clearTimeout(timer);
    }
  }, [data.status]);

  return (
    <div
      className="flex min-w-[168px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 backdrop-blur-md transition-transform hover:scale-[1.03]"
      style={{
        background: STATUS_BG[data.status],
        borderColor: data.selected ? 'rgba(255,255,255,0.85)' : `${STATUS_COLOR[data.status]}55`,
        color: STATUS_COLOR[data.status],
        animation: pulsing ? 'node-pulse 0.9s ease-out' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <KindIcon className="h-4 w-4" style={{ color: STATUS_COLOR[data.status] }} />
      </span>
      <div className="min-w-0 font-[family-name:var(--font-mono)]">
        <p className="truncate text-xs font-medium text-white">{data.title}</p>
        {data.subtitle && <p className="truncate text-[10px] text-white/40">{data.subtitle}</p>}
      </div>
      <StatusIcon className="ml-auto h-3.5 w-3.5 shrink-0" style={{ color: STATUS_COLOR[data.status] }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
