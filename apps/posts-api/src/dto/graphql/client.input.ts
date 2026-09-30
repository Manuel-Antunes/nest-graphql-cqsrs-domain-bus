import { CLIENT_KINDS } from '@nestposts/clients/domain/client/schemas/client-kind.schema';
import { CLIENT_STATUSES } from '@nestposts/clients/domain/client/schemas/client-status.schema';
import { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

const AddressInputSchema = z.object({
  street: z.string().nullish(),
  number: z.string().nullish(),
  complement: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  zipCode: z.string().nullish(),
});

const ClientFieldsSchema = z.object({
  rg: z.string().nullish(),
  address: AddressInputSchema.nullish(),
  birthDate: z.date().nullish(),
  deathDate: z.date().nullish(),
  isDeceased: z.boolean().nullish(),
  occupation: z.string().nullish(),
  unionMembership: z.string().nullish(),
  notes: z.string().nullish(),
  hasPendingLitigation: z.boolean().nullish(),
  hasRenounced: z.boolean().nullish(),
  isQualified: z.boolean().nullish(),
  documentationComplete: z.boolean().nullish(),
});

const CreateClientInputSchema = ClientFieldsSchema.extend({
  name: z.string(),
  kind: z.enum(CLIENT_KINDS).nullish(),
  cpf: z.string(),
});

const UpdateClientInputSchema = ClientFieldsSchema.extend({
  id: ClientId.field(),
  name: z.string().nullish(),
  kind: z.enum(CLIENT_KINDS).nullish(),
  cpf: z.string().nullish(),
  status: z.enum(CLIENT_STATUSES).nullish(),
});

const ClientFilterInputSchema = z.object({
  search: z.string().nullish(),
  kind: z.enum(CLIENT_KINDS).nullish(),
  status: z.enum(CLIENT_STATUSES).nullish(),
});

@InheritValidatedMetadata()
export class CreateClientInput extends ValidatedDto(CreateClientInputSchema) {}

@InheritValidatedMetadata()
export class UpdateClientInput extends ValidatedDto(UpdateClientInputSchema) {}

@InheritValidatedMetadata()
export class ClientFilterInput extends ValidatedDto(ClientFilterInputSchema) {}
