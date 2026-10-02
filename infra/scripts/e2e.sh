#!/usr/bin/env bash
# What the DEPLOYED stack answers, asserted — `apps/web-e2e`'s claims, made from a shell against a
# stage, with the steps `e2e-original.sh` asserts against the Quarkus stack still in their place.
#
# It used to stop after the three anonymous steps, and the reason it can go further now is the
# seeder: `TestUsersSeeder` creates the author through Better Auth itself, so there is a credential
# on the deployed stack to sign in with. Where the original asks Cognito for an ID token, this asks
# `/api/auth/sign-in/email` for a cookie — the rest of the flow is the same assertions.
#
# What it walks: the composed schema, the anonymous and the refused paths, the saga across SNS and
# SQS, the two subscriptions over SSE through the gateway, the screens the browser opens, a file from
# a presigned upload to the CDN, the author's notification, one operation across two subgraphs, an
# organization's tenant, Chatwoot under that organization — its agent, its account, a client's
# contact, a team's hours, its dashboard — Theo, the AG-UI agent, through the web's chat route and the
# posts agent it delegates to over A2A, with a real model, and the conversation it kept as a chat —
# and then, when it can read Better Stack,
# the same run as telemetry: every service reporting, the post's whole life as one trace, and the
# logs inside it.
#
#   ./infra/scripts/e2e.sh dev
#
# Better Stack is read through its SQL endpoint, with the connection Better Stack shows under
# "Connect remotely" — from the environment, or from the `.env` at the root when it has them:
#
#   BETTER_STACK_QUERY_URL        https://<region>-connect.betterstackdata.com
#   BETTER_STACK_QUERY_USERNAME
#   BETTER_STACK_QUERY_PASSWORD
#   BETTER_STACK_COLLECTION       the source's collection, `t123456_name` (its tables are <it>_spans, _logs)
#
# A failure the later steps do not depend on — an email, a trace — is recorded and the run goes on;
# the list is printed at the end, and any of them fails the run.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -z "${API:-}" ]; then
  echo "==> finding the stack"
  eval "$(./infra/scripts/discover.sh "${1:-dev}")"
fi
API="${API%/}"
TARGET="${API:-${STREAM:-}}"
: "${TARGET:?nothing deployed for this stage}"

AUTHOR_EMAIL="${SEED_AUTHOR_EMAIL:-manuel@example.com}"
AUTHOR_PASSWORD="${SEED_AUTHOR_PASSWORD:-segredo123}"
RUN_STARTED="$(date -u '+%Y-%m-%d %H:%M:%S')"

# Everything the run leaves behind, removed however it ends: temporary files, the subscriptions
# still streaming, and the organization when a step failed before deleting it.
TEMPS=()
SSE_PIDS=()
ORGANIZATION_ID=''
cleanup() {
  [ -z "$ORGANIZATION_ID" ] ||
    auth organization/delete "$(jq -nc --arg id "$ORGANIZATION_ID" '{organizationId:$id}')" >/dev/null 2>&1 || true
  for pid in ${SSE_PIDS[@]+"${SSE_PIDS[@]}"}; do kill "$pid" 2>/dev/null || true; done
  rm -f ${TEMPS[@]+"${TEMPS[@]}"}
}
trap cleanup EXIT

JAR="$(mktemp -t nestposts-e2e-cookies)"; TEMPS+=("$JAR")

echo "    api = $TARGET"
echo "    as  = $AUTHOR_EMAIL"

# `$3` is "signed" when the request should carry the session cookie the sign-in step stored, and
# `$TENANT`, when set, is the tenant the request names.
gql() {
  local body vars tenant=()
  vars="${2:-}"
  [ -n "$vars" ] || vars='{}'
  body="$(jq -nc --arg q "$1" --argjson v "$vars" '{query:$q,variables:$v}')"
  [ -z "${TENANT:-}" ] || tenant=(-H "x-tenant: $TENANT")
  if [ "${3:-}" = signed ]; then
    curl -sS -X POST "$TARGET/graphql" -H 'content-type: application/json' \
      -H "origin: $TARGET" -b "$JAR" ${tenant[@]+"${tenant[@]}"} -d "$body"
  else
    curl -sS -X POST "$TARGET/graphql" -H 'content-type: application/json' ${tenant[@]+"${tenant[@]}"} -d "$body"
  fi
}

# Better Auth, through the router, as the signed-in author.
auth() {
  curl -sS -X POST "$TARGET/api/auth/$1" -H 'content-type: application/json' \
    -H "origin: $TARGET" -b "$JAR" -c "$JAR" -d "$2"
}

# The posts subgraph itself, by its function URL: what only the gateway — a router — talks to.
subgraph() {
  local vars body
  vars="${2:-}"
  [ -n "$vars" ] || vars='{}'
  body="$(jq -nc --arg q "$1" --argjson v "$vars" '{query:$q,variables:$v}')"
  curl -sS -X POST "${STREAM%/}/graphql" -H 'content-type: application/json' -d "$body"
}

# A subscription through the gateway, over SSE, the way the browser opens one: POST /graphql with
# `accept: text/event-stream`. It streams into `$1` in the background while the run goes on, and it
# is given up after 150s — the posts subgraph ends a subscription after SUBSCRIPTION_MAX_SECONDS
# (120) anyway. It returns once the stream is open, which is what keeps an event raised right after
# from being missed.
subscribe() {
  local out="$1" vars="${3:-}" body deadline
  [ -n "$vars" ] || vars='{}'
  body="$(jq -nc --arg q "$2" --argjson v "$vars" '{query:$q,variables:$v}')"
  curl -sS -N --max-time 150 -X POST "$TARGET/graphql" -H 'content-type: application/json' \
    -H 'accept: text/event-stream' -d "$body" > "$out" 2>&1 &
  SSE_PIDS+=($!)
  deadline=$((SECONDS + 20))
  until [ -s "$out" ] || [ $SECONDS -ge $deadline ]; do sleep 1; done
  [ -s "$out" ] || fail "the subscription did not open in 20s: $2"
}

# The first event in the stream `$1` that the jq expression `$2` selects, waiting `$3` seconds for it.
event_in() {
  local deadline=$((SECONDS + ${3:-30})) found
  while [ $SECONDS -lt $deadline ]; do
    found=$(sed -n 's/^data: //p' "$1" 2>/dev/null | jq -c "select($2)" 2>/dev/null | head -1)
    if [ -n "$found" ]; then
      echo "$found"
      return 0
    fi
    sleep 1
  done
  return 1
}

