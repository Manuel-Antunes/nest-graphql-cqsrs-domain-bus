import type { AgentId } from '../vo/agent-id';
import type { ChatId } from '../vo/chat-id';

export class ChatOfAnotherAgentException extends Error {
  constructor(
    readonly chatId: ChatId,
    readonly agentId: AgentId,
  ) {
    super(`chat ${chatId} is held with the agent ${agentId}`);
    this.name = 'ChatOfAnotherAgentException';
  }
}
