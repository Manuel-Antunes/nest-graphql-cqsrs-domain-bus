# frozen_string_literal: true

# A file attached to a message created through `createANewMessageInAConversation`: the bytes as base64,
# stored as an ActiveStorage blob before the message is built, exactly like an upload through the REST API.
class MessageAttachmentInput < BaseInputObject
  graphql_name 'MessageAttachmentInput'

  argument :data, String, required: true, description: 'The file content, base64-encoded.'
  argument :filename, String, required: true, description: 'The file name, e.g. invoice.pdf.'
  argument :content_type, String, required: true, description: 'The MIME type, e.g. application/pdf or image/png.'
end
