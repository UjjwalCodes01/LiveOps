'use client';

import { motion } from 'motion/react';
import { BrainCircuit } from 'lucide-react';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { useSession } from '@/components/session/SessionProvider';

// Surfaces the agent's GPT-5.6 root-cause analysis prominently: after the
// real DescribeTargetHealth runs, the model reads that live telemetry and
// explains the actual fault in plain language (emitted as a
// 'diagnose_root_cause' narration). This is the model reasoning over real
// AWS data, not just picking an action — so it gets its own callout rather
// than scrolling past in the feed. Renders nothing until the analysis exists.
export function RootCauseCallout() {
  const { events } = useSession();

  let analysis: string | undefined;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.action === 'diagnose_root_cause' && event.type === 'narration') {
      analysis = event.explanation;
      break;
    }
  }
  if (!analysis) return null;

  return (
    <GlassPanel className="p-5" delay={0.05}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-info/15 text-status-info">
          <BrainCircuit className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-status-info">
            Root cause · diagnosed by GPT-5.6
          </div>
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-1 text-sm leading-relaxed text-white/85"
          >
            {analysis}
          </motion.p>
          <p className="mt-1.5 text-xs text-white/40">
            Read live from the target group&rsquo;s real health, not a canned message.
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}
