#!/usr/bin/env bash
# Smoke test da POC: builda, sobe a app com um banco novo, roda scripts/poc-smoke.mjs (subscriptions
# via graphql-ws + mutations + queries + contagens) e derruba. Logs em .poc-logs/.
#
# Uso:  bash scripts/poc-smoke.sh            (porta 3000)
#       PORT=9090 bash scripts/poc-smoke.sh
#       SKIP_BUILD=1 bash scripts/poc-smoke.sh (reaproveita dist/)
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
LOG=".poc-logs"
rm -rf "$LOG"; mkdir -p "$LOG"

step() { echo "[$(date +%H:%M:%S)] $*"; }
APP_PID=""
finish() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
  step "encerrando (app=$APP_PID) — logs em $LOG/"
}
trap finish EXIT

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  step "build: pnpm build"
  pnpm build > "$LOG/01-build.txt" 2>&1 || { step "BUILD FALHOU — veja $LOG/01-build.txt"; exit 1; }
fi

rm -rf data
step "start: node dist/main (porta $PORT)"
PORT="$PORT" node dist/main > "$LOG/02-app.txt" 2>&1 &
APP_PID=$!

for _ in $(seq 1 60); do
  if curl -s -o /dev/null -X POST "http://localhost:$PORT/graphql" -H 'content-type: application/json' -d '{"query":"{ posts(first: 1) { totalCount } }"}'; then break; fi
  kill -0 "$APP_PID" 2>/dev/null || { step "APP NÃO SUBIU — veja $LOG/02-app.txt"; exit 1; }
  sleep 1
done
step "app pronta em http://localhost:$PORT/graphql"

PORT="$PORT" node scripts/poc-smoke.mjs 2>&1 | tee "$LOG/03-smoke.txt"
exit "${PIPESTATUS[0]}"
