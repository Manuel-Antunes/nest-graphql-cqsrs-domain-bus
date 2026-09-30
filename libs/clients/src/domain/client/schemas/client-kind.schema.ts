import { z } from 'zod';

export const CLIENT_KINDS = ['JUDGMENT_CREDITOR', 'HEIR'] as const;

export type ClientKindValue = (typeof CLIENT_KINDS)[number];

export const DEFAULT_CLIENT_KIND: ClientKindValue = 'JUDGMENT_CREDITOR';

export const CLIENT_KIND_MAX_LENGTH = 32;

export const ClientKindSchema = z
  .enum(CLIENT_KINDS, {
    error: `kind must be one of ${CLIENT_KINDS.join(', ')}`,
  })
  .brand<'ClientKind'>();
