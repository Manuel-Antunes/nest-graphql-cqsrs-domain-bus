import type { Cursor } from '@mikro-orm/core';
import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Client } from '@nestposts/clients/domain/client/client.entity';
import type { ClientFilter } from '@nestposts/clients/domain/client/client.repository';
import { ClientRepository } from '@nestposts/clients/domain/client/client.repository';

export namespace FindClientsQuery {
  export const DEFAULT_PAGE_SIZE = 50;
  export const MAX_PAGE_SIZE = 200;

  export class FindClients extends Query<Cursor<Client>> {
    readonly first: number;

    constructor(
      readonly filter: ClientFilter = {},
      first?: number | null,
      readonly after?: string | null,
    ) {
      super();
      this.first = Math.min(
        Math.max(first ?? DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );
    }
  }

  @QueryHandler(FindClients)
  export class Handler implements IQueryHandler<FindClients> {
    constructor(private readonly clients: ClientRepository) {}

    execute({ filter, first, after }: FindClients): Promise<Cursor<Client>> {
      return this.clients.findMatching(filter, { first, after });
    }
  }
}
