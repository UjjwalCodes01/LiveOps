'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { SessionEvent } from '@/lib/types';

type Status = 'healthy' | 'warning' | 'error';

const STATUS_COLOR: Record<Status, string> = {
  healthy: 'var(--status-healthy)',
  warning: 'var(--status-warning)',
  error: 'var(--status-error)',
};
const STATUS_LABEL: Record<Status, string> = {
  healthy: 'Healthy',
  warning: 'Draining / unused',
  error: 'Unhealthy',
};

interface Observation {
  targetId: string;
  shortId: string;
  time: number;
  status: Status;
}

// Renders every real target-health observation from the event log — not a
// fabricated latency/traffic graph, since the backend only ever reports
// discrete target health states (DescribeTargetHealth), never continuous
// metrics. Each dot is a real DescribeTargetHealth/RegisterTargets/
// DeregisterTargets result.
export function TargetHealthTimeline({ events }: { events: SessionEvent[] }) {
  const observations = useMemo(() => extractObservations(events), [events]);

  if (observations.length === 0)
    return (
      <p className="flex h-full min-h-[160px] items-center justify-center text-sm text-white/40">
        No health observations yet.
      </p>
    );

  const targetIds = [...new Set(observations.map((o) => o.targetId))];
  const byTarget = new Map(targetIds.map((id, index) => [id, index]));
  const data = observations.map((o) => ({ ...o, row: byTarget.get(o.targetId) }));
  const statuses: Status[] = ['healthy', 'warning', 'error'];

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(140, targetIds.length * 44)}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value: number) =>
              new Date(value).toLocaleTimeString(undefined, { hour12: false, minute: '2-digit', second: '2-digit' })
            }
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            stroke="rgba(255,255,255,0.15)"
          />
          <YAxis
            dataKey="row"
            type="number"
            domain={[-0.5, targetIds.length - 0.5]}
            ticks={targetIds.map((_, index) => index)}
            tickFormatter={(value: number) => observations.find((o) => byTarget.get(o.targetId) === value)?.shortId ?? ''}
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
            stroke="rgba(255,255,255,0.15)"
            width={90}
          />
          <ZAxis range={[64, 64]} />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
            contentStyle={{
              background: 'rgba(10,10,14,0.9)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(_value, _name, item) => {
              const point = (item as { payload?: Observation }).payload;
              return [point ? STATUS_LABEL[point.status] : '', point?.shortId ?? ''];
            }}
            labelFormatter={(value) => new Date(Number(value)).toLocaleTimeString()}
          />
          {statuses.map((status) => (
            <Scatter
              key={status}
              data={data.filter((point) => point.status === status)}
              fill={STATUS_COLOR[status]}
              shape="circle"
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/60">
        {statuses.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[status] }}
            />
            {STATUS_LABEL[status]}
          </span>
        ))}
      </div>
    </div>
  );
}

function extractObservations(events: SessionEvent[]): Observation[] {
  const observations: Observation[] = [];
  for (const event of events) {
    if (event.type !== 'action_completed') continue;
    const time = new Date(event.timestamp).getTime();
    if (event.action === 'diagnose_target_health') {
      const result = event.result as
        | { targetHealth?: Array<{ targetId?: string; state?: string }> }
        | undefined;
      for (const entry of result?.targetHealth ?? []) {
        if (!entry.targetId) continue;
        observations.push({
          targetId: entry.targetId,
          shortId: entry.targetId.slice(-8),
          time,
          status: entry.state === 'healthy' ? 'healthy' : entry.state === 'unhealthy' ? 'error' : 'warning',
        });
      }
    }
    if (event.action === 'inject_target_failure' || event.action === 'restore_target') {
      const result = event.result as { targetId?: string; state?: string } | undefined;
      if (result?.targetId)
        observations.push({
          targetId: result.targetId,
          shortId: result.targetId.slice(-8),
          time,
          status: event.action === 'restore_target' ? 'healthy' : 'error',
        });
    }
  }
  return observations.sort((a, b) => a.time - b.time);
}