# The trace id an event was delivered in: the `traceparent` the gateway puts in its extensions.
trace_of() { echo "$1" | jq -r '.extensions.traceparent // empty' | cut -d- -f2; }

fail() { echo "FAILED: $*" >&2; exit 1; }

# A CPF the domain accepts: nine random digits and the two check digits the rule derives from them.
cpf() {
  local d=() i n sum r
  d[0]=$((RANDOM % 9 + 1))
  for i in 1 2 3 4 5 6 7 8; do d[$i]=$((RANDOM % 10)); done
  for n in 9 10; do
    sum=0
    for ((i = 0; i < n; i++)); do sum=$((sum + d[i] * (n + 1 - i))); done
    r=$(((sum * 10) % 11))
    [ $r -eq 10 ] && r=0
    d[$n]=$r
  done
  printf '%s' "${d[@]}"
}

PROBLEMS=()
problem() {
  echo "    PROBLEM: $*" >&2
  PROBLEMS+=("$*")
}

echo
echo "==> 1. the gateway serves the composed schema, and the posts subgraph declares itself"
: "${STREAM:?no function URL for the posts subgraph — is it deployed?}"
API_SCHEMA=$(curl -sS "$TARGET/graphql/schema.graphql")
echo "$API_SCHEMA" | grep -q 'unreadNotificationCount' \
  || fail "the gateway's schema carries nothing from the notifications subgraph"
SDL=$(subgraph '{ _service { sdl } }' | jq -r '.data._service.sdl // empty')
[ -n "$SDL" ] || fail "_service { sdl } did not answer"
echo "$SDL" | grep -q '@key' || fail 'the SDL carries no @key — federation is not on'
echo "    OK: the supergraph composes both subgraphs; the posts SDL carries its federation directives"

echo
echo "==> 2. a public query answers with NO session"
ANON=$(gql '{ posts(first: 1) { edges { node { id } } } }')
echo "$ANON" | jq -e '.data.posts' >/dev/null || fail "the public query failed: $ANON"
echo "    OK: posts answers anonymously (@AllowAnonymous, under the global guard)"

echo
echo "==> 3. a mutation with NO session is refused"
DENIED=$(gql 'mutation { createPost(input:{title:"x",content:"y"}) { id } }')
echo "$DENIED" | jq -e '.errors[0].extensions.code == "UNAUTHENTICATED"' >/dev/null \
  || fail "expected UNAUTHENTICATED, got: $DENIED"
echo "    OK: UNAUTHENTICATED, from HttpExceptionFilter rather than from a driver"

echo
echo "==> 4. a session, from the credential the seeder created"
SIGNED_IN=$(curl -sS -X POST "$TARGET/api/auth/sign-in/email" \
  -H 'content-type: application/json' -H "origin: $TARGET" -c "$JAR" \
  -d "$(jq -nc --arg e "$AUTHOR_EMAIL" --arg p "$AUTHOR_PASSWORD" '{email:$e,password:$p}')")
echo "$SIGNED_IN" | jq -e '.user.id' >/dev/null \
  || fail "sign-in failed — has Seed run for this stage? got: $SIGNED_IN"
grep -q 'session_token' "$JAR" || fail "signed in but no session cookie was stored"
echo "    OK: signed in as $(echo "$SIGNED_IN" | jq -r '.user.email') (the seeded author)"

echo
echo "==> 5. createPost: born at version 1, with NO tag — with onPostCreated already listening"
CREATED_EVENTS="$(mktemp -t nestposts-on-post-created)"; TEMPS+=("$CREATED_EVENTS")
subscribe "$CREATED_EVENTS" 'subscription { onPostCreated { id version tags { edges { node { name } } } } }'
CREATED=$(gql 'mutation($i:CreatePostInput!){ createPost(input:$i){ id version tags{ edges{ node{ name } } } } }' \
  "$(jq -nc --arg t "post from AWS $(date +%s)" '{i:{title:$t,content:"the saga across SNS and SQS"}}')" \
  signed)
POST_ID=$(echo "$CREATED" | jq -r '.data.createPost.id // empty')
[ -n "$POST_ID" ] || fail "createPost failed: $CREATED"
V1=$(echo "$CREATED" | jq -r '.data.createPost.version')
TAGS1=$(echo "$CREATED" | jq -r '[.data.createPost.tags.edges[].node.name] | join(",")')
echo "    id=$POST_ID version=$V1 tags=[$TAGS1]"
[ "$V1" = "1" ] || fail "expected version 1 on creation, got $V1"
[ -z "$TAGS1" ] || fail "expected NO tag at version 1, got [$TAGS1]"
echo "    OK: PostPreCreated — the post exists and is not complete yet"

echo
echo "==> 6. the saga closes: SNS -> SQS -> tagging -> SNS -> SQS -> posts-api"
echo "    (the first lap pays the cold start of TWO functions)"
DEADLINE=$((SECONDS + 180))
V=0
while [ $SECONDS -lt $DEADLINE ]; do
  NOW=$(gql 'query($id:ID!){ post(id:$id){ version tags{ edges{ node{ name } } } } }' \
    "$(jq -nc --arg id "$POST_ID" '{id:$id}')")
  V=$(echo "$NOW" | jq -r '.data.post.version // 0')
  TAGS=$(echo "$NOW" | jq -r '[.data.post.tags.edges[].node.name] | join(",")')
  if [ "$V" = "2" ]; then
    echo "    version=$V tags=[$TAGS]  (after ${SECONDS}s)"
    [ "$TAGS" = "Untagged" ] || fail "expected the Untagged tag, got [$TAGS]"
    echo "    OK: PostCreated — the OTHER service's decision came back and the projection caught up"
    break
  fi
  printf '.'
  sleep 5
done
[ "$V" = "2" ] || fail "the saga did not close in 180s (last version seen: $V)"

SAGA_TRACE=''
if COMPLETED=$(event_in "$CREATED_EVENTS" \
  ".data.onPostCreated.id == \"$POST_ID\"" 30); then
  echo "$COMPLETED" | jq -e '.data.onPostCreated.version == 2 and ([.data.onPostCreated.tags.edges[].node.name] == ["Untagged"])' >/dev/null \
    || problem "onPostCreated delivered the post before it was complete: $COMPLETED"
  SAGA_TRACE=$(trace_of "$COMPLETED")
  echo "    OK: onPostCreated delivered the COMPLETE post over SSE, through the gateway (trace $SAGA_TRACE)"
