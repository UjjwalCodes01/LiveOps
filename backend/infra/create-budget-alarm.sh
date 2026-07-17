#!/usr/bin/env bash
# Creates an AWS Budget with email-notified threshold alarms (AWS Budgets'
# built-in EMAIL subscriber type — no SNS topic involved) for the
# Build. Break. Fix. sandbox account, independent of the NestJS app — this
# fires even if the app crashes, is never deployed, or its cleanup cron
# fails. See AGENT.md §6.2: "A hard AWS budget alarm is configured
# independently of the app — if the app fails, the alarm still fires."
#
# This has NOT been run or verified against a live AWS account from this
# environment (no AWS credentials available here). Run it yourself against
# your sandbox account and confirm the budget + alarm appear in the AWS
# Budgets console before treating cost protection as active.
#
# Usage:
#   BUDGET_LIMIT_USD=25 \
#   ALERT_EMAIL=you@example.com \
#   AWS_ACCOUNT_ID=123456789012 \
#   ./infra/create-budget-alarm.sh
set -euo pipefail

: "${BUDGET_LIMIT_USD:?Set BUDGET_LIMIT_USD, e.g. 25}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL to receive threshold notifications}"
: "${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID to the sandbox account ID}"
BUDGET_NAME="${BUDGET_NAME:-build-break-fix-sandbox}"

aws budgets create-budget \
  --account-id "$AWS_ACCOUNT_ID" \
  --budget "$(cat <<JSON
{
  "BudgetName": "$BUDGET_NAME",
  "BudgetType": "COST",
  "TimeUnit": "MONTHLY",
  "BudgetLimit": { "Amount": "$BUDGET_LIMIT_USD", "Unit": "USD" },
  "CostFilters": {}
}
JSON
)" \
  --notifications-with-subscribers "$(cat <<JSON
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 50,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "$ALERT_EMAIL" }]
  },
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 90,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "$ALERT_EMAIL" }]
  },
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "$ALERT_EMAIL" }]
  }
]
JSON
)"

echo "Budget '$BUDGET_NAME' created for account $AWS_ACCOUNT_ID. Verify it in the AWS Budgets console."
