#!/bin/bash
# The messaging topology, created once LocalStack is ready. It is the local twin of what
# `infra/aws/messaging/` deploys, and the two are meant to be read side by side:
#
#   SNS FIFO topic  nestposts-events.fifo                the exchange: every service publishes here
#   SQS FIFO queue  nestposts-tagging-post-events.fifo   everything the `posts` namespace states
#   SQS FIFO queue  nestposts-posts-api-completed.fifo   PostCreated — the saga coming back
#   + a dead-letter queue per consumer, after five deliveries
#
# WHY FIFO, AND WHY IT IS NOT TUNING
# ==================================
# `apps/tagging` event-sources the Post: it reads the stream, lets the aggregate decide, and appends
# at the next sequence. A `PostUpdated` that overtakes the `PostPreCreated` of the same post makes
# that append land on a sequence already taken. On a standard queue this saga does not work worse —
# it breaks, intermittently and in proportion to load.
#
# What makes ordering exist is the MessageGroupId, and `SnsClientProxy` already sends it: the event's
# AGGREGATE, which is the last segment of the routing key. Two events of one post are ordered against
# each other; different posts go in parallel. The deduplication id is the envelope's identifier,
# which is why ContentBasedDeduplication stays off.
#
# WHY ONE QUEUE PER SERVICE AND NOT ONE PER SLICE
# ===============================================
# Deciding a tag and replicating a stream are two jobs with two failure modes, so a queue each looks
# right — and it was built that way, and then measured:
#
#   inbox <- posts.PostUpdated      from 'posts-api'
#   inbox <- posts.PostPreCreated   from 'posts-api'
#   ERROR  failed to ingest PostUpdatedEvent; it will be REJECTED
#          duplicate key value violates unique constraint "event_log_pkey"
#          Key (stream_id, sequence)=(f126e059-..., 0) already exists.
#
# FIFO orders messages WITHIN a queue, not between queues. Two events of one post arriving through
# two queues are two appends racing for the same position in its stream. It converges — the store
# refuses and SQS redelivers — at the cost of a rejected message and a message group held for a
# visibility timeout. So tagging gets one queue and the whole namespace, which is what its controller
# binds anyway.
#
# WHY A FILTER POLICY AND NOT ONE TOPIC PER EVENT
# ===============================================
# SNS selects a subscription by MESSAGE ATTRIBUTES, and the publisher puts the routing facts there
# (`namespace`, `qualifiedName`, `messageType`, `routingKey`, `origin` — see aws-message.ts). So a
# filter policy is exactly a RabbitMQ binding. `origin` excludes a service's own echo before it is
# delivered and paid for; the origin mark on the message is what actually guards against ingesting it.
#
# WHY RAW MESSAGE DELIVERY
# ========================
# Without it SNS wraps the message in a notification envelope of its own and the message attributes
# never reach SQS — which is the only thing a filter policy can read, so every queue receives
# everything. The deserializer unwraps the notification anyway, which is what makes it invisible.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
TOPIC_NAME="${NESTPOSTS_TOPIC:-nestposts-events.fifo}"

echo "nestposts: creating ${TOPIC_NAME} and its consumers in ${REGION}"

TOPIC_ARN=$(awslocal sns create-topic --name "${TOPIC_NAME}" \
  --attributes '{"FifoTopic":"true","ContentBasedDeduplication":"false"}' \
  --output text --query 'TopicArn')

# A queue, its dead-letter queue, and the subscription that feeds it.
#   $1 queue name (FIFO, so it ends in .fifo)
#   $2 the filter policy: which events this consumer asked for
subscribe() {
  local queue="$1"
  local policy="$2"
  local dlq_name="${queue%.fifo}-dlq.fifo"
  local dlq_url dlq_arn queue_url queue_arn

  dlq_url=$(awslocal sqs create-queue --queue-name "${dlq_name}" \
    --attributes '{"FifoQueue":"true"}' --output text --query 'QueueUrl')
  dlq_arn=$(awslocal sqs get-queue-attributes --queue-url "${dlq_url}" \
    --attribute-names QueueArn --output text --query 'Attributes.QueueArn')

  # maxReceiveCount counts DELIVERIES, not retries: five is the first attempt and four redeliveries.
  queue_url=$(awslocal sqs create-queue --queue-name "${queue}" \
    --attributes "{\"FifoQueue\":\"true\",\"VisibilityTimeout\":\"180\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${dlq_arn}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}" \
    --output text --query 'QueueUrl')
  queue_arn=$(awslocal sqs get-queue-attributes --queue-url "${queue_url}" \
    --attribute-names QueueArn --output text --query 'Attributes.QueueArn')

  # `--attributes` takes key=value,key=value OR one JSON object, and a filter policy has commas in
  # it — which the shorthand parser splits on, with an error about an expected '='. So the policy is
  # escaped into a JSON string and the whole map is passed as JSON.
  local escaped="${policy//\"/\\\"}"
  awslocal sns subscribe \
    --topic-arn "${TOPIC_ARN}" \
    --protocol sqs \
    --notification-endpoint "${queue_arn}" \
    --attributes "{\"RawMessageDelivery\":\"true\",\"FilterPolicy\":\"${escaped}\"}" \
    >/dev/null

  echo "nestposts:   ${queue} ← ${policy}"
}

subscribe "nestposts-tagging-post-events.fifo" \
  '{"namespace":["posts"],"origin":[{"anything-but":["tagging"]}]}'

# `posts-api` publishes PostCreated itself when a post is born WITH tags — both phases in one unit of
# work — so this is the one subscription where excluding a service's own name changes what arrives.
subscribe "nestposts-posts-api-completed.fifo" \
  '{"qualifiedName":["posts.PostCreated"],"origin":[{"anything-but":["posts-api"]}]}'

echo "nestposts: ${TOPIC_ARN} is ready"
