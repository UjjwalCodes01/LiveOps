import { describe, expect, it } from 'vitest';
import { friendlyAction, friendlyCommand, friendlyExplanation } from './humanize';

describe('friendlyAction', () => {
  it('maps known actions to friendly labels', () => {
    expect(friendlyAction('provision_load_balancer')).toBe('Setting up the load balancer');
    expect(friendlyAction('inject_target_failure')).toBe('Simulating a server failure');
  });

  it('falls back to a de-underscored label for unknown actions', () => {
    expect(friendlyAction('some_new_action')).toBe('some new action');
  });

  it('returns undefined when no action is given', () => {
    expect(friendlyAction(undefined)).toBeUndefined();
  });
});

describe('friendlyExplanation', () => {
  it('strips the "Action failed:" prefix and keeps the message', () => {
    const result = friendlyExplanation('Action failed: something broke');
    expect(result.text).toBe('something broke');
    expect(result.technical).toBe('Action failed: something broke');
  });

  it('strips URLs out of raw errors', () => {
    const result = friendlyExplanation('See https://example.com/docs for details');
    expect(result.text).not.toContain('http');
  });

  it('passes through clean text unchanged with no technical duplicate', () => {
    const result = friendlyExplanation('All targets are healthy.');
    expect(result.text).toBe('All targets are healthy.');
    expect(result.technical).toBeUndefined();
  });
});

describe('friendlyCommand', () => {
  it('strips the AWS SDK prefix', () => {
    expect(friendlyCommand('AWS SDK EC2: RunInstances')).toBe('RunInstances');
    expect(friendlyCommand('AWS SDK ELBv2: CreateLoadBalancer')).toBe('CreateLoadBalancer');
  });
});
