import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { Chat } from '../../../domain/chat/chat.entity';
import type { ChatQuery } from '../../../domain/chat/chat.repository';
import { ChatRepository } from '../../../domain/chat/chat.repository';
import type { ChatId } from '../../../domain/chat/vo/chat-id';

@Injectable()
export class MikroOrmChatRepository extends ChatRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(chat: Chat): Promise<void> {
    await this.em.persist(chat).flush();
  }

  async remove(chat: Chat): Promise<void> {
    await this.em.remove(chat).flush();
  }

  findById(id: ChatId): Promise<Chat | null> {
    return inRequestContext(this.em, () => this.em.findOne(Chat, { id }));
  }

  findOwnedBy(owner: UserId, { agentId, first }: ChatQuery): Promise<Chat[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        Chat,
        { owner, ...(agentId ? { agentId } : {}) },
        { orderBy: { updatedAt: 'desc', id: 'asc' }, limit: first },
      ),
    );
  }
}
