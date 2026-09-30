# frozen_string_literal: true

require 'json'

# Inner-queue counterpart of `AgentBots::WebhookJob`. Instead of POSTing the
# event to a bot's `outgoing_url`, it publishes the agent-bot event payload
# (with the bot's platform access token as `accessToken`, obtained here at
# publish time — the bot's long-lived Chatwoot token never travels) onto the application's event
# backbone (SQS on AWS / Inngest locally) via `AgentBots::InnerQueuePublisher`,
# consumed by our NestJS generic agents subscriber (events-processor). This
# replaces the previous Redis pub/sub: a durable queue means no event is lost
# if the consumer is mid-deploy, and the token never touches an HTTP surface.
#
# Dedupe mirrors the prior `ChatwootSendReplySuccessListener`: a Redis
# `SET nx ex` claim keyed on the event's idempotency key prevents the same
# message from being published twice (e.g. on a job retry).
#
# `channel` is the event pattern (`Events::Types::AGENT_BOT_INNER_QUEUE`) that
# the NestJS consumer matches via `@EventPattern`.
class AgentBots::InnerQueueJob < ApplicationJob
  queue_as :high

  IDEMPOTENCY_TTL_SECONDS = 24.hours.to_i

  def perform(channel, payload, idempotency_key = nil)
    return unless claim_idempotency(idempotency_key)

    begin
      AgentBots::InnerQueuePublisher.publish(channel, with_access_token(payload))
    rescue StandardError
      # The claim is taken before publishing so concurrent/duplicate deliveries
      # dedupe atomically, but a failed publish must release it — otherwise the
      # Sidekiq retry hits the still-held claim, returns early, and the event is
      # silently dropped forever. Release, then re-raise so Sidekiq retries.
      release_idempotency(idempotency_key)
      raise
    end

    Rails.logger.info(
      "[AgentBots::InnerQueueJob] Published #{channel} idempotency_key=#{idempotency_key}"
    )
  end

  private

  # A bot with no platform token is still published, without `accessToken`.
  def with_access_token(payload)
    agent_bot_id = payload.dig(:bot, :id)
    agent_bot = agent_bot_id && AgentBot.find_by(id: agent_bot_id)
    access_token = agent_bot && AgentBots::PlatformAccessToken.for(agent_bot)
    access_token ? payload.merge(accessToken: access_token) : payload
  end

  def claim_idempotency(idempotency_key)
    return true if idempotency_key.blank?

    Redis::Alfred.set(
      "chatwoot:agent_bot_inner_queue:#{idempotency_key}",
      true,
      nx: true,
      ex: IDEMPOTENCY_TTL_SECONDS
    )
  end

  def release_idempotency(idempotency_key)
    return if idempotency_key.blank?

    Redis::Alfred.delete("chatwoot:agent_bot_inner_queue:#{idempotency_key}")
  end
end
