import { MapInterceptor } from '@automapper/nestjs';
import type { Cursor } from '@mikro-orm/core';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { RequireScopes } from '@nestposts/auth/decorators/require-scopes.decorator';
import { Client } from '@nestposts/clients/domain/client/client.entity';
import { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import { MemberCan } from '@nestposts/organizations/decorators/org-roles.decorator';
import { CLIENT_RESOURCE } from '@nestposts/organizations/infrastructure/better-auth/access';

import { FindClientQuery } from '../../application/client/query/find-client.query';
import { FindClientsQuery } from '../../application/client/query/find-clients.query';
import type { ClientFilterInput } from '../../dto/graphql/client.input';
import { ClientView } from '../../dto/graphql/client.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';
import { ClientProfile } from '../mapper/client.profile';

@RequireScopes('read:clients')
@Resolver('Client')
export class ClientQueryResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query('clients')
  @MemberCan({ permissions: { [CLIENT_RESOURCE]: ['read'] } })
  @UseInterceptors(ConnectionInterceptor(Client, ClientView))
  clients(
    @Args('filter') filter?: ClientFilterInput | null,
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Promise<Cursor<Client>> {
    return this.queryBus.execute(
      new FindClientsQuery.FindClients(
        ClientProfile.filterOf(filter),
        first,
        after,
      ),
    );
  }

  @Query('client')
  @MemberCan({ permissions: { [CLIENT_RESOURCE]: ['read'] } })
  @UseInterceptors(MapInterceptor(Client, ClientView))
  client(@Args('id') id: string): Promise<Client | null> {
    return this.queryBus.execute(
      new FindClientQuery.FindClient(ClientId.parse(id)),
    );
  }
}
