import type { DiagramNodeStatus } from '@/components/diagram/DiagramNode';

// Derives the load balancer and target group health from the real,
// event-driven health of their targets — so the diagram reflects actual
// state (a degraded group, a load balancer with no healthy backend) instead
// of always showing green. Pure and self-contained so it's unit-testable
// without rendering the diagram.
//
// - Target group: healthy only if every member is healthy; error if none
//   are; warning if partially degraded (some down, some up).
// - Load balancer: healthy while at least one target can serve; warning when
//   none can (it's up but has nothing to route to).
export function deriveInfraHealth(instanceStatuses: DiagramNodeStatus[]): {
  loadBalancer: DiagramNodeStatus;
  targetGroup: DiagramNodeStatus;
} {
  const healthyCount = instanceStatuses.filter((status) => status === 'healthy').length;
  const allHealthy =
    instanceStatuses.length > 0 && healthyCount === instanceStatuses.length;

  const targetGroup: DiagramNodeStatus = allHealthy
    ? 'healthy'
    : healthyCount === 0
      ? 'error'
      : 'warning';
  const loadBalancer: DiagramNodeStatus = healthyCount === 0 ? 'warning' : 'healthy';

  return { loadBalancer, targetGroup };
}
