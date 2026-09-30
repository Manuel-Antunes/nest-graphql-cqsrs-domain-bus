import {
  defineEntity,
  p,
  TENANT_SCHEMA,
  valueObjectType,
} from '@nestposts/database';
import { ZodEntity } from '@nestposts/platform/domain/shared/zod-entity';
import { UserEntitySchema } from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { Client } from '../../../domain/client/client.entity';
import { InvalidClientException } from '../../../domain/client/exception/invalid-client.exception';
import { ADDRESS_FIELD_MAX_LENGTH } from '../../../domain/client/schemas/address.schema';
import { ClientSchema } from '../../../domain/client/schemas/client.schema';
import { CLIENT_TEXT_MAX_LENGTH } from '../../../domain/client/schemas/client-details.schema';
import { CLIENT_KIND_MAX_LENGTH } from '../../../domain/client/schemas/client-kind.schema';
import { CLIENT_NAME_MAX_LENGTH } from '../../../domain/client/schemas/client-name.schema';
import { CLIENT_STATUS_MAX_LENGTH } from '../../../domain/client/schemas/client-status.schema';
import { CPF_LENGTH } from '../../../domain/client/schemas/cpf.schema';
import { Address } from '../../../domain/client/vo/address';
import { ClientDetails } from '../../../domain/client/vo/client-details';
import { ClientId } from '../../../domain/client/vo/client-id';
import { ClientKind } from '../../../domain/client/vo/client-kind';
import { ClientName } from '../../../domain/client/vo/client-name';
import { ClientStatus } from '../../../domain/client/vo/client-status';
import { Cpf } from '../../../domain/client/vo/cpf';

const optionalText = () => p.string().length(CLIENT_TEXT_MAX_LENGTH).nullable();
const addressLine = () =>
  p.string().length(ADDRESS_FIELD_MAX_LENGTH).nullable();

export const ClientDetailsEntitySchema = defineEntity({
  class: ClientDetails,
  embeddable: true,
  properties: {
    name: p.type(
      valueObjectType(ClientName, {
        columnType: `varchar(${CLIENT_NAME_MAX_LENGTH})`,
      }),
    ),
    kind: p.type(
      valueObjectType(ClientKind, {
        columnType: `varchar(${CLIENT_KIND_MAX_LENGTH})`,
      }),
    ),
    cpf: p.type(valueObjectType(Cpf, { columnType: `varchar(${CPF_LENGTH})` })),
    rg: optionalText(),
    birthDate: p.datetime().nullable(),
    deathDate: p.datetime().nullable(),
    isDeceased: p.boolean().default(false),
    occupation: optionalText(),
    unionMembership: optionalText(),
    notes: p.text().nullable(),
    hasPendingLitigation: p.boolean().default(false),
    hasRenounced: p.boolean().default(false),
    isQualified: p.boolean().default(false),
    documentationComplete: p.boolean().default(false),
  },
});

export const AddressEntitySchema = defineEntity({
  class: Address,
  embeddable: true,
  properties: {
    street: addressLine(),
    number: addressLine(),
    complement: addressLine(),
    city: addressLine(),
    state: addressLine(),
    zipCode: addressLine(),
  },
});

export const ClientEntitySchema = defineEntity({
  class: Client,
  tableName: 'clients',
  schema: TENANT_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p
      .type(valueObjectType(ClientId, { columnType: 'varchar(36)' }))
      .primary(),
    details: () =>
      p.embedded(ClientDetailsEntitySchema).prefix(false).object(false),
    address: () =>
      p.embedded(AddressEntitySchema).prefix('address_').object(false),
    status: p.type(
      valueObjectType(ClientStatus, {
        columnType: `varchar(${CLIENT_STATUS_MAX_LENGTH})`,
      }),
    ),
    createdBy: () =>
      p.manyToOne(UserEntitySchema).ref().nullable().deleteRule('set null'),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
  uniques: [{ properties: ['details.cpf'] } as { properties: never }],
  indexes: [{ properties: ['details.name', 'id'] } as { properties: never }],
});

ZodEntity(
  Client,
  ClientSchema,
  (error) => new InvalidClientException('invalid client', { cause: error }),
);
