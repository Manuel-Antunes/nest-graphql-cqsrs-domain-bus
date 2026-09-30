import { CLIENT_KINDS } from '@nestposts/clients/domain/client/schemas/client-kind.schema';
import { CLIENT_STATUSES } from '@nestposts/clients/domain/client/schemas/client-status.schema';
import { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import { ClientName } from '@nestposts/clients/domain/client/vo/client-name';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import type { IUserView } from './user.view';

const AddressViewSchema = z.object({
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
});

const ClientViewSchema = z.object({
  id: ClientId.field(),
  name: ClientName.field(),
  kind: z.enum(CLIENT_KINDS),
  cpf: z.string(),
  rg: z.string().nullable(),
  address: AddressViewSchema,
  birthDate: z.date().nullable(),
  deathDate: z.date().nullable(),
  isDeceased: z.boolean(),
  status: z.enum(CLIENT_STATUSES),
  isActive: z.boolean(),
  occupation: z.string().nullable(),
  unionMembership: z.string().nullable(),
  notes: z.string().nullable(),
  hasPendingLitigation: z.boolean(),
  hasRenounced: z.boolean(),
  isQualified: z.boolean(),
  documentationComplete: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

@InheritValidatedMetadata()
export class ClientView extends ValidatedDto<
  typeof ClientViewSchema,
  { createdBy: IUserView | null }
>(ClientViewSchema) {}
