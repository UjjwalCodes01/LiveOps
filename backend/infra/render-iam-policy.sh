#!/usr/bin/env bash
# Renders infra/iam-policy.json with real sandbox values substituted in for
# the <AWS_REGION>/<AWS_ACCOUNT_ID>/<SUBNET_ID_1>/... placeholders, reading
# from the same variable names used in .env, so the output is ready to
# attach directly via `aws iam put-role-policy` / `aws iam create-policy`.
#
# Usage:
#   set -a; source .env; set +a
#   ./infra/render-iam-policy.sh > infra/iam-policy.rendered.json
#
# Required environment variables: AWS_REGION, AWS_ACCOUNT_ID, AWS_VPC_ID,
# AWS_VPC_SUBNET_IDS (comma-separated, at least 2), AWS_SECURITY_GROUP_ID,
# AWS_EC2_AMI_ID.
set -euo pipefail

required=(AWS_REGION AWS_ACCOUNT_ID AWS_VPC_ID AWS_VPC_SUBNET_IDS AWS_SECURITY_GROUP_ID AWS_EC2_AMI_ID)
missing=()
for name in "${required[@]}"; do
  [ -z "${!name:-}" ] && missing+=("$name")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required environment variables: ${missing[*]}" >&2
  exit 1
fi

IFS=',' read -r SUBNET_ID_1 SUBNET_ID_2 REST <<<"$AWS_VPC_SUBNET_IDS"
if [ -z "$SUBNET_ID_1" ] || [ -z "$SUBNET_ID_2" ]; then
  echo "AWS_VPC_SUBNET_IDS must contain at least two comma-separated subnet IDs" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sed \
  -e "s/<AWS_REGION>/${AWS_REGION}/g" \
  -e "s/<AWS_ACCOUNT_ID>/${AWS_ACCOUNT_ID}/g" \
  -e "s/<VPC_ID>/${AWS_VPC_ID}/g" \
  -e "s/<SUBNET_ID_1>/${SUBNET_ID_1}/g" \
  -e "s/<SUBNET_ID_2>/${SUBNET_ID_2}/g" \
  -e "s/<SECURITY_GROUP_ID>/${AWS_SECURITY_GROUP_ID}/g" \
  -e "s/<AMI_ID>/${AWS_EC2_AMI_ID}/g" \
  "$script_dir/iam-policy.json"
