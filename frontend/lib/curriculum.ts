// The teaching layer. Build. Break. Fix. is a *learning* product, not just
// an infra demo — the event stream shows students WHAT the agent did, and
// this module supplies the WHY: the concept behind each phase, why it
// matters in real systems, what to watch for on screen, and a takeaway that
// unlocks when the phase completes. Content is intentionally frontend-only:
// it's static pedagogy keyed to phase, not per-session data, so there's no
// reason to round-trip it through the backend.
//
// Structured by concept (only load_balancing today) so the shape is ready
// if more concepts are ever built out, but deliberately deep rather than
// broad — one lesson taught well.
import type { Phase, SessionState } from './types';

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface CheckpointOption {
  text: string;
  correct: boolean;
  // Shown after the student answers — teaches regardless of right/wrong.
  explanation: string;
}

export interface Checkpoint {
  question: string;
  options: CheckpointOption[];
}

export interface PhaseLesson {
  phase: Phase;
  // Short concept name, e.g. "Failure injection". Doubles as the unlockable
  // badge label in the ConceptsLearned tracker.
  concept: string;
  tagline: string;
  // The big idea — why this concept exists in real systems.
  intro: string;
  // What the agent is actually doing, in plain terms, under the AWS jargon.
  whatsHappening: string;
  terms: GlossaryTerm[];
  watchFor: string;
  // Unlocks (and is emphasised) once the phase reaches its completed state.
  takeaway: string;
  checkpoint?: Checkpoint;
}

export interface Curriculum {
  concept: string;
  title: string;
  subtitle: string;
  // Ordered the way the student walks through them.
  lessons: Record<Phase, PhaseLesson>;
}

