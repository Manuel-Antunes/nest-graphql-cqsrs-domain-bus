import { UseFilters } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Args,
  Parent,
  ResolveField,
  ResolveReference,
  Resolver,
} from '@nestjs/graphql';
import { CurrentIdentity } from '@nestposts/auth/decorators/current-identity.decorator';
import { RequireScopes } from '@nestposts/auth/decorators/require-scopes.decorator';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { HttpExceptionFilter } from '@nestposts/auth/filters/http-exception.filter';
import { AgentId } from '@nestposts/chat/domain/chat/vo/agent-id';
import { AllowAnonymous, OptionalAuth } from '@thallesp/nestjs-better-auth';

import { FindChatsQuery } from '../../application/chat/query/find-chats.query';
import { ChatResolver } from './chat.resolver';
import { ChatOwner } from './chat-owner';
import { type ChatView, ChatViews } from './views';

interface UserReference {
  readonly id: string;
}

@Resolver('IUser')
@UseFilters(HttpExceptionFilter)
export class UserChatsResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @AllowAnonymous()
  resolveReference(reference: UserReference): UserReference {
    return { id: reference.id };
  }

  @ResolveField('chats')
  @OptionalAuth()
  @RequireScopes('read:chats')
  async chats(
    @Parent() user: UserReference,
    @CurrentIdentity() identity: Identity | null,
    @Args('agentId') agentId?: string | null,
    @Args('first') first?: number | null,
  ): Promise<ChatView[]> {
    if (!ChatOwner.isThe(identity, user.id)) return [];
    const chats = await this.queryBus.execute(
      new FindChatsQuery.FindChats(ChatOwner.of(identity), {
        agentId: agentId ? AgentId.parse(agentId) : null,
        first: first ?? ChatResolver.FIRST,
      }),
    );
    return chats.map(ChatViews.of);
  }
}
