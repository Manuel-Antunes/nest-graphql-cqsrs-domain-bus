/**
 * WebMCP tool: `send_message` — send a message in the open conversation, via
 * the same `createPendingMessageAndSend` Vuex action the ReplyBox uses.
 * Public reply by default; set `private` for an internal note.
 */
import store from 'dashboard/store';
import { useMcpTool } from '../useMcpTool';
import { ok, resolveConversationId } from './shared';

export function registerSendMessageTool() {
  return useMcpTool({
    name: 'send_message',
    description:
      'Send a message in the open conversation (or an explicit conversationId). By default sends a public reply to the contact; set private=true to post an internal note instead.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message text to send.',
        },
        private: {
          type: 'boolean',
          description:
            'If true, post a private internal note instead of a public reply. Default false.',
        },
        conversationId: {
          type: 'number',
          description: 'Conversation id. Defaults to the open conversation.',
        },
      },
      required: ['message'],
    },
    handler: async (args = {}) => {
      const message = (args.message || '').trim();
      if (!message) {
        throw new Error('`message` is required and cannot be empty.');
      }

      const conversationId = resolveConversationId(args.conversationId);
      if (!conversationId) {
        throw new Error(
          'No conversation in context. Open a conversation or pass `conversationId`.'
        );
      }

      const isPrivate = !!args.private;
      await store.dispatch('createPendingMessageAndSend', {
        conversationId,
        message,
        private: isPrivate,
      });

      return ok(
        `${
          isPrivate ? 'Private note' : 'Message'
        } sent to conversation ${conversationId}.`
      );
    },
  });
}
