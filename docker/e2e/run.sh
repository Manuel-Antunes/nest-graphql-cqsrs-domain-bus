#!/usr/bin/env bash
# Sobe o broker e as DUAS aplicações, roda o teste da saga coreografada e desliga tudo.
#
# POR QUE ESTE TESTE NÃO É UM VITEST
# ==================================
# Porque o que ele prova é justamente o que uma suíte em processo não consegue montar: dois PROCESSOS
# separados, com bancos separados, conversando por um broker de verdade. Dentro de um processo só,
# "dois serviços" é dublagem — e a dublagem é o que a suíte da posts-api já faz de propósito
# (`InProcessTagAssignment`), e o que o `transport-loop.spec.ts` da lib faz com o broker em memória.
#
#   ./docker/e2e/run.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
LOGS=${E2E_LOGS:-$ROOT/.e2e}
mkdir -p "$LOGS"

POSTS_PID=""; TAGGING_PID=""
cleanup() {
  echo "### encerrando as aplicações"
  [ -n "$POSTS_PID" ] && kill "$POSTS_PID" 2>/dev/null
  [ -n "$TAGGING_PID" ] && kill "$TAGGING_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

echo "### 1. o broker"
# Um broker que já está no ar serve: a topologia deste projeto vive num exchange próprio
# (`nestposts.events`), então ele não se mistura com o que mais estiver naquele RabbitMQ. É também o
# que permite rodar este teste contra um broker remoto, sem Docker nenhum.
RABBIT_API=${RABBITMQ_MANAGEMENT:-http://localhost:15672}
RABBIT_USER=${RABBITMQ_USER:-guest}
RABBIT_PASSWORD=${RABBITMQ_PASSWORD:-guest}
IN_DOCKER=0
if curl -sf -u "$RABBIT_USER:$RABBIT_PASSWORD" "$RABBIT_API/api/overview" > /dev/null 2>&1; then
  echo "    usando o broker que já está em $RABBIT_API"
else
  docker compose up -d --wait rabbitmq > /dev/null 2>&1 || {
    echo "compose falhou"; docker compose ps; exit 1; }
  IN_DOCKER=1
fi

echo "### 2. um estado limpo nos dois serviços"
# APAGA as filas em vez de purgar, e a diferença importa: purgar tira as mensagens e deixa os
# BINDINGS. Bindings são duráveis e sobrevivem a redesenho de topologia — um `posts.*` de uma versão
# anterior continua pendurado e faz a topologia mentir sobre o desenho atual. Apagadas, as aplicações
# as redeclaram na partida com exatamente os bindings que elas declaram hoje.
for queue in nestposts.posts-api.post-completed nestposts.tagging.post-events; do
  curl -sf -u "$RABBIT_USER:$RABBIT_PASSWORD" -X DELETE "$RABBIT_API/api/queues/%2F/$queue" > /dev/null 2>&1
done
rm -f "$LOGS/posts.db" "$LOGS/tagging.db"

echo "### 3. empacotando (LIMPO)"
# Um teste ponta a ponta tem de medir o que um build do zero produz, não o que sobrou do anterior.
npx nx reset > /dev/null 2>&1
npx nx run-many -t build > "$LOGS/build.log" 2>&1 || {
  echo "build falhou:"; tail -30 "$LOGS/build.log"; exit 1; }

echo "### 4. subindo posts-api (3000, híbrida) e tagging (sem porta)"
COMMON_ENV=(
  "RABBITMQ_URL=${RABBITMQ_URL:-amqp://$RABBIT_USER:$RABBIT_PASSWORD@localhost:5672}"
  "MIKRO_ORM_DEBUG=false"
)
env "${COMMON_ENV[@]}" \
  PORT=3000 \
  POSTS_DB="$LOGS/posts.db" \
  POSTS_TRANSPORT=rabbitmq \
  POSTS_TAGGING_IN_PROCESS=false \
  node apps/posts-api/dist/main.js > "$LOGS/posts-api.log" 2>&1 &
POSTS_PID=$!

env "${COMMON_ENV[@]}" \
  TAGGING_DB="$LOGS/tagging.db" \
  TAGGING_TRANSPORT=rabbitmq \
  node apps/tagging/dist/main.js > "$LOGS/tagging.log" 2>&1 &
TAGGING_PID=$!

# A posts-api responde em HTTP. O tagging NÃO tem porta nenhuma — o sinal de que ele subiu é a linha
# no log dele, e é o único sinal que existe. É a consequência aceita de ser um serviço que não
# responde a ninguém.
UP_POSTS=0; UP_TAGGING=0
for _ in $(seq 1 90); do
  [ "$UP_POSTS" = 0 ] && curl -sf -X POST http://localhost:3000/graphql \
    -H 'content-type: application/json' -d '{"query":"{ __typename }"}' > /dev/null 2>&1 && UP_POSTS=1
  [ "$UP_TAGGING" = 0 ] && grep -q "tagging is listening" "$LOGS/tagging.log" 2>/dev/null && UP_TAGGING=1
  [ "$UP_POSTS" = 1 ] && [ "$UP_TAGGING" = 1 ] && break
  sleep 1
done
[ "$UP_POSTS" = 1 ] || { echo "posts-api não subiu:"; tail -25 "$LOGS/posts-api.log"; exit 1; }
[ "$UP_TAGGING" = 1 ] || { echo "tagging não subiu:"; tail -25 "$LOGS/tagging.log"; exit 1; }
echo "    as duas aplicações estão no ar"

echo "### 5. a topologia que as duas aplicações declararam"
curl -sf -u "$RABBIT_USER:$RABBIT_PASSWORD" "$RABBIT_API/api/bindings" 2>/dev/null \
  | node -e "let raw='';process.stdin.on('data',(c)=>raw+=c).on('end',()=>{
      for (const b of JSON.parse(raw)) {
        if (!String(b.destination).startsWith('nestposts')) continue;
        console.log('    ' + b.source + '  ' + b.routing_key + '  ->  ' + b.destination);
      }
    })" 2>/dev/null

echo "### 6. o teste"
E2E_LOGS="$LOGS" RABBITMQ_MANAGEMENT="$RABBIT_API" RABBITMQ_USER="$RABBIT_USER" \
  RABBITMQ_PASSWORD="$RABBIT_PASSWORD" node docker/e2e/saga-choreography.mjs
RESULT=$?

if [ $RESULT -ne 0 ]; then
  echo
  echo "### log do tagging (últimas linhas relevantes)"
  tail -30 "$LOGS/tagging.log"
  echo "### log do posts-api (últimas linhas relevantes)"
  tail -30 "$LOGS/posts-api.log"
fi
exit $RESULT