else
  problem "onPostCreated never delivered $POST_ID over SSE: $(head -c 400 "$CREATED_EVENTS")"
fi

echo
echo "==> 7. an update crosses too (posts.PostUpdated -> the replica queue) — and onPostUpdated hears it"
UPDATED_EVENTS="$(mktemp -t nestposts-on-post-updated)"; TEMPS+=("$UPDATED_EVENTS")
subscribe "$UPDATED_EVENTS" 'subscription($id:ID){ onPostUpdated(postId:$id){ id title version } }' \
  "$(jq -nc --arg id "$POST_ID" '{id:$id}')"
NEW_TITLE="title changed on AWS $(date +%s)"
UPD=$(gql 'mutation($i:UpdatePostInput!){ updatePost(input:$i){ version } }' \
  "$(jq -nc --arg id "$POST_ID" --arg t "$NEW_TITLE" '{i:{id:$id,title:$t}}')" signed)
V3=$(echo "$UPD" | jq -r '.data.updatePost.version // empty')
[ -n "$V3" ] || fail "updatePost failed: $UPD"
echo "    OK: version=$V3"
if HEARD=$(event_in "$UPDATED_EVENTS" \
  ".data.onPostUpdated.id == \"$POST_ID\" and .data.onPostUpdated.title == \"$NEW_TITLE\"" 30); then
  echo "    OK: onPostUpdated delivered version $(echo "$HEARD" | jq -r .data.onPostUpdated.version) over SSE"
else
  problem "onPostUpdated never delivered the new title of $POST_ID: $(head -c 400 "$UPDATED_EVENTS")"
fi

echo
echo "==> 8. the post is reachable by its federation key alone"
BY_KEY=$(subgraph 'query($r:[_Any!]!){ _entities(representations:$r){ __typename ... on Post { id version } } }' \
  "$(jq -nc --arg id "$POST_ID" '{r:[{__typename:"Post",id:$id}]}')")
echo "$BY_KEY" | jq -e --arg id "$POST_ID" '.data._entities[0].id == $id' >/dev/null \
  || fail "_entities did not resolve the post: $BY_KEY"
echo "    OK: _entities resolved it, with no session — which is what a router would do"

echo
echo "==> 9. the screens: what the browser opens, rendered by the web behind the same router"
PAGE="$(mktemp -t nestposts-page)"; TEMPS+=("$PAGE")

# The status of GET `$1`, its body in $PAGE; "signed" as `$2` sends the author's cookie.
page() {
  if [ "${2:-}" = signed ]; then
    curl -sS -o "$PAGE" -w '%{http_code}' -b "$JAR" "$TARGET$1"
  else
    curl -sS -o "$PAGE" -w '%{http_code}' "$TARGET$1"
  fi
}

for path in / /feed /live /saga /federation /events /auth/sign-in /auth/sign-up; do
  status=$(page "$path")
  [ "$status" = "200" ] || problem "GET $path answered $status to a visitor"
done
echo "    OK: the public screens answer a visitor"

status=$(page "/posts/$POST_ID")
[ "$status" = "200" ] && grep -qF "$NEW_TITLE" "$PAGE" \
  || problem "/posts/$POST_ID ($status) does not render the post's current title"
echo "    OK: /posts/$POST_ID renders what the API holds, to somebody who never signed in"

page /posts/new >/dev/null
grep -q '<form' "$PAGE" && problem "/posts/new offers the form to a visitor"
[ "$(page /posts/new signed)" = "200" ] && grep -q '<form' "$PAGE" \
  || problem "/posts/new offers no form to the author"
echo "    OK: /posts/new asks a visitor to sign in, and hands the author the form"

for path in /settings/account /organization/settings /admin/users; do
  anonymous=$(page "$path")
  signed=$(page "$path" signed)
  [ "$anonymous" = "307" ] || problem "GET $path answered $anonymous to a visitor, not a redirect to sign in"
  [ "$signed" = "200" ] || problem "GET $path answered $signed to the author"
done
echo "    OK: the account screens send a visitor to sign in, and open for the author"

[ "$(page /me signed)" = "200" ] && grep -qF "$AUTHOR_EMAIL" "$PAGE" \
  || problem "/me does not show the author who is signed in"
THROUGH_WEB=$(curl -sS -X POST "$TARGET/api/graphql" -H 'content-type: application/json' \
  -H "origin: $TARGET" -b "$JAR" -d '{"query":"{ me { email } unreadNotificationCount }"}')
echo "$THROUGH_WEB" | jq -e --arg e "$AUTHOR_EMAIL" '.data.me.email == $e and (.data.unreadNotificationCount | type) == "number"' >/dev/null \
  || problem "the web's /api/graphql, the browser's own door to the gateway, did not answer as the author: $THROUGH_WEB"
echo "    OK: /me and the web's /api/graphql answer as the author"

echo
echo "==> 10. a file: uploaded to a presigned URL, attached, served by the CDN, replaced, deleted"
: "${BUCKET:?the stack has no bucket output — is infra/aws/storage deployed?}"
RED="$(mktemp -t nestposts-red)"; TEMPS+=("$RED")
BLUE="$(mktemp -t nestposts-blue)"; TEMPS+=("$BLUE")
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC' | base64 -d > "$RED"
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQCLgDAAH4AVXSujU3AAAAAElFTkSuQmCC' | base64 -d > "$BLUE"

# Prints the staged key, after putting the file where generatePresignedUrl said.
upload() {
  local answer url key status
  answer=$(gql 'mutation($i:GeneratePresignedUrlInput!){ generatePresignedUrl(input:$i){ url key } }' \
    '{"i":{"mimeType":"image/png"}}' signed)
  url=$(echo "$answer" | jq -r '.data.generatePresignedUrl.url // empty')
  key=$(echo "$answer" | jq -r '.data.generatePresignedUrl.key // empty')
  [ -n "$url" ] && [ -n "$key" ] || fail "generatePresignedUrl failed: $answer"
  status=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT -H 'content-type: image/png' \
    -H "origin: $TARGET" --data-binary @"$1" "$url")
  [ "$status" = "200" ] || fail "S3 refused the presigned PUT with $status"
  echo "$key"
}

