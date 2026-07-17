# infra/

## `iam-policy.json`

The least-privilege IAM policy the backend's AWS credentials (ECS task
role / EC2 instance role / local sandbox user) need to run the load
balancing lesson. It intentionally contains `<AWS_REGION>`,
`<AWS_ACCOUNT_ID>`, `<VPC_ID>`, `<SUBNET_ID_1>`, `<SUBNET_ID_2>`,
`<SECURITY_GROUP_ID>`, and `<AMI_ID>` placeholders — this is a template
meant to be shared across accounts, not a policy tied to one sandbox.

Render it with your real sandbox values before attaching:

```bash
set -a; source .env; set +a
./infra/render-iam-policy.sh > infra/iam-policy.rendered.json
```

`infra/iam-policy.rendered.json` is git-ignored; never commit a rendered
policy (it embeds your account ID and resource IDs). Attach it with, e.g.:

```bash
aws iam put-role-policy \
  --role-name <your-ecs-task-role-or-instance-role> \
  --policy-name build-break-fix-sandbox \
  --policy-document file://infra/iam-policy.rendered.json
```

Notes on the policy's structure:
- `CreateOnlyTaggedSandboxResources` only lists actions that actually accept
  a `Tags`/`TagSpecifications` request parameter (`RunInstances`,
  `CreateLoadBalancer`, `CreateTargetGroup`) — gating an action on
  `aws:RequestTag` only makes sense for actions that can carry a request
  tag. `CreateListener` and `RegisterTargets` don't support request
  tagging at all, so they're granted instead by the resource-ARN-scoped
  `ModifyOnlyBuildBreakFixLoadBalancers` / `ModifyOnlyBuildBreakFixTargetGroups`
  statements below (scoped to the `bbf-*` / `bbf-tg-*` naming the adapter
  always uses — see `AwsAdapter.provision()` in `src/executor/adapters/aws.adapter.ts`).
- Always validate the rendered policy against your actual sandbox account
  before relying on it for a live demo — attach it, then run
  `npm run test:aws-integration` (see the root README) to exercise the
  full build → break → diagnose → fix → teardown path against it.

## `create-budget-alarm.sh`

Provisions an AWS Budget with email-notified threshold alarms (AWS Budgets'
built-in EMAIL subscriber type, not SNS), independent of the NestJS app —
it fires even if the app crashes or is never deployed. See the script's
header comment for usage. This has not been run against a live account
from this environment; run it yourself and confirm the alarm appears in
the AWS Budgets console before treating it as active.

## `../scripts/sweep-expired-resources.cjs`

A standalone Node script (no NestJS/Postgres dependency) that deletes any
AWS resource tagged `project=bbf-demo` older than `AWS_RESOURCE_TTL_MINUTES`.
Meant to be run on an external schedule (see `.github/workflows/sweep.yml`)
so orphaned resources still get cleaned up even if the app itself is down —
the in-app `LifecycleService` cron only runs while the app process is alive.
Deletes ALBs and waits for deletion to actually finish before deleting
their target groups (`DeleteLoadBalancer` only starts an async teardown —
deleting the target group too early can fail while it's still "in use" by
the ALB's listener), mirroring `AwsAdapter.deleteLoadBalancerAndWait`.

```bash
node -r dotenv/config scripts/sweep-expired-resources.cjs dotenv_config_path=.env --dry-run
```

Drop `--dry-run` once you've confirmed the listed sessions are actually
ones you want torn down.
