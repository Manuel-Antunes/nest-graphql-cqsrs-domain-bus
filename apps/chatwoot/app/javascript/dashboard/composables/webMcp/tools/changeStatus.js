/**
 * WebMCP tool: `change_conversation_status` — resolve / reopen / set pending /
 * snooze the open conversation, via the same `toggleStatus` Vuex action the
 * ResolveAction button uses.
 */
import store from 'dashboard/store';
import { useMcpTool } from '../useMcpTool';
import { ok, resolveConversationId } from './shared';

const STATUSES = ['open', 'resolved', 'pending', 'snoozed'];

export function registerChangeStatusTool() {
  return useMcpTool({
    name: 'change_conversation_status',
    description:
      'Change the status of the open conversation (or an explicit conversationId): "open" (reopen), "resolved", "pending", or "snoozed". For "snoozed", optionally pass snoozedUntil as a Unix timestamp in seconds (omit for an indefinite snooze).',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: STATUSES,
          description:
            'Target status: open (reopen), resolved, pending, or snoozed.',
        },
        snoozedUntil: {
          type: 'number',
          description:
            'Unix timestamp (seconds) until which to snooze. Only used when status is "snoozed".',
        },
        conversationId: {
          type: 'number',
          description: 'Conversation id. Defaults to the open conversation.',
        },
      },
      required: ['status'],
    },
    handler: async (args = {}) => {
      const { status, snoozedUntil = null } = args;
      if (!STATUSES.includes(status)) {
        throw new Error(
          `Invalid status "${status}". Use one of: ${STATUSES.join(', ')}.`
        );
      }

      const conversationId = resolveConversationId(args.conversationId);
      if (!conversationId) {
        throw new Error(
          'No conversation in context. Open a conversation or pass `conversationId`.'
        );
      }

      await store.dispatch('toggleStatus', {
        conversationId,
        status,
        snoozedUntil: status === 'snoozed' ? snoozedUntil : null,
      });

      return ok(`Conversation ${conversationId} set to "${status}".`);
    },
  });
}
