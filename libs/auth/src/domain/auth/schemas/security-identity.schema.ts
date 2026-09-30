import { z } from 'zod';

import { IdentityAttributesSchema } from './identity-attributes.schema';
import { IdentityCredentialSchema } from './identity-credential.schema';

/** What every kind of caller has, whoever it is. */
export const SecurityIdentitySchema = z.object({
  roles: z.array(z.string().trim().min(1)).readonly().default([]),
  scopes: z.array(z.string().trim().min(1)).readonly(),
  activeOrganizationId: z
    .string()
    .min(1)
    .nullish()
    .transform((organizationId) => organizationId ?? null),
  attributes: IdentityAttributesSchema,
  credential: IdentityCredentialSchema.default({ type: 'session' }),
});
