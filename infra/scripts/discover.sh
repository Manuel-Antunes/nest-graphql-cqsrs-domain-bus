#!/usr/bin/env bash
# Where the deployed stack is.
#
# `sst outputs` DOES NOT EXIST in 4.17.1 — the command prints the help — and the outputs only appear
# in the output of `sst deploy`, which has usually scrolled away by the time anyone needs them. So
# there are two routes here, in order:
#
#   1. `sst state export`, which is the stack's own outputs and needs NO aws CLI. It is what answers
#      on a machine where the CLI cannot run at all, which is not hypothetical: an x86 `aws` binary
#      on Apple Silicon without Rosetta exits with `bad CPU type in executable`.
#   2. the tags SST writes on every resource (`sst:app`, `sst:stage`), for whatever route 1 does not
#      carry — `MIGRATE` among them, because a function name is derived from an environment holding
#      a secret and Pulumi therefore marks it secret in the export.
#
#   eval "$(./infra/scripts/discover.sh dev)"   # API, STREAM, MIGRATE, BUCKET, NOTIFICATOR_LOGS
set -euo pipefail

APP="${SST_APP:-nestposts}"
STAGE="${SST_STAGE:-${1:-dev}}"

resources() {
  aws resourcegroupstaggingapi get-resources \
    --tag-filters "Key=sst:app,Values=$APP" "Key=sst:stage,Values=$STAGE" \
    --resource-type-filters "$1" \
    --query 'ResourceTagMappingList[].ResourceARN' --output text
}

# SST puts the logical name into the physical one, so a distinctive fragment is enough to tell the
# six functions apart. `Migrate` is distinctive; `PostsApi` is not (it prefixes PostsApiInbox too),
# which is why the HTTP one is found by the thing only it has: a function URL.
function_named() {
  for arn in $(resources lambda:function); do
    local name="${arn##*:}"
    case "$name" in *"$1"*) printf '%s' "$name"; return ;; esac
  done
}

stream_url() {
  for arn in $(resources lambda:function); do
    local url
    url=$(aws lambda get-function-url-config --function-name "$arn" \
            --query FunctionUrl --output text 2>/dev/null || true)
    if [ -n "$url" ] && [ "$url" != "None" ]; then
      printf '%s' "${url%/}"
      return
    fi
  done
}

router_url() {
  for arn in $(resources cloudfront:distribution); do
    local domain
    domain=$(aws cloudfront get-distribution --id "${arn##*/}" \
               --query 'Distribution.DomainName' --output text 2>/dev/null || true)
    if [ -n "$domain" ] && [ "$domain" != "None" ]; then
      printf 'https://%s' "$domain"
      return
    fi
  done
}

# The stack's own outputs, straight out of the state. Prints `KEY=value` for whatever is plain text.
from_state() {
  npx --yes sst state export --stage "$STAGE" 2>/dev/null | python3 -c '
import json, sys

try:
    state = json.load(sys.stdin)
except Exception:
    sys.exit(0)

for resource in state.get("latest", {}).get("resources", []):
    if resource.get("type") != "pulumi:pulumi:Stack":
        continue
    outputs = resource.get("outputs", {})
    for key in ("url", "stream", "graphql", "bucket"):
        value = outputs.get(key)
        if isinstance(value, str) and value:
            print(f"{key.upper()}={value.rstrip(chr(47))}")
' || true
}

API=''
STREAM=''
GRAPHQL=''
BUCKET=''
while IFS='=' read -r key value; do
  [ -n "${key:-}" ] || continue
  case "$key" in
    URL) API="$value" ;;
    STREAM) STREAM="$value" ;;
    GRAPHQL) GRAPHQL="$value" ;;
    BUCKET) BUCKET="$value" ;;
  esac
done <<< "$(from_state)"

if aws --version >/dev/null 2>&1; then
  [ -n "$STREAM" ] || STREAM="$(stream_url)"
  [ -n "$API" ] || API="$(router_url)"
  MIGRATE="$(function_named Migrate)"
  SEED="$(function_named Seed)"
else
  MIGRATE="${MIGRATE:-}"
  SEED="${SEED:-}"
fi
NOTIFICATOR_LOGS="$(node infra/scripts/log-group.mjs "$APP-$STAGE-NotificatorFunction-" 2>/dev/null || true)"

echo "export STREAM='$STREAM'"
echo "export API='$API'"
echo "export GRAPHQL='${GRAPHQL:-$API/graphql}'"
echo "export BUCKET='$BUCKET'"
echo "export MIGRATE='$MIGRATE'"
echo "export SEED='$SEED'"
echo "export NOTIFICATOR_LOGS='$NOTIFICATOR_LOGS'"
