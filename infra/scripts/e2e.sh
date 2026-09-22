#!/usr/bin/env bash
# What the DEPLOYED stack answers, asserted — the same seven steps `e2e-original.sh` asserts against
# the Quarkus stack, so the two can be read side by side.
#
# It used to stop after the three anonymous steps, and the reason it can go further now is the
# seeder: `TestUsersSeeder` creates the author through Better Auth itself, so there is a credential
# on the deployed stack to sign in with. Where the original asks Cognito for an ID token, this asks
# `/api/auth/sign-in/email` for a cookie — the rest of the flow is the same assertions.
#
#   ./infra/scripts/e2e.sh dev
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -z "${API:-}" ]; then
  echo "==> finding the stack"
  eval "$(./infra/scripts/discover.sh "${1:-dev}")"
fi
API="${API%/}"
TARGET="${API:-${STREAM:-}}"
: "${TARGET:?nothing deployed for this stage}"

AUTHOR_EMAIL="${SEED_AUTHOR_EMAIL:-autor@example.com}"
AUTHOR_PASSWORD="${SEED_AUTHOR_PASSWORD:-segredo123}"
JAR="$(mktemp -t nestposts-e2e-cookies)"
trap 'rm -f "$JAR"' EXIT

echo "    api = $TARGET"
echo "    as  = $AUTHOR_EMAIL"

# `$3` is "signed" when the request should carry the session cookie the sign-in step stored.
gql() {
  local body vars
  vars="${2:-}"
  [ -n "$vars" ] || vars='{}'
  body="$(jq -nc --arg q "$1" --argjson v "$vars" '{query:$q,variables:$v}')"
  if [ "${3:-}" = signed ]; then
    curl -sS -X POST "$TARGET/graphql" -H 'content-type: application/json' \
      -H "origin: $TARGET" -b "$JAR" -d "$body"
  else
    curl -sS -X POST "$TARGET/graphql" -H 'content-type: application/json' -d "$body"
  fi
}

fail() { echo "FAILED: $*" >&2; exit 1; }

echo
echo "==> 1. the schema is served, and the subgraph declares itself"
SDL=$(gql '{ _service { sdl } }' | jq -r '.data._service.sdl // empty')
[ -n "$SDL" ] || fail "_service { sdl } did not answer"
echo "$SDL" | grep -q '@key' || fail 'the SDL carries no @key — federation is not on'
echo "    OK: SDL served, federation directives included"

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
echo "==> 5. createPost: born at version 1, with NO tag"
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

echo
echo "==> 7. an update crosses too (posts.PostUpdated -> the replica queue)"
UPD=$(gql 'mutation($i:UpdatePostInput!){ updatePost(input:$i){ version } }' \
  "$(jq -nc --arg id "$POST_ID" '{i:{id:$id,title:"title changed on AWS"}}')" signed)
V3=$(echo "$UPD" | jq -r '.data.updatePost.version // empty')
[ -n "$V3" ] || fail "updatePost failed: $UPD"
echo "    OK: version=$V3"

echo
echo "==> 8. the post is reachable by its federation key alone"
BY_KEY=$(gql 'query($r:[_Any!]!){ _entities(representations:$r){ __typename ... on Post { id version } } }' \
  "$(jq -nc --arg id "$POST_ID" '{r:[{__typename:"Post",id:$id}]}')")
echo "$BY_KEY" | jq -e --arg id "$POST_ID" '.data._entities[0].id == $id' >/dev/null \
  || fail "_entities did not resolve the post: $BY_KEY"
echo "    OK: _entities resolved it, with no session — which is what a router would do"

if aws --version >/dev/null 2>&1; then
  echo
  echo "==> queues"
  for url in $(aws sqs list-queues --query 'QueueUrls[]' --output text 2>/dev/null); do
    depth=$(aws sqs get-queue-attributes --queue-url "$url" \
              --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
              --query 'join(`/`, values(Attributes))' --output text 2>/dev/null || echo '?')
    printf '    %-62s %s\n' "${url##*/}" "$depth"
  done
fi

echo
echo "================================================================"
echo "  THE SAGA CLOSED ON AWS. post=$POST_ID"
echo "================================================================"
