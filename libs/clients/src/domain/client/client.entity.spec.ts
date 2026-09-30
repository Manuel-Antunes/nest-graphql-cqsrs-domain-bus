import type { MikroORM } from '@mikro-orm/core';
import { metadataOnly } from '@nestposts/database/testing';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { ClientEntitySchema } from '../../infrastructure/persistence/entities/client-orm.entity';
import { Client } from './client.entity';
import { ClientRegisteredEvent } from './event/client-registered.event';
import { ClientRemovedEvent } from './event/client-removed.event';
import { ClientRevisedEvent } from './event/client-revised.event';
import { Address } from './vo/address';
import { ClientDetails } from './vo/client-details';
import { ClientId } from './vo/client-id';
import { ClientStatus } from './vo/client-status';

describe('Client', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await metadataOnly([
      ClientEntitySchema,
      UserEntitySchema,
      AuthorshipEntitySchema,
    ]);
  });

  afterAll(() => orm.close());

  const id = ClientId.parse('0f6b1c2d-3e4f-4a5b-8c7d-9e0f1a2b3c4d');
  const now = new Date('2026-09-29T12:00:00.000Z');
  const later = new Date('2026-09-29T12:05:00.000Z');
  const details = ClientDetails.parse({
    name: 'Maria Oliveira',
    cpf: '529.982.247-25',
    kind: 'HEIR',
  });
  const address = Address.parse({ city: 'Recife', state: 'PE' });

  const registered = () => {
    const client = Client.register(id, details, address, null, now);
    client.commit();
    return client;
  };

  it('is registered active, with what it was registered with', () => {
    const client = Client.register(id, details, address, null, now);

    expect(client.id.equals(id)).toBe(true);
    expect(client.details.equals(details)).toBe(true);
    expect(client.address.city).toBe('Recife');
    expect(client.isActive).toBe(true);
    expect(client.createdAt).toEqual(now);
    expect(client.getUncommittedEvents()).toEqual([
      expect.any(ClientRegisteredEvent),
    ]);
  });

  it('is revised, and archived, by one revision', () => {
    const client = registered();

    client.revise(
      {
        details: client.details.revisedWith({ occupation: 'Teacher' }),
        status: ClientStatus.parse('ARCHIVED'),
      },
      later,
    );

    expect(client.details.occupation).toBe('Teacher');
    expect(client.isActive).toBe(false);
    expect(client.updatedAt).toEqual(later);
    expect(client.getUncommittedEvents()).toEqual([
      expect.any(ClientRevisedEvent),
    ]);
  });

  it('raises nothing for a revision that changes nothing', () => {
    const client = registered();

    client.revise(
      {
        details: ClientDetails.parse(details.snapshot()),
        address: Address.parse(address.snapshot()),
      },
      later,
    );

    expect(client.getUncommittedEvents()).toEqual([]);
  });

  it('is removed with an event saying so', () => {
    const client = registered();

    client.remove(later);

    expect(client.getUncommittedEvents()).toEqual([
      expect.any(ClientRemovedEvent),
    ]);
  });
});
