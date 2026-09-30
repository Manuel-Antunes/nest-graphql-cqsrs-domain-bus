import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ResolveReference, Resolver } from '@nestjs/graphql';
import { Client } from '@nestposts/clients/domain/client/client.entity';
import { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { FindClientQuery } from '../../application/client/query/find-client.query';
import { ClientView } from '../../dto/graphql/client.view';
import type { EntityReference } from './entity-reference';

@AllowAnonymous()
@Resolver('Client')
export class ClientEntityResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @UseInterceptors(MapInterceptor(Client, ClientView))
  async resolveReference(reference: EntityReference): Promise<Client | null> {
    const clientId = ClientId.safeParse(reference.id);
    return clientId.success
      ? this.queryBus.execute(new FindClientQuery.FindClient(clientId.data))
      : null;
  }
}
