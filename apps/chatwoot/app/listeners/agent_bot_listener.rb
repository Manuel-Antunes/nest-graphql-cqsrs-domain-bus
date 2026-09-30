class AgentBotListener < BaseListener
  def conversation_resolved(event)
    conversation = extract_conversation_and_account(event)[0]
    inbox = conversation.inbox
    event_name = __method__.to_s
    payload = conversation.webhook_data.merge(event: event_name)
    agent_bots_for(inbox, conversation).each { |agent_bot| process_webhook_bot_event(agent_bot, payload) }
  end

  def conversation_opened(event)
    conversation = extract_conversation_and_account(event)[0]
    inbox = conversation.inbox
    event_name = __method__.to_s
    payload = conversation.webhook_data.merge(event: event_name)
    agent_bots_for(inbox, conversation).each { |agent_bot| process_webhook_bot_event(agent_bot, payload) }
  end

  def message_created(event)
    message = extract_message_and_account(event)[0]
    inbox = message.inbox
    return unless message.webhook_sendable?

    method_name = __method__.to_s
    agent_bots_for(inbox, message.conversation).each { |agent_bot| process_message_event(method_name, agent_bot, message, event) }
  end

  def message_updated(event)
    message = extract_message_and_account(event)[0]
    inbox = message.inbox
    return unless message.webhook_sendable?

    method_name = __method__.to_s
    agent_bots_for(inbox, message.conversation).each { |agent_bot| process_message_event(method_name, agent_bot, message, event) }
  end

  def webwidget_triggered(event)
    contact_inbox = event.data[:contact_inbox]
    inbox = contact_inbox.inbox
    event_name = __method__.to_s
    payload = contact_inbox.webhook_data.merge(event: event_name)
    payload[:event_info] = event.data[:event_info]
    agent_bots_for(inbox).each { |agent_bot| process_webhook_bot_event(agent_bot, payload) }
  end

  private

  def agent_bots_for(inbox, conversation = nil)
    bots = []
    bots << conversation.assignee_agent_bot if conversation&.assignee_agent_bot.present?
    inbox_bot = active_inbox_agent_bot(inbox)
    bots << inbox_bot if inbox_bot.present?
    bots.compact.uniq
  end

  def active_inbox_agent_bot(inbox)
    return unless inbox.agent_bot_inbox&.active?

    inbox.agent_bot
  end

  def process_message_event(method_name, agent_bot, message, _event)
    return process_inner_queue_message(agent_bot, message) if agent_bot.inner_queue?

    payload = message.webhook_data.merge(event: method_name)
    process_webhook_bot_event(agent_bot, payload)
  end

  def process_webhook_bot_event(agent_bot, payload)
    # inner_queue bots only react to customer messages; they ignore the
    # conversation/widget lifecycle events that route through here.
    return if agent_bot.inner_queue?
    return if agent_bot.outgoing_url.blank?

    AgentBots::WebhookJob.perform_later(agent_bot.outgoing_url, payload)
  end

  # Publish an incoming customer message onto the internal agent-bot queue so
  # the NestJS subscriber can route it to the right LangChain agent. We only
  # forward inbound messages — forwarding the bot's own outgoing replies would
  # loop the agent back onto itself.
  def process_inner_queue_message(agent_bot, message)
    return unless publishable_inner_queue_message?(message)

    payload = build_inner_queue_payload(agent_bot, message)
    AgentBots::InnerQueueJob.perform_later(
      Events::Types::AGENT_BOT_INNER_QUEUE,
      payload,
      payload[:idempotencyKey]
    )
  end

  def publishable_inner_queue_message?(message)
    return false if message.blank?
    return false if message.private?
    return false if message.activity?
    return false unless message.incoming?

    message.conversation.present? && message.conversation.contact_id.present?
  end

  def build_inner_queue_payload(agent_bot, message)
    # The contact is guaranteed present (see `publishable_inner_queue_message?`
    # — we only forward INCOMING messages, whose sender is the contact). Forward
    # the contact's display name as `pushName` so the agent can address the
    # person by name; without it the NestJS side defaults to "cliente" and the
    # humanizer invents placeholders.
    contact = message.conversation.contact
    {
      bot: { id: agent_bot.id, name: agent_bot.name },
      botToken: agent_bot.access_token&.token,
      messageId: message.id,
      # PUBLIC (display) id, not the internal FK: every downstream consumer keys
      # off it as Chatwoot's public conversation id — Natasha's REST delivery
      # (POST /accounts/:id/conversations/:display_id/messages) and the email
      # summarizer (GraphQL conversations(id:) → "use como displayId"). Sending
      # message.conversation_id (the internal PK) 404s delivery whenever the two
      # diverge (per-account display_id vs global row id).
      conversationId: message.conversation.display_id,
      inboxId: message.inbox_id,
      contactId: message.conversation.contact_id,
      pushName: contact&.name,
      contactEmail: contact&.email,
      contactPhone: contact&.phone_number,
      accountId: message.account_id,
      content: message.content,
      senderType: message.sender_type,
      senderId: message.sender_id,
      messageType: message.message_type,
      isPrivate: message.private?,
      isActivity: message.activity?,
      attachments: serialize_attachments(message),
      timestamp: Time.current.utc.iso8601,
      idempotencyKey: "agent-bot-#{agent_bot.id}-#{message.account_id}-#{message.conversation_id}-#{message.id}"
    }
  end

  def serialize_attachments(message)
    return [] unless message.attachments.any?

    # `Attachment#push_event_data` returns `data_url: file_url`, the
    # ActiveStorage redirect URL built from FRONTEND_URL — which in our infra
    # points at the web-app domain, not the Chatwoot Rails host, so the
    # downstream lambda gets a 404. Swap in `download_url` (a direct S3 signed
    # URL) for any attachment with an attached file so the consumer can fetch
    # the bytes from S3 directly.
    message.attachments.map do |attachment|
      data = attachment.push_event_data
      data[:data_url] = attachment.download_url if attachment.with_attached_file?
      data
    end
  end
end