const LOAD_BALANCING: Curriculum = {
  concept: 'load_balancing',
  title: 'Load Balancing',
  subtitle:
    'How real systems stay online when a server dies — built, broken, and fixed live on AWS.',
  lessons: {
    build: {
      phase: 'build',
      concept: 'Horizontal scaling',
      tagline: 'One server is a single point of failure. Spread the load.',
      intro:
        'If your whole app runs on one server, that server is a single point of failure: when it falls over, everything goes dark. The fix is horizontal scaling — run several identical servers and put a load balancer in front to spread requests across them. No single machine is critical anymore.',
      whatsHappening:
        'The agent is provisioning a real Application Load Balancer (ALB) on AWS, launching three EC2 instances as targets, and wiring them into a target group with a health check. Every AWS SDK call scrolls past in the feed as it happens — nothing here is faked.',
      terms: [
        {
          term: 'Application Load Balancer',
          definition:
            "AWS's Layer-7 (HTTP-aware) traffic router. It receives every incoming request and forwards it to a healthy backend server.",
        },
        {
          term: 'EC2 target',
          definition:
            'A virtual server (instance) that actually runs your app and answers requests. Here there are three, so any one can fail without downtime.',
        },
        {
          term: 'Target group',
          definition:
            'The set of targets the ALB routes to, plus the health-check rules that decide which of them are currently eligible for traffic.',
        },
        {
          term: 'Health check',
          definition:
            'A request the ALB sends each target on a schedule. Pass and you get traffic; fail and the ALB quietly stops routing to you.',
        },
      ],
      watchFor:
        'Wait for all three targets to come up healthy. The ALB will only send traffic to targets that pass their health check — so "healthy" is what makes a target real.',
      takeaway:
        'You now have a fault-tolerant web tier: three servers behind one load balancer, each continuously health-checked. Losing any one of them is survivable — which you are about to prove.',
    },
    explore: {
      phase: 'explore',
      concept: 'Reading live infrastructure',
      tagline: "Don't trust the diagram — query the system itself.",
      intro:
        "A diagram tells you how a system was designed. Only the system's own state tells you how it's actually running right now. Good engineers reach for the live truth — the API, the health status, the real resource — not the whiteboard drawing.",
      whatsHappening:
        'The agent is querying AWS directly for the load balancer, its target group, and each target you just built — reflecting real, current state back into the diagram on the left.',
      terms: [
        {
          term: 'Desired vs. actual state',
          definition:
            'What you asked for versus what the cloud actually did. They usually match — but the whole discipline of operations exists for when they don’t.',
        },
        {
          term: 'DNS name',
          definition:
            "The ALB's public address. In a real deployment this is what your domain would point at — users hit the DNS name, never an individual server.",
        },
      ],
      watchFor:
        'Click any node in the diagram to inspect it. Notice the ALB has one DNS name but sits in front of three interchangeable targets — callers never know or care which server answered.',
      takeaway:
        'The load balancer is a single stable front door hiding a fleet of replaceable servers behind it. That indirection is exactly what lets you break one without users noticing.',
    },
    break: {
      phase: 'break',
      concept: 'Chaos engineering',
      tagline: 'The only way to know it survives failure is to fail it.',
      intro:
        "You can't call a system resilient until you've watched it survive a failure. So you cause one, on purpose, in a controlled way. Netflix made this famous with Chaos Monkey — a tool that randomly kills production servers during business hours, precisely to prove the system shrugs it off.",
      whatsHappening:
        'The agent is deregistering one healthy target from the target group — the equivalent of a server crashing, a bad deploy, or someone tripping over a power cable. This is a deliberate, reversible failure.',
      terms: [
        {
          term: 'Deregistration',
          definition:
            'Removing a target from the group so the ALB stops routing to it. Here it stands in for any way a server can vanish from the pool.',
        },
        {
          term: 'Blast radius',
          definition:
            'How much breaks when one thing fails. Good architecture keeps it small — one dead target should not equal one dead app.',
        },
      ],
      watchFor:
        'Watch the diagram: one target drops out, but the other two stay healthy and keep serving. The load balancer routes around the gap automatically — no human, no downtime.',
      takeaway:
        'Losing one of three targets did not take the system down. That single fact is the entire justification for load balancing — and you just watched it hold.',
      checkpoint: {
        question:
          'With one of three targets deregistered, what happens to user traffic hitting the load balancer?',
        options: [
          {
            text: 'It keeps flowing, split across the two remaining healthy targets.',
            correct: true,
            explanation:
              'Exactly. The ALB only routes to healthy targets, so it silently redistributes traffic across the survivors. Users see nothing.',
          },
          {
            text: 'One third of requests fail until the target is restored.',
            correct: false,
            explanation:
              'A common guess, but no — the ALB never sends traffic to a deregistered target in the first place, so no requests are dropped. It routes only to healthy ones.',
          },
          {
            text: 'The whole load balancer goes offline until all targets are healthy.',
            correct: false,
            explanation:
              'The opposite of the point of load balancing. The ALB stays up and serves from whatever healthy capacity remains — that partial-failure tolerance is the whole feature.',
          },
        ],
      },
    },
    diagnose: {
      phase: 'diagnose',
      concept: 'Observability',
      tagline: "Don't guess what broke. Ask the system.",
      intro:
        'When something breaks in production, guessing is expensive. Mature systems are observable: they expose their own health and tell you what is wrong in specific, machine-readable terms. "The site feels slow" is a feeling; "target i-0abc is unhealthy: Target.Deregistered" is a fact you can act on.',
      whatsHappening:
        'The agent is calling DescribeTargetHealth — asking AWS for the real health state and reason code of every target. The answer comes straight from the load balancer’s own view of the world, not from anything we assumed.',
      terms: [
        {
          term: 'Health state',
          definition:
            'AWS’s live verdict on each target: healthy, unhealthy, unused, draining. It updates on its own as reality changes.',
        },
        {
          term: 'Reason code',
          definition:
            'The machine-readable "why" behind an unhealthy state — e.g. Target.Deregistered. This is what turns an alert into an action.',
        },
        {
          term: 'Telemetry',
          definition:
            'Data a system emits about itself. Diagnosis is just knowing which telemetry to read and how to interpret it.',
        },
      ],
      watchFor:
        'Read the health timeline: two targets report healthy, one reports unhealthy or unused with a reason. That reason names the exact problem — no guessing required.',
      takeaway:
        'Observability turned a vague "something is wrong" into a precise, named, fixable fault. You located the failure before writing a single line of a fix — which is the correct order of operations.',
      checkpoint: {
        question:
          'Why query DescribeTargetHealth before attempting any fix, instead of just re-running the whole build?',
        options: [
          {
            text: 'To confirm exactly what failed, so the fix is targeted and verifiable — not a blind restart.',
            correct: true,
            explanation:
              'Right. Diagnosis first means you fix the actual fault and can prove it’s resolved. Blind restarts hide root causes and let them recur.',
          },
          {
            text: 'Because AWS requires a health check before you can register targets.',
            correct: false,
            explanation:
              'Not a real requirement — you can register targets any time. The reason to diagnose first is discipline: understand the fault before you touch it.',
          },
          {
            text: 'It doesn’t matter; rebuilding everything would be just as good.',
            correct: false,
            explanation:
              'Tempting under pressure, but rebuilding is slower, riskier, and teaches you nothing about why it broke — so it breaks again. Diagnose, then remediate precisely.',
          },
        ],
      },
    },
    fix: {
      phase: 'fix',
      concept: 'Remediation & self-healing',
      tagline: 'Detect, diagnose, remediate, verify. The full incident loop.',
      intro:
        'The best incident response barely involves a human. Once you know the specific fault, remediation is targeted and its success is verifiable — you fix the exact thing, then watch the system’s own health checks confirm it’s truly recovered. That confirm-it-worked step is what separates a fix from a hope.',
      whatsHappening:
        'The agent is re-registering the failed target. The ALB immediately begins health-checking it again, and the moment it passes, traffic starts flowing to it once more — automatically.',
      terms: [
        {
          term: 'Remediation',
          definition:
            'The targeted action that resolves the diagnosed fault — here, putting the recovered target back into the pool.',
        },
        {
          term: 'Self-healing',
          definition:
            'When the system restores itself to a healthy state on its own once conditions allow, with no manual intervention needed.',
        },
        {
          term: 'Verification',
          definition:
            'Proving the fix worked by observing real signals — the target passing its health check again — not just assuming it did.',
        },
      ],
      watchFor:
        'Watch the restored target climb back: unhealthy → healthy. Once it passes, the system is at full capacity again and the load balancer resumes routing to all three.',
      takeaway:
        'You just ran a complete incident lifecycle — detect, diagnose, remediate, verify — on real cloud infrastructure. That exact loop is what on-call SRE and platform teams run every single day.',
    },
  },
};

