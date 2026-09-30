class AgentBots::WebhookJob < WebhookJob
  queue_as :high

  # The bot's platform access token is obtained when the event is delivered, never when it is queued, and a
  # bot that has none is still delivered to, without the header.
  def perform(url, payload, webhook_type = :agent_bot_webhook, agent_bot_id: nil)
    Webhooks::Trigger.execute(url, payload, webhook_type, headers: authorization(agent_bot_id))
  end

  private

  def authorization(agent_bot_id)
    agent_bot = agent_bot_id && AgentBot.find_by(id: agent_bot_id)
    access_token = agent_bot && AgentBots::PlatformAccessToken.for(agent_bot)
    access_token ? { 'Authorization' => "Bearer #{access_token}" } : {}
  end
end
