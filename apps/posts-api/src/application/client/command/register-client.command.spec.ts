import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Client } from '@nestposts/clients/domain/client/client.entity';
import { ClientRegisteredEvent } from '@nestposts/clients/domain/client/event/client-registered.event';
import { ClientRevisedEvent } from '@nestposts/clients/domain/client/event/client-revised.event';
import { ClientStatus } from '@nestposts/clients/domain/client/vo/client-status';
import { ClientsInfrastructureModule } from '@nestposts/clients/infrastructure/clients-infrastructure.module';
import { UniqueConstraintViolationException } from '@nestposts/database';

import { aClient, TENANT } from '../../../../test/support/client-fixtures';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import { givenAUser } from '../../../../test/support/post-fixtures';
import { ClientRequest } from '../client-request';
import { RegisterClientCommand } from './register-client.command';
import { ReviseClientCommand } from './revise-client.command';

describe('registering and revising a client', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  const register = (command: RegisterClientCommand.RegisterClient) =>
    inRequestContext(module, () =>
      commands.execute(command, new ClientRequest(command.clientId, TENANT)),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [RegisterClientCommand.Handler, ReviseClientCommand.Handler],
      [ClientsInfrastructureModule],
    );
    commands = module.get(CommandBus);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('keeps the client, with who registered them, and publishes ClientRegistered', async () => {
    const ana = await givenAUser(module, 'ana@example.com', 'ana');
    const command = aClient({ name: 'Maria Oliveira' }, ana);

    await register(command);

    const saved = await freshEm(module).findOneOrFail(
      Client,
      { id: command.clientId },
      { populate: ['createdBy'] },
    );
    expect(saved.details.name.value).toBe('Maria Oliveira');
    expect(saved.address.city).toBe('Recife');
    expect(saved.createdBy?.id.equals(ana.id)).toBe(true);
    expect(events.events).toEqual([expect.any(ClientRegisteredEvent)]);
  });

  it('refuses a second client with the same CPF', async () => {
    await register(aClient({ cpf: '529.982.247-25' }));

    await expect(
      register(aClient({ name: 'Someone Else', cpf: '52998224725' })),
    ).rejects.toThrow(UniqueConstraintViolationException);
  });

  it('revises only what it is told to, and archives', async () => {
    const command = aClient({ name: 'Maria Oliveira' });
    await register(command);

    await inRequestContext(module, () =>
      commands.execute(
        new ReviseClientCommand.ReviseClient(command.clientId, {
          details: { occupation: 'Teacher' },
          address: { zipCode: '50000-000' },
          status: ClientStatus.parse('ARCHIVED'),
        }),
        new ClientRequest(command.clientId, TENANT),
      ),
    );

    const saved = await freshEm(module).findOneOrFail(Client, {
      id: command.clientId,
    });
    expect(saved.details.occupation).toBe('Teacher');
    expect(saved.details.name.value).toBe('Maria Oliveira');
    expect(saved.address.city).toBe('Recife');
    expect(saved.address.zipCode).toBe('50000-000');
    expect(saved.isActive).toBe(false);
    expect(events.events.at(-1)).toBeInstanceOf(ClientRevisedEvent);
  });
});
