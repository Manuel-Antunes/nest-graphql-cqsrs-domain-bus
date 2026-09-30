import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Client } from '@nestposts/clients/domain/client/client.entity';
import { ClientRepository } from '@nestposts/clients/domain/client/client.repository';
import type { ClientId } from '@nestposts/clients/domain/client/vo/client-id';

export namespace FindClientQuery {
  export class FindClient extends Query<Client | null> {
    constructor(readonly clientId: ClientId) {
      super();
    }
  }

  @QueryHandler(FindClient)
  export class Handler implements IQueryHandler<FindClient> {
    constructor(private readonly clients: ClientRepository) {}

    execute({ clientId }: FindClient): Promise<Client | null> {
      return this.clients.findById(clientId);
    }
  }
}
