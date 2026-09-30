# frozen_string_literal: true

# Publishes an internal agent-bot event onto the application's event backbone,
# replacing the previous Redis pub/sub the NestJS server used to consume.
#
# Strategy by INFRA_PROVIDER:
#   - "aws"  → SQS APP_QUEUE. Consumed by the events-processor's
#              AgentBotSubscriberController, which routes the event to the
#              right agent (natasha / email) and re-enqueues onto its queue.
#   - else   → Inngest event API (local dev / vercel), same standard env vars
#              as the Node Inngest client.
#
# The agent-bot payload (which carries the bot's platform access token as
# `accessToken`, see `AgentBots::InnerQueueJob`) travels under `data`. The NestJS SQS consumer dispatches by the `pattern` field; the
# Inngest consumer dispatches by the event `name`.
class AgentBots::InnerQueuePublisher
  class MissingConfigError < StandardError; end

  def self.publish(pattern, payload)
    new(pattern, payload).publish
  end

  def initialize(pattern, payload)
    @pattern = pattern
    @payload = payload
  end

  def publish
    aws? ? publish_to_sqs : publish_to_inngest
  end

  private

  def aws?
    ENV.fetch('INFRA_PROVIDER', 'aws') == 'aws'
  end

  def publish_to_sqs
    require 'aws-sdk-sqs'
    queue_url = ENV.fetch('APP_QUEUE_URL', nil)
    raise MissingConfigError, 'APP_QUEUE_URL is not set' if queue_url.blank?

    # NestJS SqsStrategy parses the body as `{ pattern, data }` and dispatches
    # to the matching `@EventPattern(pattern)` handler. APP_QUEUE is standard
    # (not FIFO), so no MessageGroupId is needed.
    sqs_client.send_message(
      queue_url: queue_url,
      message_body: { pattern: @pattern, data: @payload }.to_json
    )
  end

  def publish_to_inngest
    event_key = ENV.fetch('INNGEST_EVENT_KEY', nil)
    raise MissingConfigError, 'INNGEST_EVENT_KEY is not set' if event_key.blank?

    base = ENV.fetch('INNGEST_EVENT_API_BASE_URL', '').presence || 'https://inn.gs'
    # Inngest event envelope — `name` is the event the registered function
    # (events-processor's @EventPattern) listens on; `data` is the payload.
    RestClient.post(
      "#{base}/e/#{event_key}",
      { name: @pattern, data: @payload }.to_json,
      content_type: :json, accept: :json
    )
  end

  def sqs_client
    @sqs_client ||= Aws::SQS::Client.new(region: ENV.fetch('AWS_REGION', 'us-east-1'))
  end
end
