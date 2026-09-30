class WebhookListener < BaseListener
  # Upper bound on the per-message send delay a sender may request (ms). Guards
  # against a malformed `delay` scheduling the Evolution webhook far in the
  # future. Well above any realistic multi-bubble turn.
  MAX_OUTGOING_SEND_DELAY_MS = 60_000

  def conversation_status_changed(event)
    conversation = extract_conversation_and_account(event)[0]
    changed_attributes = extract_changed_attributes(event)
    inbox = conversation.inbox
    payload = conversation.webhook_data.merge(event: __method__.to_s, changed_attributes: changed_attributes)
    deliver_webhook_payloads(payload, inbox)
  end

  def conversation_updated(event)
    conversation = extract_conversation_and_account(event)[0]
    changed_attributes = extract_changed_attributes(event)
    inbox = conversation.inbox
    payload = conversation.webhook_data.merge(event: __method__.to_s, changed_attributes: changed_attributes)
    deliver_webhook_payloads(payload, inbox)
  end

  def conversation_created(event)
    conversation = extract_conversation_and_account(event)[0]
    inbox = conversation.inbox
    payload = conversation.webhook_data.merge(event: __method__.to_s)
    deliver_webhook_payloads(payload, inbox)
  end

  def message_created(event)
    message = extract_message_and_account(event)[0]
    inbox = message.inbox

    return unless message.webhook_sendable?

    payload = message.webhook_data.merge(event: __method__.to_s)
    # Outgoing bubbles may carry a per-message `delay` (ms) the sender assigns so
    # consecutive bubbles reach the channel (WhatsApp via Evolution) in distinct
    # 1-second buckets and in order. Defer ONLY the api-inbox/Evolution webhook
    # by that much — account webhooks and the dashboard broadcast stay immediate.
    deliver_webhook_payloads(payload, inbox, api_inbox_send_delay: outgoing_send_delay(message))
  end

  def message_updated(event)
    message = extract_message_and_account(event)[0]
    inbox = message.inbox

    return unless message.webhook_sendable?

    payload = message.webhook_data.merge(event: __method__.to_s)
    deliver_webhook_payloads(payload, inbox)
  end

  def webwidget_triggered(event)
    contact_inbox = event.data[:contact_inbox]
    inbox = contact_inbox.inbox

    payload = contact_inbox.webhook_data.merge(event: __method__.to_s)
    payload[:event_info] = event.data[:event_info]
    deliver_webhook_payloads(payload, inbox)
  end

  def contact_created(event)
    contact, account = extract_contact_and_account(event)
    payload = contact.webhook_data.merge(event: __method__.to_s)
    deliver_account_webhooks(payload, account)
  end

  def contact_updated(event)
    contact, account = extract_contact_and_account(event)
    changed_attributes = extract_changed_attributes(event)
    return if changed_attributes.blank?

    payload = contact.webhook_data.merge(event: __method__.to_s, changed_attributes: changed_attributes)
    deliver_account_webhooks(payload, account)
  end

  def inbox_created(event)
    inbox, account = extract_inbox_and_account(event)
    inbox_webhook_data = Inbox::EventDataPresenter.new(inbox).push_data
    payload = inbox_webhook_data.merge(event: __method__.to_s)
    deliver_account_webhooks(payload, account)
  end

  def inbox_updated(event)
    inbox, account = extract_inbox_and_account(event)
    changed_attributes = extract_changed_attributes(event)
    return if changed_attributes.blank?

    inbox_webhook_data = Inbox::EventDataPresenter.new(inbox).push_data
    payload = inbox_webhook_data.merge(event: __method__.to_s, changed_attributes: changed_attributes)
    deliver_account_webhooks(payload, account)
  end

  def conversation_typing_on(event)
    handle_typing_status(__method__.to_s, event)
  end

  def conversation_typing_off(event)
    handle_typing_status(__method__.to_s, event)
  end

  private

  def handle_typing_status(event_name, event)
    conversation = event.data[:conversation]
    user = event.data[:user]
    inbox = conversation.inbox

    payload = {
      event: event_name,
      user: user.webhook_data,
      conversation: conversation.webhook_data,
      is_private: event.data[:is_private] || false
    }
    deliver_webhook_payloads(payload, inbox)
  end

  def deliver_account_webhooks(payload, account)
    account.webhooks.account_type.each do |webhook|
      next unless webhook.subscriptions.include?(payload[:event])

      WebhookJob.perform_later(webhook.url, payload)
    end
  end

  def deliver_api_inbox_webhooks(payload, inbox, send_delay: nil)
    return unless ['Channel::Api', 'Channel::EvolutionApi'].include?(inbox.channel_type)
    return if inbox.channel.webhook_url.blank?

    job = send_delay ? WebhookJob.set(wait: send_delay) : WebhookJob
    job.perform_later(inbox.channel.webhook_url, payload, :api_inbox_webhook)
  end

  def deliver_webhook_payloads(payload, inbox, api_inbox_send_delay: nil)
    deliver_account_webhooks(payload, inbox.account)
    deliver_api_inbox_webhooks(payload, inbox, send_delay: api_inbox_send_delay)
  end

  # Per-message WhatsApp send delay carried on outgoing bubbles in
  # `content_attributes['delay']` (ms). Returns an ActiveSupport::Duration to
  # hand to `WebhookJob.set(wait:)`, or nil when absent/zero. Capped by
  # {MAX_OUTGOING_SEND_DELAY_MS}. See `message_created` for the why.
  def outgoing_send_delay(message)
    attributes = message.content_attributes
    return if attributes.blank?

    # Indifferent access: content_attributes carries string keys when reloaded
    # from jsonb but may hold symbol keys on a freshly-built record.
    delay_ms = attributes.with_indifferent_access[:delay].to_i
    return if delay_ms <= 0

    [delay_ms, MAX_OUTGOING_SEND_DELAY_MS].min.fdiv(1000).seconds
  end
end