asset_of() { jq -nc --arg k "$1" --argjson s "$(wc -c < "$2" | tr -d ' ')" \
  '{name:$k,size:$s,extname:"png",mimeType:"image/png"}'; }

served() { curl -sS -o "$1" -w '%{http_code}' "$2"; }

stored() { node infra/scripts/object-exists.mjs "$BUCKET" "$1" >/dev/null; }

STAGED=$(upload "$RED")
WITH_FILE=$(gql 'mutation($i:CreatePostInput!){ createPost(input:$i){ id asset{ name url } } }' \
  "$(jq -nc --arg t "post with a file $(date +%s)" --argjson a "$(asset_of "$STAGED" "$RED")" \
    '{i:{title:$t,content:"one red pixel",asset:$a}}')" signed)
FILE_POST=$(echo "$WITH_FILE" | jq -r '.data.createPost.id // empty')
FIRST=$(echo "$WITH_FILE" | jq -r '.data.createPost.asset.name // empty')
FIRST_URL=$(echo "$WITH_FILE" | jq -r '.data.createPost.asset.url // empty')
[ -n "$FILE_POST" ] || fail "createPost with a file failed: $WITH_FILE"
[[ "$FIRST" =~ ^assets/[0-9a-f-]{36}\.png$ ]] || fail "the file was not moved under assets/: '$FIRST'"
[[ "$FIRST_URL" == "$TARGET/files/$FIRST" ]] || fail "the file is not served by the router: '$FIRST_URL'"
GOT="$(mktemp -t nestposts-got)"; TEMPS+=("$GOT")
[ "$(served "$GOT" "$FIRST_URL")" = "200" ] || fail "the CDN did not serve $FIRST_URL"
cmp -s "$GOT" "$RED" || fail "the CDN served other bytes than the ones uploaded"
stored "$FIRST" || fail "$FIRST is not in s3://$BUCKET"
! stored "$STAGED" || fail "the staged upload $STAGED is still in the bucket"
echo "    OK: $FIRST — moved out of staging, served by the CDN at /files"

REPLACEMENT=$(upload "$BLUE")
REPLACED=$(gql 'mutation($i:UpdatePostInput!){ updatePost(input:$i){ asset{ name url } } }' \
  "$(jq -nc --arg id "$FILE_POST" --argjson a "$(asset_of "$REPLACEMENT" "$BLUE")" '{i:{id:$id,asset:$a}}')" \
  signed)
SECOND=$(echo "$REPLACED" | jq -r '.data.updatePost.asset.name // empty')
SECOND_URL=$(echo "$REPLACED" | jq -r '.data.updatePost.asset.url // empty')
[[ "$SECOND" =~ ^assets/[0-9a-f-]{36}\.png$ ]] && [ "$SECOND" != "$FIRST" ] \
  || fail "updatePost did not replace the file: $REPLACED"
[ "$(served "$GOT" "$SECOND_URL")" = "200" ] && cmp -s "$GOT" "$BLUE" \
  || fail "the CDN did not serve the replacement"
stored "$SECOND" || fail "$SECOND is not in s3://$BUCKET"
! stored "$FIRST" || fail "the replaced file $FIRST is still in the bucket"
echo "    OK: $SECOND replaced it, and $FIRST is gone from the bucket"

DELETED=$(gql 'mutation($id:ID!){ deletePost(id:$id) }' \
  "$(jq -nc --arg id "$FILE_POST" '{id:$id}')" signed)
echo "$DELETED" | jq -e '.data.deletePost == true' >/dev/null || fail "deletePost failed: $DELETED"
GONE=$(gql 'query($id:ID!){ post(id:$id){ id } }' "$(jq -nc --arg id "$FILE_POST" '{id:$id}')")
echo "$GONE" | jq -e '.data.post == null' >/dev/null || fail "the deleted post is still served: $GONE"
! stored "$SECOND" || fail "the deleted post's file $SECOND is still in the bucket"
echo "    OK: the post is gone, and so is its file"

echo
echo "==> 11. the author is told: posts-api -> SNS -> SQS -> notificator -> the database, and SES"
DEADLINE=$((SECONDS + 180))
NOTIFICATION_ID=''
while [ $SECONDS -lt $DEADLINE ]; do
  MINE=$(gql '{ notifications(first: 20) { id type data read } }' '' signed)
  NOTIFICATION_ID=$(echo "$MINE" | jq -r --arg p "$POST_ID" \
    '[.data.notifications[]? | select(.type == "posts.PostCreated" and .data.postId == $p)][0].id // empty')
  [ -n "$NOTIFICATION_ID" ] && break
  printf '.'
  sleep 5
done
[ -n "$NOTIFICATION_ID" ] || fail "no posts.PostCreated notification for $POST_ID in 180s: $MINE"
echo "    OK: notification=$NOTIFICATION_ID stored by the database channel, read back by its author"
: "${NOTIFICATOR_LOGS:?no log group for the notificator — is it deployed?}"
if EMAILED=$(node infra/scripts/notification-delivered.mjs "$NOTIFICATOR_LOGS" "$NOTIFICATION_ID" email 180); then
  echo "    OK: $EMAILED"
else
  problem "the notificator never reported the email of $NOTIFICATION_ID as delivered — look for MessageRejected in its log"
fi
READ=$(gql 'mutation($id:ID!){ markNotificationAsRead(id:$id){ read } }' \
  "$(jq -nc --arg id "$NOTIFICATION_ID" '{id:$id}')" signed)
echo "$READ" | jq -e '.data.markNotificationAsRead.read == true' >/dev/null \
  || fail "markNotificationAsRead failed: $READ"
echo "    OK: marked as read"

echo
echo "==> 12. one operation, two subgraphs: the author from posts, what they were told from the notificator"
ME=$(gql '{ me { email unreadNotificationCount } unreadNotificationCount }' '' signed)
echo "$ME" | jq -e --arg e "$AUTHOR_EMAIL" \
  '.data.me.email == $e and .data.me.unreadNotificationCount == .data.unreadNotificationCount' >/dev/null \
  || fail "the federated query did not answer as the author: $ME"
echo "    OK: $(echo "$ME" | jq -c .data)"

