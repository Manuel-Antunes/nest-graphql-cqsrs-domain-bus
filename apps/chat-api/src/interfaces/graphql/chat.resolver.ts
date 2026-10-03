import { UseFilters } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CurrentIdentity } from '@nestposts/auth/decorators/current-identity.decorator';
import { RequireScopes } from '@nestposts/auth/decorators/require-scopes.decorator';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { HttpExceptionFilter } from '@nestposts/auth/filters/http-exception.filter';
import { AgentId } from '@nestposts/chat/domain/chat/vo/agent-id';
import { ChatId } from '@nestposts/chat/domain/chat/vo/chat-id';
import { ChatExceptionFilter } from '@nestposts/chat/filters/chat-exception.filter';
import { CurrentTenant } from '@nestposts/database';

import { ChatMessagesQuery } from '../../application/chat/query/chat-messages.query';
import { FindChatQuery } from '../../application/chat/query/find-chat.query';
import { FindChatsQuery } from '../../application/chat/query/find-chats.query';
import { ChatOwner } from './chat-owner';
import { type ChatMessageView, type ChatView, ChatViews } from './views';

@Resolver('Chat')
@RequireScopes('read:chats')
@UseFilters(HttpExceptionFilter, ChatExceptionFilter)
export class ChatResolver {
  static readonly FIRST = 30;

  constructor(private readonly queryBus: QueryBus) {}

  @Query('chats')
  async chats(
    @CurrentIdentity() identity: Identity | null,
    @Args('agentId') agentId?: string | null,
    @Args('first') first?: number | null,
  ): Promise<ChatView[]> {
    const chats = await this.queryBus.execute(
      new FindChatsQuery.FindChats(ChatOwner.of(identity), {
        agentId: agentId ? AgentId.parse(agentId) : null,
        first: first ?? ChatResolver.FIRST,
      }),
    );
    return chats.map(ChatViews.of);
  }

  @Query('chat')
  async chat(
    @CurrentIdentity() identity: Identity | null,
    @Args('id') id: string,
  ): Promise<ChatView | null> {
    const chatId = ChatId.safeParse(id);
    if (!chatId.success) return null;
    const chat = await this.queryBus.execute(
      new FindChatQuery.FindChat(chatId.data, ChatOwner.of(identity)),
    );
    return chat ? ChatViews.of(chat) : null;
  }

  @ResolveField('messages')
  async messages(
    @Parent() view: ChatView,
    @CurrentTenant() tenant: string,
  ): Promise<ChatMessageView[]> {
    const messages = await this.queryBus.execute(
      new ChatMessagesQuery.ChatMessages(view.chat, tenant),
    );
    return ChatViews.messagesOf(messages, view.id);
  }
}
