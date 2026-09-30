import type { ClientDetailsInput } from '@nestposts/clients/domain/client/schemas/client-details.schema';
import { Address } from '@nestposts/clients/domain/client/vo/address';
import { ClientDetails } from '@nestposts/clients/domain/client/vo/client-details';
import { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { RegisterClientCommand } from '../../src/application/client/command/register-client.command';

export const TENANT = 'acme';

export const aClient = (
  details: Partial<ClientDetailsInput> = {},
  registeredBy: User | null = null,
): RegisterClientCommand.RegisterClient =>
  new RegisterClientCommand.RegisterClient(
    ClientId.generate(),
    ClientDetails.parse({
      name: 'Maria Oliveira',
      cpf: '529.982.247-25',
      ...details,
    }),
    Address.parse({ city: 'Recife', state: 'PE' }),
    registeredBy,
  );
