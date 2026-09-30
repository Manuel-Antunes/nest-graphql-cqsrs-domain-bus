import type { Mapper, MappingProfile } from '@automapper/core';
import {
  createMap,
  forMember,
  mapFrom,
  mapWithArguments,
} from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { Client } from '@nestposts/clients/domain/client/client.entity';
import type { ClientFilter } from '@nestposts/clients/domain/client/client.repository';
import type { ClientDetailsInput } from '@nestposts/clients/domain/client/schemas/client-details.schema';
import { Address } from '@nestposts/clients/domain/client/vo/address';
import { ClientDetails } from '@nestposts/clients/domain/client/vo/client-details';
import { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import { ClientKind } from '@nestposts/clients/domain/client/vo/client-kind';
import { ClientStatus } from '@nestposts/clients/domain/client/vo/client-status';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { RegisterClientCommand } from '../../application/client/command/register-client.command';
import { ReviseClientCommand } from '../../application/client/command/revise-client.command';
import type { ClientFilterInput } from '../../dto/graphql/client.input';
import {
  CreateClientInput,
  UpdateClientInput,
} from '../../dto/graphql/client.input';
import { ClientView } from '../../dto/graphql/client.view';
import { UserProfile } from './user.profile';

type DetailField = keyof ClientDetailsInput & keyof UpdateClientInput;

@Injectable()
export class ClientProfile extends AutomapperProfile {
  private static readonly DETAIL_FIELDS: readonly DetailField[] = [
    'name',
    'kind',
    'cpf',
    'rg',
    'birthDate',
    'deathDate',
    'isDeceased',
    'occupation',
    'unionMembership',
    'notes',
    'hasPendingLitigation',
    'hasRenounced',
    'isQualified',
    'documentationComplete',
  ];

  private static readonly REQUIRED_DETAILS: ReadonlySet<DetailField> = new Set([
    'name',
    'kind',
    'cpf',
    'isDeceased',
    'hasPendingLitigation',
    'hasRenounced',
    'isQualified',
    'documentationComplete',
  ]);

  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(
        mapper,
        Client,
        ClientView,
        forMember(
          (view) => view.id,
          mapFrom((client) => client.id),
        ),
        forMember(
          (view) => view.name,
          mapFrom((client) => client.details.name),
        ),
        forMember(
          (view) => view.kind,
          mapFrom((client) => client.details.kind.value),
        ),
        forMember(
          (view) => view.cpf,
          mapFrom((client) => client.details.cpf.value),
        ),
        forMember(
          (view) => view.rg,
          mapFrom((client) => client.details.rg),
        ),
        forMember(
          (view) => view.address,
          mapFrom((client) => client.address.snapshot()),
        ),
        forMember(
          (view) => view.birthDate,
          mapFrom((client) => client.details.birthDate),
        ),
        forMember(
          (view) => view.deathDate,
          mapFrom((client) => client.details.deathDate),
        ),
        forMember(
          (view) => view.isDeceased,
          mapFrom((client) => client.details.isDeceased),
        ),
        forMember(
          (view) => view.status,
          mapFrom((client) => client.status.value),
        ),
        forMember(
          (view) => view.isActive,
          mapFrom((client) => client.isActive),
        ),
        forMember(
          (view) => view.occupation,
          mapFrom((client) => client.details.occupation),
        ),
        forMember(
          (view) => view.unionMembership,
          mapFrom((client) => client.details.unionMembership),
        ),
        forMember(
          (view) => view.notes,
          mapFrom((client) => client.details.notes),
        ),
        forMember(
          (view) => view.hasPendingLitigation,
          mapFrom((client) => client.details.hasPendingLitigation),
        ),
        forMember(
          (view) => view.hasRenounced,
          mapFrom((client) => client.details.hasRenounced),
        ),
        forMember(
          (view) => view.isQualified,
          mapFrom((client) => client.details.isQualified),
        ),
        forMember(
          (view) => view.documentationComplete,
          mapFrom((client) => client.details.documentationComplete),
        ),
        forMember(
          (view) => view.createdBy,
          mapFrom((client) =>
            client.createdBy?.isInitialized()
              ? UserProfile.viewOf(mapper, client.createdBy.getEntity())
              : null,
          ),
        ),
        forMember(
          (view) => view.createdAt,
          mapFrom((client) => client.createdAt),
        ),
        forMember(
          (view) => view.updatedAt,
          mapFrom((client) => client.updatedAt),
        ),
      );

      createMap(
        mapper,
        CreateClientInput,
        RegisterClientCommand.RegisterClient,
        forMember(
          (command) => command.clientId,
          mapFrom(() => ClientId.generate()),
        ),
        forMember(
          (command) => command.details,
          mapFrom((input) => ClientDetails.parse(input)),
        ),
        forMember(
          (command) => command.address,
          mapFrom((input) => Address.parse(input.address ?? {})),
        ),
        forMember(
          (command) => command.registeredBy,
          mapWithArguments((_input, args) => args.registeredBy as User | null),
        ),
      );

      createMap(
        mapper,
        UpdateClientInput,
        ReviseClientCommand.ReviseClient,
        forMember(
          (command) => command.clientId,
          mapFrom((input) => input.id.assertValid()),
        ),
        forMember(
          (command) => command.changes,
          mapFrom((input) => ClientProfile.changesOf(input)),
        ),
      );
    };
  }

  static filterOf(input: ClientFilterInput | null | undefined): ClientFilter {
    return {
      search: input?.search,
      kind: input?.kind ? ClientKind.parse(input.kind) : null,
      status: input?.status ? ClientStatus.parse(input.status) : null,
    };
  }

  private static changesOf(
    input: UpdateClientInput,
  ): ReviseClientCommand.Changes {
    const details = Object.fromEntries(
      ClientProfile.DETAIL_FIELDS.filter((field) =>
        ClientProfile.REQUIRED_DETAILS.has(field)
          ? input[field] != null
          : input[field] !== undefined,
      ).map((field) => [field, input[field]]),
    ) as Partial<ClientDetailsInput>;
    return {
      details: Object.keys(details).length ? details : undefined,
      address: input.address ?? undefined,
      status: input.status ? ClientStatus.parse(input.status) : undefined,
    };
  }
}
