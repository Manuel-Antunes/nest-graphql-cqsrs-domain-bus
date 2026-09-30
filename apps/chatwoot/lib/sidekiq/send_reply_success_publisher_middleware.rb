# frozen_string_literal: true

require 'json'

module Sidekiq
  class SendReplySuccessPublisherMiddleware
    SEND_REPLY_JOB_CLASS = 'SendReplyJob'
    MAIL_DELIVERY_JOB_CLASS = 'ActionMailer::MailDeliveryJob'
    TARGET_JOB_CLASSES = [SEND_REPLY_JOB_CLASS, MAIL_DELIVERY_JOB_CLASS].freeze
    IDEMPOTENCY_TTL_SECONDS = 24.hours.to_i
    LOGGER = ::Rails.logger

    def call(_worker, job, _queue)
      yield

      job_class = sidekiq_job_class(job)
      return unless TARGET_JOB_CLASSES.include?(job_class)

      message_id = extract_message_id(job_class, job)
      return if message_id.blank?

      message = Message.find_by(id: message_id)
      return if message.blank?
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
        "[SendReplySuccessPublisherMiddleware] Published #{Events::Types::CHATWOOT_SEND_REPLY_SUCCESS} for message_id=#{payload[:messageId]} conversation_id=#{payload[:conversationId]} account_id=#{payload[:accountId]}"
      )
    end

    private

    def sidekiq_job_class(job)
      job['wrapped'] || job['class']
    end

    def extract_message_id(job_class, job)
      return extract_send_reply_message_id(job) if job_class == SEND_REPLY_JOB_CLASS
      return extract_mail_delivery_message_id(job) if job_class == MAIL_DELIVERY_JOB_CLASS

      nil
    end

    def extract_send_reply_message_id(job)
      args = job['args'] || []
      first_arg = args.first

      return first_arg.to_i if first_arg.is_a?(Integer) || first_arg.to_s.match?(/\A\d+\z/)

      if first_arg.is_a?(Hash)
        active_job_args = first_arg['arguments'] || first_arg[:arguments]
        return active_job_args.first.to_i if active_job_args.is_a?(Array)
      end

      nil
    end

    # ActionMailer::MailDeliveryJob payload format:
    # args[0]["arguments"] => [mailer_class, mailer_method, "deliver_now", { ..., "args" => [conversation_gid, message_id] }]
    def extract_mail_delivery_message_id(job)
      payload = (job['args'] || []).first
      return nil unless payload.is_a?(Hash)

      arguments = payload['arguments'] || payload[:arguments]
      return nil unless arguments.is_a?(Array)
      return nil unless arguments[0] == 'ConversationReplyMailer'
      return nil unless arguments[1] == 'reply_with_summary'

      envelope = arguments[3]
      return nil unless envelope.is_a?(Hash)

      mailer_args = envelope['args'] || envelope[:args]
      return nil unless mailer_args.is_a?(Array)

      message_id = mailer_args[1]
      return message_id.to_i if message_id.is_a?(Integer) || message_id.to_s.match?(/\A\d+\z/)

      nil
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

      message.attachments.map(&:push_event_data)
    end

    def publishable_message?(message)
      return false if message.private?
      return false if message.activity?
      return false unless message.incoming?

      message.conversation.present? && message.conversation.contact_id.present?
    end

    def redis_client
      @redis_client ||= Redis.new(Redis::Config.app)
    end
  end
end
