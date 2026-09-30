# frozen_string_literal: true

require 'json'

class ChatwootSendReplySuccessListener < BaseListener
  include Events::Types

  IDEMPOTENCY_TTL_SECONDS = 24.hours.to_i
  LOGGER = ::Rails.logger

  def message_created(event)
    message = extract_message_and_account(event)[0]
    return unless publishable_message?(message)

    payload = build_payload(message)

    dedupe_key = "chatwoot:send_reply_success:#{payload[:idempotencyKey]}"
    dedupe_acquired = Redis::Alfred.set(
      dedupe_key,
      true,
      nx: true,
      ex: IDEMPOTENCY_TTL_SECONDS,
    )
    return unless dedupe_acquired

    redis_client.publish(
      Events::Types::CHATWOOT_SEND_REPLY_SUCCESS,
      payload.to_json,
    )

    LOGGER.info(
      "[ChatwootSendReplySuccessListener] Published #{Events::Types::CHATWOOT_SEND_REPLY_SUCCESS} for message_id=#{payload[:messageId]} conversation_id=#{payload[:conversationId]} account_id=#{payload[:accountId]}",
    )
  end

  private

  def publishable_message?(message)
    return false if message.blank?
    return false if message.private?
    return false if message.activity?
    return false unless message.incoming?

    message.conversation.present? && message.conversation.contact_id.present?
  end

  def build_payload(message)
    {
      messageId: message.id,
      conversationId: message.conversation_id,
      inboxId: message.inbox_id,
      contactId: message.conversation.contact_id,
      accountId: message.account_id,
      content: message.content,
      senderType: message.sender_type,
      senderId: message.sender_id,
      messageType: message.message_type,
      isPrivate: message.private?,
      isActivity: message.activity?,
      attachments: serialize_attachments(message),
      timestamp: Time.current.utc.iso8601,
      idempotencyKey: "chat-summary-#{message.account_id}-#{message.conversation_id}-#{message.id}",
    }
  end

  def serialize_attachments(message)
    return [] unless message.attachments.any?

    # `Attachment#push_event_data` returns `data_url: file_url`, which is the
    # Rails ActiveStorage redirect URL built from FRONTEND_URL. In our infra
    # FRONTEND_URL points to the web-app domain (where the Chatwoot UI is
    # proxied), not the Chatwoot Rails server — so the lambda that fetches
    # the bytes downstream gets a 404 from the Next.js app. Replace it with
    # `download_url` (a direct S3 signed URL) for any attachment that has an
    # attached file; the lambda can fetch from S3 without depending on the
    # Rails host being reachable.
    message.attachments.map do |attachment|
      data = attachment.push_event_data
      data[:data_url] = attachment.download_url if attachment.with_attached_file?
      data
    end
  end

  def redis_client
    @redis_client ||= Redis.new(Redis::Config.app)
  end
end