const CURRICULA: Record<string, Curriculum> = {
  load_balancing: LOAD_BALANCING,
};

export function getCurriculum(concept: string): Curriculum {
  return CURRICULA[concept] ?? LOAD_BALANCING;
}

export function getLesson(concept: string, phase: Phase): PhaseLesson {
  return getCurriculum(concept).lessons[phase];
}

// Which session states mean a given phase has fully completed its work.
// Used to unlock takeaways and light up the ConceptsLearned tracker.
// Note build/fix have an in-progress state (building/fixing); explore/break/
// diagnose transition straight to their completed state.
const PHASE_COMPLETED_STATES: Record<Phase, SessionState[]> = {
  build: ['ready', 'broken', 'diagnosing', 'fixing', 'completed'],
  explore: ['ready', 'broken', 'diagnosing', 'fixing', 'completed'],
  break: ['broken', 'diagnosing', 'fixing', 'completed'],
  diagnose: ['diagnosing', 'fixing', 'completed'],
  fix: ['completed'],
};

export function isPhaseComplete(phase: Phase, state: SessionState): boolean {
  return PHASE_COMPLETED_STATES[phase].includes(state);
}

// The teaching phases, in the order a student earns them. Explore is a
// look-around step rather than a distinct concept badge, so it's excluded
// from the concepts-learned tracker (but still has a full lesson).
export const CONCEPT_PHASES: Phase[] = ['build', 'break', 'diagnose', 'fix'];
