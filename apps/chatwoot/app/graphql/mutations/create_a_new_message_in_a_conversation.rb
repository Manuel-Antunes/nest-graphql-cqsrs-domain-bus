# frozen_string_literal: true

# POST /api/v1/accounts/:account_id/conversations/:conversation_id/messages as a mutation: the same
# Messages::MessageBuilder, handed the same params, acting as the same sender — the caller, a user or an
# agent bot. Attachments arrive base64-encoded and reach the builder as the signed ids of their blobs,
# which it takes as it takes a direct upload.
class Mutations::CreateANewMessageInAConversation < Mutations::SupportBase
  description 'Create a message in a conversation, exactly as the REST API does.'

  argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'
  argument :content, String, required: false, description: 'The message text. May be omitted when attachments are sent.'
  argument :message_type, String, required: false, description: 'outgoing (default), incoming (API inboxes only) or template.'
  argument :private, Boolean, required: false, description: 'When true, a private note visible to agents only.'
  argument :content_type, String, required: false, description: 'text (default), input_select, cards, form, article, …'
  argument :content_attributes, late('JSON'), required: false, description: 'Content attributes (JSON object), e.g. in_reply_to or items.'
  argument :attachments, [MessageAttachmentInput], required: false, description: 'Files to attach to the message.'
  argument :echo_id, String, required: false, description: "The client's own id for the message, echoed back in realtime events."
  argument :source_id, String, required: false, description: 'The id of the message on its channel, when it has one.'

  field :message, late('Message'), null: true

  def resolve(conversation_id:, attachments: nil, content_attributes: nil, **args)
    conversation = find_conversation!(conversation_id)
    authorize!(conversation, :show?)

    params = ActionController::Parameters.new(
      args.merge(content_attributes: coerce_json_object!(content_attributes, 'contentAttributes'),
                 attachments: attachments&.map { |attachment| upload(attachment) }).compact
    )
    { message: build(conversation, params) }
  end

  private

  def build(conversation, params)
    Messages::MessageBuilder.new(current_user, conversation, params).perform
  rescue ActiveRecord::RecordInvalid => e
    raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
  rescue StandardError => e
    raise ::GraphQL::ExecutionError, e.message
  end

  def upload(attachment)
    ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new(Base64.strict_decode64(attachment.data)),
      filename: attachment.filename,
      content_type: attachment.content_type
    ).signed_id
  rescue ArgumentError
    raise ::GraphQL::ExecutionError, "The attachment #{attachment.filename} is not valid base64."
  end
end
