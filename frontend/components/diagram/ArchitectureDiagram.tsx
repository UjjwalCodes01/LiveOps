'use client';

import '@xyflow/react/dist/style.css';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { useMemo } from 'react';
import type { SessionEvent } from '@/lib/types';

interface ProvisionResult {
  loadBalancerArn?: string;
  dnsName?: string;
  state?: string;
  targetGroupArn?: string;
  instanceIds?: string[];
}
interface TargetHealthEntry {
  targetId?: string;
  state?: string;
  reason?: string;
}

type NodeStatus = 'pending' | 'healthy' | 'warning' | 'error';

export interface ResourceDetails {
  id: string;
  kind: 'load_balancer' | 'target_group' | 'instance';
  title: string;
  status: NodeStatus;
  attributes: Array<{ label: string; value: string }>;
  neighbors: string[];
}

const STATUS_STYLE: Record<NodeStatus, { background: string; border: string; color: string }> = {
  pending: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff' },
  healthy: { background: 'rgba(52,211,153,0.16)', border: '1px solid rgba(52,211,153,0.6)', color: '#fff' },
  warning: { background: 'rgba(251,191,36,0.16)', border: '1px solid rgba(251,191,36,0.6)', color: '#fff' },
  error: { background: 'rgba(251,113,133,0.18)', border: '1px solid rgba(251,113,133,0.65)', color: '#fff' },
};

function nodeStyle(status: NodeStatus, selected: boolean) {
  return {
    ...STATUS_STYLE[status],
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    backdropFilter: 'blur(8px)',
    outline: selected ? '2px solid rgba(255,255,255,0.8)' : 'none',
    outlineOffset: 2,
    cursor: 'pointer',
  };
}

function findLatestResult(
  events: SessionEvent[],
  action: string,
): Record<string, unknown> | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.type === 'action_completed' && event.action === action) return event.result;
  }
  return undefined;
}

export function ArchitectureDiagram({
  events,
  onNodeSelect,
  selectedNodeId,
}: {
  events: SessionEvent[];
  onNodeSelect?: (details: ResourceDetails) => void;
  selectedNodeId?: string;
}) {
  const { nodes, edges, built, details } = useMemo(() => buildGraph(events, selectedNodeId), [events, selectedNodeId]);

  if (!built)
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-white/40">
        Nothing built yet — run the build phase to see the live architecture.
      </div>
    );

  return (
    <div className="h-full min-h-[320px] overflow-hidden rounded-xl">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_event, node) => {
          const nodeDetails = details.get(node.id);
          if (nodeDetails) onNodeSelect?.(nodeDetails);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255,255,255,0.08)" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function buildGraph(
  events: SessionEvent[],
  selectedNodeId: string | undefined,
): { nodes: Node[]; edges: Edge[]; built: boolean; details: Map<string, ResourceDetails> } {
  const details = new Map<string, ResourceDetails>();
  const provisioned = findLatestResult(events, 'provision_load_balancer') as
    | ProvisionResult
    | undefined;
  if (!provisioned?.instanceIds?.length) return { nodes: [], edges: [], built: false, details };

  const instanceIds = provisioned.instanceIds;
  const healthByInstance = new Map<string, NodeStatus>();
  const reasonByInstance = new Map<string, string>();
  instanceIds.forEach((id) => healthByInstance.set(id, 'healthy'));

  for (const event of events) {
    if (event.type !== 'action_completed') continue;
    if (event.action === 'inject_target_failure') {
      const result = event.result as { targetId?: string } | undefined;
      if (result?.targetId) healthByInstance.set(result.targetId, 'error');
    }
    if (event.action === 'restore_target') {
      const result = event.result as { targetId?: string } | undefined;
      if (result?.targetId) healthByInstance.set(result.targetId, 'healthy');
    }
    if (event.action === 'diagnose_target_health') {
      const result = event.result as { targetHealth?: TargetHealthEntry[] } | undefined;
      for (const entry of result?.targetHealth ?? []) {
        if (!entry.targetId) continue;
        healthByInstance.set(
          entry.targetId,
          entry.state === 'healthy' ? 'healthy' : entry.state === 'unhealthy' ? 'error' : 'warning',
        );
        if (entry.reason) reasonByInstance.set(entry.targetId, entry.reason);
      }
    }
  }

  details.set('lb', {
    id: 'lb',
    kind: 'load_balancer',
    title: 'Application Load Balancer',
    status: 'healthy',
    attributes: [
      { label: 'DNS name', value: provisioned.dnsName ?? 'unknown' },
      { label: 'State', value: provisioned.state ?? 'unknown' },
      { label: 'ARN', value: provisioned.loadBalancerArn ?? 'unknown' },
    ],
    neighbors: ['tg'],
  });
  details.set('tg', {
    id: 'tg',
    kind: 'target_group',
    title: 'Target Group',
    status: 'healthy',
    attributes: [{ label: 'ARN', value: provisioned.targetGroupArn ?? 'unknown' }],
    neighbors: ['lb', ...instanceIds],
  });
  for (const id of instanceIds) {
    const status = healthByInstance.get(id) ?? 'pending';
    details.set(id, {
      id,
      kind: 'instance',
      title: `EC2 target · ${id}`,
      status,
      attributes: [
        { label: 'Health', value: status },
        ...(reasonByInstance.has(id) ? [{ label: 'Reason', value: reasonByInstance.get(id)! }] : []),
      ],
      neighbors: ['tg'],
    });
  }

  const columnX = { lb: 0, tg: 260, instances: 520 };
  const nodes: Node[] = [
    {
      id: 'lb',
      position: { x: columnX.lb, y: instanceIds.length * 40 },
      data: { label: `Application Load Balancer\n${provisioned.dnsName ?? ''}` },
      style: nodeStyle('healthy', selectedNodeId === 'lb'),
    },
    {
      id: 'tg',
      position: { x: columnX.tg, y: instanceIds.length * 40 },
      data: { label: 'Target Group' },
      style: nodeStyle('healthy', selectedNodeId === 'tg'),
    },
    ...instanceIds.map((id, index) => ({
      id,
      position: { x: columnX.instances, y: index * 90 },
      data: { label: `EC2 · ${id}` },
      style: nodeStyle(healthByInstance.get(id) ?? 'pending', selectedNodeId === id),
    })),
  ];

  const edges: Edge[] = [
    { id: 'lb-tg', source: 'lb', target: 'tg', animated: true, style: { stroke: 'rgba(255,255,255,0.3)' } },
    ...instanceIds.map((id) => ({
      id: `tg-${id}`,
      source: 'tg',
      target: id,
      animated: healthByInstance.get(id) === 'healthy',
      style: {
        stroke:
          healthByInstance.get(id) === 'error'
            ? 'rgba(251,113,133,0.7)'
            : 'rgba(255,255,255,0.3)',
      },
    })),
  ];

  return { nodes, edges, built: true, details };
}
