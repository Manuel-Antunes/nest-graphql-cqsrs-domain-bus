import type { Mapper } from '@automapper/core';
import { InjectMapper, MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '@nestposts/auth/decorators/current-user.decorator';
import { RequireScopes } from '@nestposts/auth/decorators/require-scopes.decorator';
import { Client } from '@nestposts/clients/domain/client/client.entity';
import { ClientNotFoundException } from '@nestposts/clients/domain/client/exception/client-not-found.exception';
import { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import { CurrentTenant } from '@nestposts/database';
import { MemberCan } from '@nestposts/organizations/decorators/org-roles.decorator';
import { CLIENT_RESOURCE } from '@nestposts/organizations/infrastructure/better-auth/access';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { ClientRequest } from '../../application/client/client-request';
import { RegisterClientCommand } from '../../application/client/command/register-client.command';
import { RemoveClientCommand } from '../../application/client/command/remove-client.command';
import { ReviseClientCommand } from '../../application/client/command/revise-client.command';
import { FindClientQuery } from '../../application/client/query/find-client.query';
import {
  CreateClientInput,
  UpdateClientInput,
} from '../../dto/graphql/client.input';
import { ClientView } from '../../dto/graphql/client.view';

@RequireScopes('write:clients')
@Resolver('Client')
export class ClientMutationResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  @Mutation('createClient')
  @MemberCan({ permissions: { [CLIENT_RESOURCE]: ['create'] } })
  @UseInterceptors(MapInterceptor(Client, ClientView))
  async createClient(
    @Args('input') input: CreateClientInput,
    @CurrentUser() registeredBy: User,
    @CurrentTenant() tenantId: string,
  ): Promise<Client> {
    const command = await this.mapper.mapAsync(
      input,
      CreateClientInput,
      RegisterClientCommand.RegisterClient,
      { extraArgs: () => ({ registeredBy }) },
    );
    const clientId = await this.commandBus.execute(
      command,
      new ClientRequest(command.clientId, tenantId),
    );
    return this.saved(clientId);
  }

  @Mutation('updateClient')
  @MemberCan({ permissions: { [CLIENT_RESOURCE]: ['update'] } })
  @UseInterceptors(MapInterceptor(Client, ClientView))
  async updateClient(
    @Args('input') input: UpdateClientInput,
    @CurrentTenant() tenantId: string,
  ): Promise<Client> {
    const command = await this.mapper.mapAsync(
      input,
      UpdateClientInput,
      ReviseClientCommand.ReviseClient,
    );
    await this.commandBus.execute(
      command,
      new ClientRequest(command.clientId, tenantId),
    );
    return this.saved(command.clientId);
  }

  @Mutation('deleteClient')
  @MemberCan({ permissions: { [CLIENT_RESOURCE]: ['delete'] } })
  async deleteClient(
    @Args('id') id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<boolean> {
    const clientId = ClientId.parse(id);
    await this.commandBus.execute(
      new RemoveClientCommand.RemoveClient(clientId),
      new ClientRequest(clientId, tenantId),
    );
    return true;
  }

  private async saved(clientId: ClientId): Promise<Client> {
    const client = await this.queryBus.execute(
      new FindClientQuery.FindClient(clientId),
    );
    if (!client) {
      throw new ClientNotFoundException(clientId);
    }
    return client;
  }
}
