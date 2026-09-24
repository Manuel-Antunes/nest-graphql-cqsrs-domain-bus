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

AUTHOR_EMAIL="${SEED_AUTHOR_EMAIL:-manuel@example.com}"
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

echo
echo "==> 9. a file: uploaded to a presigned URL, attached, served by the CDN, replaced, deleted"
: "${BUCKET:?the stack has no bucket output — is infra/aws/storage deployed?}"
RED="$(mktemp -t nestposts-red)"; BLUE="$(mktemp -t nestposts-blue)"
trap 'rm -f "$JAR" "$RED" "$BLUE"' EXIT
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
GOT="$(mktemp -t nestposts-got)"
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
rm -f "$GOT"
echo "    OK: the post is gone, and so is its file"

echo
echo "==> 10. the author is told: posts-api -> SNS -> SQS -> notificator -> the database, and SES"
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
EMAILED=$(node infra/scripts/notification-delivered.mjs "$NOTIFICATOR_LOGS" "$NOTIFICATION_ID" email 180) \
  || fail "the notificator never reported the email of $NOTIFICATION_ID as delivered"
echo "    OK: $EMAILED"
READ=$(gql 'mutation($id:ID!){ markNotificationAsRead(id:$id){ read } }' \
  "$(jq -nc --arg id "$NOTIFICATION_ID" '{id:$id}')" signed)
echo "$READ" | jq -e '.data.markNotificationAsRead.read == true' >/dev/null \
  || fail "markNotificationAsRead failed: $READ"
echo "    OK: marked as read"

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
echo "  THE SAGA CLOSED ON AWS, A FILE WENT THE WHOLE WAY, AND THE AUTHOR WAS TOLD. post=$POST_ID"
echo "================================================================"
