# AWS lifecycle verification runbook

The app touches **real, billable AWS infrastructure**, so before relying on
it (a demo, judging, or leaving it public) verify the full lifecycle against
your sandbox account. Each step has an exact command and what a pass looks
like. Run them in order — later steps assume earlier ones passed.

Set these once for the session:

```bash
export PREFLIGHT_URL=https://liveops.onrender.com   # your backend
export API_KEY=<one of the backend's API_KEYS>
export AWS_REGION=us-east-1                          # your sandbox region
```

## 1. IAM is attached and scoped

The pre-flight's credential check authenticates and confirms the caller is
the configured sandbox account. To also confirm the *policy* is attached and
sufficient, the later checks (VPC/subnet/SG/AMI describes) must pass — they
exercise the read permissions in `backend/infra/iam-policy.json`.

```bash
aws sts get-caller-identity --query Account --output text   # == your AWS_ACCOUNT_ID
```
**Pass:** prints your sandbox account ID (not your personal/root account).

## 2. Budget alarm exists

```bash
cd backend && bash infra/create-budget-alarm.sh    # idempotent; creates if missing
aws budgets describe-budgets --account-id <AWS_ACCOUNT_ID> \
  --query "Budgets[].BudgetName" --output text
```
**Pass:** the budget is listed. Confirm the notification email/SNS target in
the AWS Budgets console so an overrun actually pages you.

## 3. Pre-flight is green

```bash
cd backend && npm run preflight
```
**Pass:** every line shows `✓` and it ends with `✓ READY`. This verifies
credentials + VPC + subnets (incl. ≥2 AZs) + security group (incl. inbound
port 80) + AMI in one shot. Fix anything `✗` before continuing.

## 4. Full build → break → diagnose → fix

On the live site, run all four phases for one session and watch the event
feed. Then confirm the resources are actually real:

```bash
# ALB for the session (grab the DNS from the Explore "Live endpoint" panel):
curl -s -o /dev/null -w "%{http_code}\n" http://<alb-dns-name>/health   # 200
# The tagged resources exist:
aws elbv2 describe-load-balancers --region "$AWS_REGION" \
  --query "LoadBalancers[?starts_with(LoadBalancerName,'bbf-')].LoadBalancerName" --output text
aws ec2 describe-instances --region "$AWS_REGION" \
  --filters "Name=tag:project,Values=bbf-demo" "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].InstanceId" --output text
```
**Pass:** the endpoint returns `200`, and the ALB + 3 instances are listed.

## 5. Teardown (TTL auto-cleanup)

Tagged resources auto-delete `AWS_RESOURCE_TTL_MINUTES` after creation
(default 20). Wait past the TTL, then re-run the describe commands from step 4.

**Pass:** the ALB, target group, and instances are **gone** — the queries
return empty. (The backend logs `Cleaning up AWS resources for N session(s)…`
when the cron fires — visible in Render logs.)

## 6. Independent sweeper (defense-in-depth)

`scripts/sweep-expired-resources.cjs` reaps orphaned tagged resources even if
the app is down. Verify it runs cleanly:

```bash
cd backend && node scripts/sweep-expired-resources.cjs
```
**Pass:** it completes without error and reports what (if anything) it
removed. `.github/workflows/sweep.yml` runs this hourly in CI as a backstop —
confirm that workflow is enabled in your repo's Actions tab.

---

### If anything fails
- **Credentials/preflight red** → see `backend/README.md` → "Pre-flight AWS check".
- **Build stalls at health checks** → security group is missing inbound TCP 80 (the preflight now catches this).
- **Resources not torn down** → check Render logs for the `LifecycleService` cron, and confirm `AWS_RESOURCE_TTL_MINUTES` is set; run step 6 manually to force it.
