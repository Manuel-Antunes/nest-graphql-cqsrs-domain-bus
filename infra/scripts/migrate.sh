#!/usr/bin/env bash
# Runs the migrations by hand. `sst deploy` already invokes this function on every deploy — see the
# Migrator component — so this is for re-running against a stage without redeploying it.
set -euo pipefail
cd "$(dirname "$0")/../.."

eval "$(./infra/scripts/discover.sh "${1:-dev}")"

if [ -z "${MIGRATE:-}" ] || [ "$MIGRATE" = "None" ]; then
  echo "no migrator function found for this stage — is it deployed?" >&2
  exit 1
fi

echo "==> $MIGRATE"
aws lambda invoke \
  --function-name "$MIGRATE" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"command":"setup"}' \
  --cli-read-timeout 300 \
  /dev/stdout
echo
