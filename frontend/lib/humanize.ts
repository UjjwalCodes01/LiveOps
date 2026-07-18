// Translates the backend's real, technical event text into copy a
// non-technical student can read at a glance. Nothing here invents new
// information — it only rewords or trims what the event already says (see
// backend/src/agent/agent.service.ts, executor.service.ts, and
// aws.adapter.ts for the source strings this maps). The original technical
// text is always still available via CommandFeed's "technical detail"
// toggle, never discarded.

const ACTION_LABELS: Record<string, string> = {
  inspect_load_balancers: 'Looking at the load balancer',
  provision_load_balancer: 'Setting up the load balancer',
  inject_target_failure: 'Simulating a server failure',
  diagnose_target_health: 'Checking server health',
  restore_target: 'Bringing the server back online',
  create_ec2_targets: 'Creating the servers',
  create_target_group: 'Grouping the servers together',
  create_application_load_balancer: 'Creating the load balancer',
  wait_for_ec2_targets: 'Waiting for the servers to start',
  register_targets: 'Connecting servers to the load balancer',
  create_listener: 'Opening the load balancer to traffic',
  wait_for_target_health: 'Waiting for servers to pass health checks',
  aws_throttled: 'Waiting on AWS (rate limited)',
  cleanup_expired_session: 'Cleaning up unused resources',
  cleanup_expired_resources: 'Cleaning up unused resources',
};

export function friendlyAction(action?: string): string | undefined {
  if (!action) return undefined;
  return ACTION_LABELS[action] ?? action.replaceAll('_', ' ');
}

interface Rule {
  test: RegExp;
  friendly: string;
}

// Order matters — first match wins. Kept as literal/near-literal matches on
// the backend's actual, enumerable message set, not a guess at every
// possible string.
const EXPLANATION_RULES: Rule[] = [
  {
    test: /^Agent temporarily unavailable; retrying/,
    friendly: 'The AI is momentarily unavailable — retrying automatically.',
  },
  {
    test: /^Agent unavailable after \d+ attempts?:.*Using the verified fallback action\.$/,
    friendly: 'The AI reasoning service didn’t respond in time, so a verified safe action is being used instead.',
  },
  {
    test: /agent is unavailable, so the platform is continuing/,
    friendly: 'Continuing with a predefined safe action while the AI is unavailable.',
  },
  {
    test: /AWS_ACCOUNT_ID and AWS_VPC_ID are required/,
    friendly: 'AWS isn’t connected yet, so this step can’t run.',
  },
  {
    test: /AWS credentials do not belong to the configured sandbox account/,
    friendly: 'The connected AWS account doesn’t match the expected sandbox account.',
  },
  {
    test: /AWS execution is disabled/,
    friendly: 'AWS actions are turned off for this environment right now.',
  },
  {
    test: /(AWS_VPC_SUBNET_IDS|AWS_SECURITY_GROUP_ID|AWS_EC2_AMI_ID).*required to provision/,
    friendly: 'AWS network settings aren’t fully configured yet.',
  },
  {
    test: /must belong to the configured sandbox VPC/,
    friendly: 'The configured AWS network doesn’t match the expected sandbox.',
  },
  {
    test: /did not create all three target instances/,
    friendly: 'AWS didn’t finish creating all the servers.',
  },
  {
    test: /No healthy target is available to fail/,
    friendly: 'There’s no healthy server left to take down.',
  },
  {
    test: /No failed target is available to restore/,
    friendly: 'There’s no failed server that needs restoring.',
  },
  {
    test: /No tagged target group and instances were found/,
    friendly: 'Couldn’t find this session’s servers on AWS.',
  },
  // executor.service.ts's generic "Starting {action}."/"{action} completed."
  // templates — redundant once the row already shows a friendly action
  // label above them (see CommandFeed), so collapse to a plain status word.
  { test: /^Starting .+\.$/, friendly: 'Getting started…' },
  { test: /^.+ completed\.$/, friendly: 'All done.' },
];

export interface FriendlyExplanation {
  text: string;
  /** The original event text, only set when it differs from `text`. */
  technical?: string;
}

export function friendlyExplanation(explanation: string): FriendlyExplanation {
  for (const rule of EXPLANATION_RULES) {
    if (rule.test.test(explanation)) return { text: rule.friendly, technical: explanation };
  }
  // Generic fallback for anything unmatched (e.g. a raw AWS/OpenAI SDK
  // error) — strip noisy prefixes/URLs and cap length, rather than dumping
  // the full technical string as the primary message.
  const cleaned = explanation
    .replace(/^Action failed:\s*/, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (cleaned === explanation) return { text: cleaned };
  if (cleaned.length <= 140) return { text: cleaned, technical: explanation };
  return { text: `${cleaned.slice(0, 137)}…`, technical: explanation };
}

// Strips the "AWS SDK EC2:"/"AWS SDK ELBv2:" prefix so the command reads as
// a short, real operation name instead of a full jargon-heavy line.
export function friendlyCommand(command: string): string {
  return command.replace(/^AWS SDK [\w.]+:\s*/, '');
}