echo
echo "==> 13. an organization is a tenant: its schema, its saga, its notifications — and nobody else's"
SLUG="e2e-$(date +%s)"
ORGANIZATION=$(auth organization/create "$(jq -nc --arg s "$SLUG" '{name:("E2E " + $s),slug:$s}')")
ORGANIZATION_ID=$(echo "$ORGANIZATION" | jq -r '.id // empty')
[ -n "$ORGANIZATION_ID" ] || fail "organization/create failed: $ORGANIZATION"
echo "    organization=$SLUG — its schema made by the trigger and migrated by the plugin's hook"

TENANT="$SLUG"
IN_TENANT=$(gql 'mutation($i:CreatePostInput!){ createPost(input:$i){ id version } }' \
  "$(jq -nc --arg t "post in $SLUG" '{i:{title:$t,content:"written in an organization"}}')" signed)
TENANT_POST=$(echo "$IN_TENANT" | jq -r '.data.createPost.id // empty')
[ -n "$TENANT_POST" ] || fail "createPost in the tenant failed: $IN_TENANT"
DEADLINE=$((SECONDS + 180))
V=0
while [ $SECONDS -lt $DEADLINE ]; do
  V=$(gql 'query($id:ID!){ post(id:$id){ version } }' "$(jq -nc --arg id "$TENANT_POST" '{id:$id}')" signed \
    | jq -r '.data.post.version // 0')
  [ "$V" = "2" ] && break
  printf '.'
  sleep 5
done
[ "$V" = "2" ] || fail "the saga did not close inside the tenant in 180s (last version seen: $V)"
echo "    OK: the saga closed inside $SLUG — tagging and posts-api migrated the tenant on its first message"

# The root tenant is NAMED: a signed-in caller who names none is sent to their active organization by
# the gateway, and creating $SLUG made it the author's active one.
ELSEWHERE=$(TENANT=root gql 'query($id:ID!){ post(id:$id){ id } }' "$(jq -nc --arg id "$TENANT_POST" '{id:$id}')" signed)
echo "$ELSEWHERE" | jq -e '.data.post == null' >/dev/null \
  || fail "the root tenant sees a post written in $SLUG: $ELSEWHERE"
ROOT_FROM_TENANT=$(gql 'query($id:ID!){ post(id:$id){ id } }' "$(jq -nc --arg id "$POST_ID" '{id:$id}')" signed)
echo "$ROOT_FROM_TENANT" | jq -e '.data.post == null' >/dev/null \
  || fail "$SLUG sees a post written in the root tenant: $ROOT_FROM_TENANT"
echo "    OK: neither tenant reads the other's post"

STRANGER=$(gql '{ posts(first: 1) { edges { node { id } } } }')
echo "$STRANGER" | jq -e '.errors[0].extensions.code == "FORBIDDEN"' >/dev/null \
  || fail "a caller who is not a member read $SLUG: $STRANGER"
echo "    OK: FORBIDDEN to whoever is not a member"

DEADLINE=$((SECONDS + 180))
TOLD=''
while [ $SECONDS -lt $DEADLINE ]; do
  TOLD=$(gql '{ notifications(first: 20) { id type data } }' '' signed | jq -r --arg p "$TENANT_POST" \
    '[.data.notifications[]? | select(.type == "posts.PostCreated" and .data.postId == $p)][0].id // empty')
  [ -n "$TOLD" ] && break
  printf '.'
  sleep 5
done
[ -n "$TOLD" ] || fail "no notification of $TENANT_POST inside $SLUG in 180s"
echo "    OK: notification=$TOLD stored in $SLUG by the notificator"

echo
echo "==> 14. Chatwoot, behind the same router and the same session: mirrored, federated, framed"
# The seeded author was a user long before Chatwoot existed on this stage, so being its agent now is
# what `migrate()`'s mirror backfilled; the organization made a moment ago is its account because the
# platform's triggers mirrored it as it was inserted.
SUPPORT=$(gql '{ currentAgent { email user { id email } } currentAccount { id name } }' '' signed)
echo "$SUPPORT" | jq -e --arg e "$AUTHOR_EMAIL" --arg n "E2E $SLUG" \
  '.data.currentAgent.email == ($e | ascii_downcase) and .data.currentAgent.user.email == $e
   and .data.currentAccount.name == $n' >/dev/null \
  || fail "Chatwoot did not answer as the author's agent in $SLUG's account: $SUPPORT"
echo "    OK: $(echo "$SUPPORT" | jq -c '{agent: .data.currentAgent.email, account: .data.currentAccount.name, platformUser: .data.currentAgent.user.id}')"

CLIENT=$(gql 'mutation($i:CreateClientInput!){ createClient(input:$i){ id } }' \
  "$(jq -nc --arg n "E2E client $SLUG" --arg c "$(cpf)" '{i:{name:$n,cpf:$c}}')" signed)
CLIENT_ID=$(echo "$CLIENT" | jq -r '.data.createClient.id // empty')
[ -n "$CLIENT_ID" ] || fail "createClient in $SLUG failed: $CLIENT"
CONTACT=$(gql 'mutation($i:CreateContactInput!){ createContact(input:$i){ contact { id } } }' \
  "$(jq -nc --arg n "E2E contact $SLUG" --arg e "contact-$SLUG@example.com" '{i:{name:$n,email:$e}}')" signed)
CONTACT_ID=$(echo "$CONTACT" | jq -r '.data.createContact.contact.id // empty')
[ -n "$CONTACT_ID" ] || fail "createContact in Chatwoot failed: $CONTACT"
LINKED=$(gql 'mutation($i:LinkContactToClientInput!){ linkContactToClient(input:$i){ contact { id } } }' \
  "$(jq -nc --arg c "$CONTACT_ID" --arg k "$CLIENT_ID" '{i:{contactId:$c,clientId:$k}}')" signed)
echo "$LINKED" | jq -e '.data.linkContactToClient.contact.id' >/dev/null \
  || fail "linkContactToClient failed: $LINKED"
FEDERATED=$(gql '{ clients(first: 200) { edges { node { id contacts { nodes { id dashboardPath } } } } } }' '' signed)
DASHBOARD_PATH=$(echo "$FEDERATED" | jq -r --arg k "$CLIENT_ID" --arg c "$CONTACT_ID" \
  '[.data.clients.edges[].node | select(.id == $k) | .contacts.nodes[] | select(.id == $c) | .dashboardPath][0] // empty')
[ -n "$DASHBOARD_PATH" ] || fail "the client does not list its Chatwoot contact through the gateway: $FEDERATED"
echo "    OK: client=$CLIENT_ID lists contact=$CONTACT_ID from Chatwoot, at $DASHBOARD_PATH"

