import type { Cursor } from '@mikro-orm/core';

import type { Client } from './client.entity';
import type { ClientId } from './vo/client-id';
import type { ClientKind } from './vo/client-kind';
import type { ClientStatus } from './vo/client-status';

export interface ClientFilter {
  readonly search?: string | null;
  readonly kind?: ClientKind | null;
  readonly status?: ClientStatus | null;
}

export interface ClientPage {
  readonly first: number;
  readonly after?: string | null;
}

export abstract class ClientRepository {
  abstract save(client: Client): Promise<void>;
  abstract remove(client: Client): Promise<void>;
  abstract findById(id: ClientId): Promise<Client | null>;
  abstract findMatching(
    filter: ClientFilter,
    page: ClientPage,
  ): Promise<Cursor<Client>>;
}
