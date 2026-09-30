import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import type { Client } from '@nestposts/clients/domain/client/client.entity';
import { ClientKind } from '@nestposts/clients/domain/client/vo/client-kind';
import { ClientsInfrastructureModule } from '@nestposts/clients/infrastructure/clients-infrastructure.module';

import { aClient, TENANT } from '../../../../test/support/client-fixtures';
import {
  createCqrsTestingModule,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { ClientRequest } from '../client-request';
import { RegisterClientCommand } from '../command/register-client.command';
import { FindClientsQuery } from './find-clients.query';

describe('FindClientsQuery.Handler', () => {
  let module: TestingModule;

  const names = async (
    filter: FindClientsQuery.FindClients['filter'],
  ): Promise<string[]> => {
    const cursor = await inRequestContext(module, () =>
      module.get(QueryBus).execute(new FindClientsQuery.FindClients(filter)),
    );
    return cursor.items.map((client: Client) => client.details.name.value);
  };

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [RegisterClientCommand.Handler, FindClientsQuery.Handler],
      [ClientsInfrastructureModule],
    );
    for (const command of [
      aClient({ name: 'Maria Oliveira', cpf: '529.982.247-25', kind: 'HEIR' }),
      aClient({ name: 'João Pereira', cpf: '111.444.777-35' }),
      aClient({ name: 'Ana Maria Souza', cpf: '935.411.347-80' }),
    ]) {
      await inRequestContext(module, () =>
        module
          .get(CommandBus)
          .execute(command, new ClientRequest(command.clientId, TENANT)),
      );
    }
  });

  afterEach(() => module.close());

  it('lists every client by name', async () => {
    expect(await names({})).toEqual([
      'Ana Maria Souza',
      'João Pereira',
      'Maria Oliveira',
    ]);
  });

  it('finds by part of the name, whatever its case', async () => {
    expect(await names({ search: 'maria' })).toEqual([
      'Ana Maria Souza',
      'Maria Oliveira',
    ]);
  });

  it('finds by the CPF’s digits, formatted or not', async () => {
    expect(await names({ search: '444.777' })).toEqual(['João Pereira']);
  });

  it('narrows by kind', async () => {
    expect(await names({ kind: ClientKind.parse('HEIR') })).toEqual([
      'Maria Oliveira',
    ]);
  });
});