ANONYMOUS=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "$TARGET/app/")
[ "$ANONYMOUS" = "302 $TARGET/auth/sign-in" ] \
  || fail "Chatwoot's dashboard did not send a stranger to the platform sign-in: $ANONYMOUS"
PAGE="$(mktemp -t nestposts-chatwoot-dashboard)"; TEMPS+=("$PAGE")
FRAMED=$(curl -sS -L --max-redirs 5 -b "$JAR" -o "$PAGE" -w '%{http_code} %{url_effective}' "$TARGET$DASHBOARD_PATH")
case "$FRAMED" in
  "200 $TARGET/app/accounts/"*) ;;
  *) fail "the contact's dashboard page did not open under the session: $FRAMED" ;;
esac
grep -q 'data-page' "$PAGE" || fail "$DASHBOARD_PATH answered 200 without the dashboard's page"
echo "    OK: a stranger is sent to the platform sign-in; the author's session opens $DASHBOARD_PATH"

# The support page frames the dashboard's entry, and the entry redirects within https. Both failed
# only here: the router's root is the web, not Chatwoot, and Puma hears HTTP from the load balancer,
# so its redirect said http:// — which curl follows and a browser blocks inside an https page.
FRAME_SRC=$(curl -sS -b "$JAR" "$TARGET/atendimento" | grep -o '<iframe src="[^"]*"' | head -1 | sed 's/^<iframe src="//; s/"$//')
[ "$FRAME_SRC" = "$TARGET/app" ] \
  || fail "/atendimento does not frame Chatwoot's dashboard at $TARGET/app: '$FRAME_SRC'"
ENTRY=$(curl -sS -b "$JAR" -o /dev/null -w '%{http_code} %{redirect_url}' "$TARGET/app")
case "$ENTRY" in
  "302 $TARGET/app/"*) ;;
  *) fail "Chatwoot's dashboard entry does not redirect within $TARGET: $ENTRY" ;;
esac
echo "    OK: /atendimento frames $FRAME_SRC, which sends the author on to ${ENTRY#302 }"

TEAM=$(auth organization/create-team "$(jq -nc --arg n "Front Desk $SLUG" '{name:$n}')")
TEAM_ID=$(echo "$TEAM" | jq -r '.id // empty')
[ -n "$TEAM_ID" ] || fail "organization/create-team failed: $TEAM"
HOURS=$(gql 'mutation($i:SetTeamWorkingHoursInput!){ setTeamWorkingHours(input:$i){ team { name } } }' \
  "$(jq -nc --arg t "$TEAM_ID" '{i:{teamId:$t,days:[{dayOfWeek:1,openHour:9,openMinutes:0,closeHour:18,closeMinutes:0}]}}')" signed)
echo "$HOURS" | jq -e '.data.setTeamWorkingHours.team.name' >/dev/null \
  || fail "setTeamWorkingHours failed: $HOURS"
TEAMS=$(gql '{ teams { id supportTeam { name } workingHours { nodes { dayOfWeek openHour closeHour } } } }' '' signed)
echo "$TEAMS" | jq -e --arg t "$TEAM_ID" --arg n "front desk $SLUG" \
  '[.data.teams[] | select(.id == $t)][0] | .supportTeam.name == $n
   and .workingHours.nodes == [{dayOfWeek: 1, openHour: 9, closeHour: 18}]' >/dev/null \
  || fail "the platform's team does not show the hours kept in Chatwoot: $TEAMS"
echo "    OK: team=$TEAM_ID is Chatwoot's 'front desk $SLUG', open Mondays 9-18"
TENANT=''

DELETED_ORGANIZATION=$(auth organization/delete "$(jq -nc --arg id "$ORGANIZATION_ID" '{organizationId:$id}')")
echo "$DELETED_ORGANIZATION" | jq -e '(type != "object") or (has("code") | not)' >/dev/null \
  || fail "organization/delete failed: $DELETED_ORGANIZATION"
ORGANIZATION_ID=''
echo "    OK: the organization is deleted, and its schema with it"

echo
echo "==> 15. Theo, through the web's chat: CopilotKit -> AG-UI on AgentCore -> A2A -> the posts agent -> MCP -> the gateway"
[ "$(page /theo signed)" = "200" ] && grep -q 'Theo' "$PAGE" \
  || problem "/theo did not open the chat for the author"
page /theo >/dev/null
grep -q 'Sign in to talk to Theo' "$PAGE" || problem "/theo did not ask a visitor to sign in"
THREAD=$(node -e 'console.log(crypto.randomUUID())')
RUN_INPUT=$(jq -nc --arg t "$THREAD" --arg r "$(node -e 'console.log(crypto.randomUUID())')" \
  --arg m "$(node -e 'console.log(crypto.randomUUID())')" \
  '{threadId:$t, runId:$r, state:{}, tools:[], context:[], forwardedProps:{},
    messages:[{id:$m, role:"user", content:"Who am I on the platform? Answer in one short sentence."}]}')
REFUSED=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$TARGET/api/copilotkit/agent/theo/run" \
  -H 'content-type: application/json' -H 'accept: text/event-stream' -d "$RUN_INPUT")
[ "$REFUSED" = "401" ] || problem "the CopilotKit runtime answered $REFUSED to a visitor, not 401"
THEO_EVENTS="$(mktemp -t nestposts-theo)"; TEMPS+=("$THEO_EVENTS")
curl -sSN --max-time 170 -X POST "$TARGET/api/copilotkit/agent/theo/run" \
  -H 'content-type: application/json' -H 'accept: text/event-stream' \
  -H "origin: $TARGET" -b "$JAR" -d "$RUN_INPUT" \
  | sed -un 's/^data: //p' >"$THEO_EVENTS" || true
THEO_RUN=$(jq -sc '{
    types: [.[].type],
    error: ([.[] | select(.type == "RUN_ERROR") | .message] | first),
    delegate: ([.[] | select(.type == "SUBAGENT_STARTED") | .name] | first),
    said: ([.[] | select(.type == "TEXT_MESSAGE_CONTENT" and .subagentRunId != null) | .delta] | join("")),
    result: ([.[] | select(.type == "TOOL_CALL_RESULT") | .content] | first),
    answer: ([.[] | select(.type == "TEXT_MESSAGE_CONTENT" and .subagentRunId == null) | .delta] | join(""))
  }' "$THEO_EVENTS" 2>/dev/null || echo '{}')
