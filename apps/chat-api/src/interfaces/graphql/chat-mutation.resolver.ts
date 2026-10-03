import { UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CurrentIdentity } from '@nestposts/auth/decorators/current-identity.decorator';
import { RequireScopes } from '@nestposts/auth/decorators/require-scopes.decorator';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { HttpExceptionFilter } from '@nestposts/auth/filters/http-exception.filter';
import { AgentId } from '@nestposts/chat/domain/chat/vo/agent-id';
import { ChatId } from '@nestposts/chat/domain/chat/vo/chat-id';
import { ChatTitle } from '@nestposts/chat/domain/chat/vo/chat-title';
import { ChatExceptionFilter } from '@nestposts/chat/filters/chat-exception.filter';
import { CurrentTenant } from '@nestposts/database';
import { ValidationExceptionFilter } from '@nestposts/validated-dto/filters/validation-exception.filter';

import { DeleteChatCommand } from '../../application/chat/command/delete-chat.command';
import { RecordChatCommand } from '../../application/chat/command/record-chat.command';
import { RenameChatCommand } from '../../application/chat/command/rename-chat.command';
import { ChatOwner } from './chat-owner';
import { type ChatView, ChatViews } from './views';

interface RecordChatInput {
  readonly id: string;
  readonly agentId: string;
  readonly title?: string | null;
}

interface RenameChatInput {
  readonly id: string;
  readonly title: string;
}

@Resolver()
@RequireScopes('write:chats')
@UseFilters(HttpExceptionFilter, ChatExceptionFilter, ValidationExceptionFilter)
export class ChatMutationResolver {
  constructor(private readonly commandBus: CommandBus) {}

  @Mutation('recordChat')
  async recordChat(
    @CurrentIdentity() identity: Identity | null,
    @Args('input') input: RecordChatInput,
  ): Promise<ChatView> {
    const chat = await this.commandBus.execute(
      new RecordChatCommand.RecordChat(
        ChatId.parse(input.id),
        ChatOwner.of(identity),
        AgentId.parse(input.agentId),
        input.title ? ChatTitle.summarizing(input.title) : null,
      ),
    );
    return ChatViews.of(chat);
  }

  @Mutation('renameChat')
  async renameChat(
    @CurrentIdentity() identity: Identity | null,
    @Args('input') input: RenameChatInput,
  ): Promise<ChatView> {
    const chat = await this.commandBus.execute(
      new RenameChatCommand.RenameChat(
        ChatId.parse(input.id),
        ChatOwner.of(identity),
        ChatTitle.parse(input.title),
      ),
    );
    return ChatViews.of(chat);
  }

  @Mutation('deleteChat')
  async deleteChat(
    @CurrentIdentity() identity: Identity | null,
    @CurrentTenant() tenant: string,
    @Args('id') id: string,
  ): Promise<string> {
    await this.commandBus.execute(
      new DeleteChatCommand.DeleteChat(
        ChatId.parse(id),
        ChatOwner.of(identity),
        tenant,
      ),
    );
    return id;
  }
}
