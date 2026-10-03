import type { Ref } from '@mikro-orm/core';
import { ref } from '@mikro-orm/core';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { ChatOfAnotherAgentException } from './exception/chat-of-another-agent.exception';
import type { AgentId } from './vo/agent-id';
import type { ChatId } from './vo/chat-id';
import type { ChatTitle } from './vo/chat-title';

export interface ChatOpening {
  readonly id: ChatId;
  readonly owner: UserId;
  readonly agentId: AgentId;
  readonly title: ChatTitle | null;
}

export class Chat extends BaseEntity {
  id!: ChatId;

  owner!: Ref<User>;

  agentId!: AgentId;

  title: ChatTitle | null = null;

  get threadId(): string {
    return this.id.value;
  }

  static start({ id, owner, agentId, title }: ChatOpening, now: Date): Chat {
    const chat = new Chat();
    chat.id = id;
    chat.owner = ref(User, owner);
    chat.agentId = agentId;
    chat.title = title;
    chat.stampCreation(now);
    return chat;
  }

  isOwnedBy(userId: UserId): boolean {
    return this.owner.id.equals(userId);
  }

  continueWith(agentId: AgentId, title: ChatTitle | null, now: Date): this {
    if (!this.agentId.equals(agentId)) {
      throw new ChatOfAnotherAgentException(this.id, this.agentId);
    }
    this.title ??= title;
    this.touch(now);
    return this;
  }

  retitle(title: ChatTitle, now: Date): this {
    this.title = title;
    this.touch(now);
    return this;
  }
}