if echo "$THEO_RUN" | jq -e '(.types | index("RUN_FINISHED")) and .error == null
    and .delegate == "Posts Manager" and (.said | length) > 0 and (.result | length) > 0
    and (.answer | length) > 0' >/dev/null; then
  echo "    OK: Theo asked $(echo "$THEO_RUN" | jq -r .delegate), which said: $(echo "$THEO_RUN" | jq -r .said | tr '\n' ' ' | cut -c1-160)"
  echo "    OK: Theo answered: $(echo "$THEO_RUN" | jq -r .answer | tr '\n' ' ' | cut -c1-160)"
else
  problem "Theo's run through /api/copilotkit did not delegate to the posts agent and answer: $(echo "$THEO_RUN" | jq -c '{types, error, delegate, said, result}' | cut -c1-600)"
fi

echo
echo "==> 16. Theo's conversation is a chat: listed by the chat subgraph, read back from Theo's memory, resumed from it"
# Theo records the thread through the gateway as the author, in the tenant the token names — the
# root one, the organization being gone — and the chat subgraph reads the messages from Theo's
# checkpoints in AgentCore Memory, which only the agent writes.
CHAT_QUERY='query TheoChat($id: ID!) {
  chat(id: $id) { id agentId title messages { role content } }
  chats(agentId: "theo") { id }
  me { chats(agentId: "theo") { id } }
}'
CHAT_VARS="$(jq -nc --arg id "$THREAD" '{id:$id}')"
CHAT=$(TENANT=root gql "$CHAT_QUERY" "$CHAT_VARS" signed)
if echo "$CHAT" | jq -e --arg id "$THREAD" '
    .data.chat.agentId == "theo"
    and (.data.chat.title | startswith("Who am I on the platform?"))
    and (.data.chat.messages[0].role == "USER")
    and (.data.chat.messages[0].content | startswith("Who am I on the platform?"))
    and ([.data.chat.messages[] | select(.role == "ASSISTANT" and (.content | length) > 0)] | length) > 0
    and ([.data.chats[].id] | index($id)) != null
    and ([.data.me.chats[].id] | index($id)) != null' >/dev/null; then
  echo "    OK: chat=$THREAD listed (root field and me.chats), $(echo "$CHAT" | jq '.data.chat.messages | length') messages from Theo's checkpoints"
else
  problem "Theo's run was not a chat the chat subgraph lists and reads back: $(echo "$CHAT" | cut -c1-600)"
fi
FOLLOW_UP=$(jq -nc --arg t "$THREAD" --arg r "$(node -e 'console.log(crypto.randomUUID())')" \
  --arg m "$(node -e 'console.log(crypto.randomUUID())')" \
  '{threadId:$t, runId:$r, state:{}, tools:[], context:[], forwardedProps:{},
    messages:[{id:$m, role:"user", content:"Thanks. Answer with one word: yes."}]}')
curl -sSN --max-time 170 -X POST "$TARGET/api/copilotkit/agent/theo/run" \
  -H 'content-type: application/json' -H 'accept: text/event-stream' \
  -H "origin: $TARGET" -b "$JAR" -d "$FOLLOW_UP" >/dev/null || true
RESUMED=$(TENANT=root gql "$CHAT_QUERY" "$CHAT_VARS" signed)
if echo "$RESUMED" | jq -e '
    (.data.chat.messages[0].content | startswith("Who am I on the platform?"))
    and ([.data.chat.messages[] | select(.role == "USER")] | length) == 2
    and (.data.chat.title | startswith("Who am I on the platform?"))' >/dev/null; then
  echo "    OK: a run that sent only its own message went on from the checkpoints: $(echo "$RESUMED" | jq '.data.chat.messages | length') messages, the title kept"
else
  problem "Theo did not resume the thread from its checkpoints: $(echo "$RESUMED" | cut -c1-600)"
fi
for ROUTE in "agent/theo/connect" "threads?agentId=theo"; do
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$TARGET/api/copilotkit/$ROUTE" \
    -H 'content-type: application/json' -H "origin: $TARGET" -b "$JAR" -d "$RUN_INPUT")
  [ "$STATUS" = "404" ] || problem "the CopilotKit runtime answered $STATUS on /$ROUTE, which replays or lists threads by id"
done
DELETED_CHAT=$(TENANT=root gql 'mutation($id: ID!) { deleteChat(id: $id) }' "$CHAT_VARS" signed)
GONE=$(TENANT=root gql "$CHAT_QUERY" "$CHAT_VARS" signed)
if echo "$DELETED_CHAT" | jq -e --arg id "$THREAD" '.data.deleteChat == $id' >/dev/null \
  && echo "$GONE" | jq -e '.data.chat == null' >/dev/null; then
  echo "    OK: deleteChat removed it, and its conversation with it"
else
  problem "deleteChat did not remove chat=$THREAD: $DELETED_CHAT / $GONE"
fi

# One value of the root `.env`, for the Better Stack connection when the environment has none.
from_env_file() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -1 | sed "s/^['\"]//; s/['\"]\$//" || true; }
BETTER_STACK_QUERY_URL="${BETTER_STACK_QUERY_URL:-$(from_env_file BETTER_STACK_QUERY_URL)}"
BETTER_STACK_QUERY_USERNAME="${BETTER_STACK_QUERY_USERNAME:-$(from_env_file BETTER_STACK_QUERY_USERNAME)}"
BETTER_STACK_QUERY_PASSWORD="${BETTER_STACK_QUERY_PASSWORD:-$(from_env_file BETTER_STACK_QUERY_PASSWORD)}"
BETTER_STACK_COLLECTION="${BETTER_STACK_COLLECTION:-$(from_env_file BETTER_STACK_COLLECTION)}"

echo
echo "==> 16. the same run, as telemetry: Better Stack"
TELEMETRY="AND THE WHOLE RUN IS ONE STORY IN BETTER STACK"
if [ -z "$BETTER_STACK_QUERY_URL" ] || [ -z "$BETTER_STACK_QUERY_USERNAME" ] \
  || [ -z "$BETTER_STACK_QUERY_PASSWORD" ] || [ -z "$BETTER_STACK_COLLECTION" ]; then
  echo "    skipped: no BETTER_STACK_QUERY_* connection in the environment or in .env"
  TELEMETRY="AND THE TELEMETRY WAS NOT CHECKED (no BETTER_STACK_QUERY_*)"
