import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { Chat } from './chat.entity';
import type { AgentId } from './vo/agent-id';
import type { ChatId } from './vo/chat-id';

export interface ChatQuery {
  readonly agentId?: AgentId | null;
  readonly first: number;
}

export abstract class ChatRepository {
  abstract save(chat: Chat): Promise<void>;
  abstract remove(chat: Chat): Promise<void>;
  abstract findById(id: ChatId): Promise<Chat | null>;
  abstract findOwnedBy(owner: UserId, query: ChatQuery): Promise<Chat[]>;
}
