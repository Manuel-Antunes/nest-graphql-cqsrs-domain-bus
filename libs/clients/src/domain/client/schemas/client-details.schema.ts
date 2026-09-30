import { z } from 'zod';

import { ClientKind } from '../vo/client-kind';
import { ClientName } from '../vo/client-name';
import { Cpf } from '../vo/cpf';

export const CLIENT_TEXT_MAX_LENGTH = 200;

const OptionalTextSchema = z
  .string()
  .trim()
  .max(CLIENT_TEXT_MAX_LENGTH, `exceeds ${CLIENT_TEXT_MAX_LENGTH} characters`)
  .nullish()
  .transform((text) => text || null);

const OptionalDateSchema = z
  .date()
  .nullish()
  .transform((date) => date ?? null);

const FlagSchema = z
  .boolean()
  .nullish()
  .transform((flag) => flag ?? false);

export const ClientDetailsSchema = z
  .object({
    name: ClientName.field(),
    kind: ClientKind.field()
      .nullish()
      .transform((kind) => kind ?? ClientKind.standard()),
    cpf: Cpf.field(),
    rg: OptionalTextSchema,
    birthDate: OptionalDateSchema,
    deathDate: OptionalDateSchema,
    isDeceased: FlagSchema,
    occupation: OptionalTextSchema,
    unionMembership: OptionalTextSchema,
    notes: z
      .string()
      .trim()
      .nullish()
      .transform((notes) => notes || null),
    hasPendingLitigation: FlagSchema,
    hasRenounced: FlagSchema,
    isQualified: FlagSchema,
    documentationComplete: FlagSchema,
  })
  .refine(
    (details) =>
      !details.birthDate ||
      !details.deathDate ||
      details.deathDate >= details.birthDate,
    { error: 'deathDate cannot precede birthDate', path: ['deathDate'] },
  )
  .refine((details) => !details.deathDate || details.isDeceased, {
    error: 'a client with a deathDate is deceased',
    path: ['isDeceased'],
  });

export type ClientDetailsInput = z.input<typeof ClientDetailsSchema>;