else
  SPANS="remote(${BETTER_STACK_COLLECTION}_spans)"
  LOGS="remote(${BETTER_STACK_COLLECTION}_logs)"
  SERVICE="JSONExtractString(raw,'resource','attributes','service.name')"
  TRACE="JSONExtractString(raw,'span','trace_id')"
  SINCE="dt >= parseDateTime64BestEffort('$RUN_STARTED')"

  # A query's rows, tab-separated; Better Stack answers an error as a JSON object, which fails the step.
  betterstack() {
    local answer
    answer=$(curl -sS -u "$BETTER_STACK_QUERY_USERNAME:$BETTER_STACK_QUERY_PASSWORD" \
      -H 'content-type: text/plain' -X POST "${BETTER_STACK_QUERY_URL%/}?output_format_pretty_row_numbers=0" \
      --data-binary "$1 FORMAT TSV")
    case "$answer" in '{"exception"'*) fail "Better Stack refused the query: $answer" ;; esac
    echo "$answer"
  }

  # The services a set of spans came from, sorted and comma-separated.
  services_where() { betterstack "SELECT arrayStringConcat(arraySort(groupUniqArray($SERVICE)), ',') FROM $SPANS WHERE $1"; }

  # Waits up to `$3` seconds for the services of `$1` to include every one of `$2`; prints what it saw.
  services_include() {
    local deadline=$((SECONDS + $3)) seen='' missing
    while :; do
      seen=$(services_where "$1")
      missing=''
      for wanted in $(echo "$2" | tr ',' ' '); do
        case ",$seen," in *",$wanted,"*) ;; *) missing="$missing $wanted" ;; esac
      done
      [ -z "$missing" ] && { echo "$seen"; return 0; }
      [ $SECONDS -ge $deadline ] && { echo "$seen"; return 1; }
      sleep 10
    done
  }

  EVERY_SERVICE='gateway,posts-api,tagging,notificator,web'
  if SEEN=$(services_include "$SINCE" "$EVERY_SERVICE" 180); then
    echo "    OK: spans since the run started from every service: $SEEN"
  else
    problem "not every service reported spans during the run — expected $EVERY_SERVICE, saw ${SEEN:-none}"
  fi

  if [ -z "$SAGA_TRACE" ]; then
    problem "no trace to follow: onPostCreated did not deliver the post, and its traceparent with it"
  else
    SAGA_SERVICES='posts-api,tagging,notificator,gateway'
    if SEEN=$(services_include "$TRACE = '$SAGA_TRACE'" "$SAGA_SERVICES" 180); then
      echo "    OK: the post's life is one trace, $SAGA_TRACE: $SEEN"
      echo "        createPost -> SNS/SQS -> tagging -> SNS/SQS -> posts-api -> the notificator, and the gateway's SSE delivery"
    else
      problem "trace $SAGA_TRACE does not cover the post's whole life — expected $SAGA_SERVICES, saw ${SEEN:-none}"
    fi

    CALLED=$(betterstack "SELECT count() FROM $SPANS WHERE $TRACE = '$SAGA_TRACE' AND $SERVICE = 'gateway' AND JSONExtractString(raw,'span','name') = 'subgraph posts'")
    [ "${CALLED:-0}" -gt 0 ] \
      || problem "the gateway's call to the posts subgraph is not in the trace createPost started — the HTTP hop gateway -> posts-api does not carry the trace"
    [ "${CALLED:-0}" -gt 0 ] && echo "    OK: the gateway's call to the posts subgraph is in the same trace"

    LOGGED=$(betterstack "SELECT arrayStringConcat(arraySort(groupUniqArray($SERVICE)), ',') FROM $LOGS WHERE $TRACE = '$SAGA_TRACE'")
    if [ -n "$LOGGED" ]; then
      echo "    OK: logs inside that trace, from: $LOGGED"
    else
      problem "no log line carries trace $SAGA_TRACE"
    fi
  fi

  WEB_TRACES=$(betterstack "SELECT DISTINCT $TRACE FROM $SPANS WHERE $SINCE AND $SERVICE = 'web' AND JSONExtractString(raw,'span','name') LIKE '%/posts/[id]%' LIMIT 20")
  if [ -z "$WEB_TRACES" ]; then
    problem "the web reported no span for the /posts/[id] it rendered"
  else
    LIST=$(echo "$WEB_TRACES" | sed "s/.*/'&'/" | paste -sd, -)
    REACHED=$(betterstack "SELECT count() FROM $SPANS WHERE $TRACE IN ($LIST) AND $SERVICE = 'gateway'")
    if [ "${REACHED:-0}" -gt 0 ]; then
      echo "    OK: a page's server-side query reaches the gateway inside the page's own trace"
    else
      problem "the web's page traces hold no gateway span — the HTTP hop web -> gateway does not carry the trace"
    fi
  fi
fi

echo
echo "==> queues"
if aws --version >/dev/null 2>&1; then
  for url in $(aws sqs list-queues --query 'QueueUrls[]' --output text 2>/dev/null); do
    depth=$(aws sqs get-queue-attributes --queue-url "$url" \
              --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
              --query 'join(`/`, values(Attributes))' --output text 2>/dev/null || echo '?')
    printf '    %-62s %s\n' "${url##*/}" "$depth"
  done
else
  echo "    skipped: no aws CLI that runs here"
fi

echo
if [ ${#PROBLEMS[@]} -gt 0 ]; then
  echo "================================================================"
  echo "  THE FLOW RAN TO THE END ON AWS, WITH ${#PROBLEMS[@]} PROBLEM(S). post=$POST_ID"
  echo "================================================================"
  for p in "${PROBLEMS[@]}"; do echo "  - $p"; done
  exit 1
fi
echo "================================================================"
echo "  THE SAGA CLOSED ON AWS — IN THE ROOT TENANT AND IN AN ORGANIZATION'S —, THE SUBSCRIPTIONS"
echo "  STREAMED, THE SCREENS RENDERED, A FILE WENT THE WHOLE WAY, THE AUTHOR WAS TOLD, CHATWOOT"
echo "  ANSWERED AS THE AUTHOR'S AGENT AND FEDERATED ITS CONTACTS AND TEAMS —"
echo "  $TELEMETRY. post=$POST_ID"
echo "================================================================"
