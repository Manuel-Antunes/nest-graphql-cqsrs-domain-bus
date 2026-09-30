# frozen_string_literal: true

# The typing indicator of `toggleTypingStatusInConversation`, with the values the REST API takes.
class ConversationTypingStatus < BaseEnum
  graphql_name 'ConversationTypingStatus'

  value 'on', 'The actor started typing.'
  value 'off', 'The actor stopped typing.'
end
