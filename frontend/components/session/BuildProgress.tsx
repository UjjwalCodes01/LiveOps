'use client';

import { motion } from 'motion/react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { useSession } from '@/components/session/SessionProvider';
import type { SessionEvent } from '@/lib/types';

// The provisioning steps the backend actually emits during a build, in the
// order they happen (see AwsAdapter.provision's report() calls). This is
// the "instant-feel" answer to real AWS latency: a live build takes minutes
// (EC2 boot + health checks), and a raw scrolling log makes that feel like
// a hang. This checklist turns the same event stream into a legible,
// satisfying top-to-bottom progression — you can see exactly where the
// agent is and that it's still moving. The action keys match the
// sub-action names emitted by the executor's ProgressReporter exactly.
const STEPS: { action: string; label: string }[] = [
  { action: 'create_ec2_targets', label: 'Launch 3 EC2 targets' },
  { action: 'create_target_group', label: 'Create the target group' },
  {
    action: 'create_application_load_balancer',
    label: 'Create the load balancer',
  },
  { action: 'wait_for_ec2_targets', label: 'Wait for targets to boot' },
  { action: 'register_targets', label: 'Register targets with the group' },
  { action: 'create_listener', label: 'Create the HTTP listener' },
  {
    action: 'wait_for_target_health',
    label: 'Wait for health checks to pass',
  },
];

type StepStatus = 'pending' | 'active' | 'done';

function statusFor(action: string, events: SessionEvent[]): StepStatus {
  let status: StepStatus = 'pending';
  for (const event of events) {
    if (event.action !== action) continue;
    if (event.type === 'action_completed') return 'done';
    if (event.type === 'action_started') status = 'active';
  }
  return status;
}

export function BuildProgress() {
  const { events } = useSession();
  // Only meaningful once a build has actually started emitting steps —
  // before that the panel would just be seven greyed-out rows with nothing
  // happening, which reads as broken rather than "ready".
  const started = events.some((event) =>
    STEPS.some((step) => step.action === event.action),
  );
  if (!started) return null;

  const steps = STEPS.map((step) => ({
    ...step,
    status: statusFor(step.action, events),
  }));
  const doneCount = steps.filter((step) => step.status === 'done').length;

  return (
    <GlassPanel className="p-4" delay={0.1}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Provisioning</h3>
        <span className="text-xs text-white/40">
          {doneCount}/{steps.length} steps
        </span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => (
          <li key={step.action} className="flex items-center gap-2.5">
            <StepIcon status={step.status} />
            <span
              className={[
                'text-sm transition-colors',
                step.status === 'done' && 'text-white/70',
                step.status === 'active' && 'font-medium text-white',
                step.status === 'pending' && 'text-white/35',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </GlassPanel>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done')
    return (
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-status-healthy/20 text-status-healthy"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </motion.span>
    );
  if (status === 'active')
    return (
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-status-info" />
    );
  return <Circle className="h-4 w-4 shrink-0 text-white/20" />;
}
