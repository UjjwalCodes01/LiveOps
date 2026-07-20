import { describe, expect, it } from 'vitest';
import { deriveInfraHealth } from './topology';

// Covers the G3 fix: the ALB and target group reflect real target health
// instead of always showing "healthy".
describe('deriveInfraHealth', () => {
  it('is fully healthy when every target is healthy', () => {
    expect(deriveInfraHealth(['healthy', 'healthy', 'healthy'])).toEqual({
      loadBalancer: 'healthy',
      targetGroup: 'healthy',
    });
  });

  it('degrades the target group but keeps the LB healthy when one target is down', () => {
    // The classic break: one target lost, two still serving.
    expect(deriveInfraHealth(['healthy', 'error', 'healthy'])).toEqual({
      loadBalancer: 'healthy',
      targetGroup: 'warning',
    });
  });

  it('errors the group and warns the LB when no target is healthy', () => {
    expect(deriveInfraHealth(['error', 'error', 'error'])).toEqual({
      loadBalancer: 'warning',
      targetGroup: 'error',
    });
  });

  it('treats a mix of pending/warning (none healthy yet) as no serving capacity', () => {
    expect(deriveInfraHealth(['pending', 'warning'])).toEqual({
      loadBalancer: 'warning',
      targetGroup: 'error',
    });
  });
});
