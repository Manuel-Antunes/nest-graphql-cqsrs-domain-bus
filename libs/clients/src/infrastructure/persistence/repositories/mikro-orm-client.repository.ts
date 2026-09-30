import type { Cursor, FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

import { Client } from '../../../domain/client/client.entity';
import type {
  ClientFilter,
  ClientPage,
} from '../../../domain/client/client.repository';
import { ClientRepository } from '../../../domain/client/client.repository';
import type { ClientId } from '../../../domain/client/vo/client-id';

@Injectable()
export class MikroOrmClientRepository extends ClientRepository {
  private static readonly RELATIONS = ['createdBy'] as const;

  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(client: Client): Promise<void> {
    await this.em.persist(client).flush();
  }

  async remove(client: Client): Promise<void> {
    await this.em.remove(client).flush();
  }

  findById(id: ClientId): Promise<Client | null> {
    return inRequestContext(this.em, () =>
      this.em.findOne(
        Client,
        { id },
        { populate: MikroOrmClientRepository.RELATIONS },
      ),
    );
  }

  findMatching(
    filter: ClientFilter,
    page: ClientPage,
  ): Promise<Cursor<Client>> {
    return inRequestContext(this.em, () =>
      this.em.findByCursor(Client, {
        where: MikroOrmClientRepository.matching(filter),
        first: page.first,
        after: page.after ?? undefined,
        orderBy: { details: { name: 'asc' }, id: 'asc' },
        populate: MikroOrmClientRepository.RELATIONS,
      }),
    );
  }

  private static matching({
    search,
    kind,
    status,
  }: ClientFilter): FilterQuery<Client> {
    const text = search?.trim();
    const pattern = text && `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    const digits = text?.replace(/\D/g, '');
    return {
      ...(kind || status
        ? {
            ...(kind ? { details: { kind } } : {}),
            ...(status ? { status } : {}),
          }
        : {}),
      ...(pattern
        ? {
            $or: [
              { details: { name: { $ilike: pattern } } },
              ...(digits
                ? [{ details: { cpf: { $like: `%${digits}%` } } }]
                : []),
            ],
          }
        : {}),
    } as FilterQuery<Client>;
  }
}
