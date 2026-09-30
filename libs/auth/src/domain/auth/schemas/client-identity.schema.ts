import { z } from 'zod';

import { SecurityIdentitySchema } from './security-identity.schema';

export const ClientIdentitySchema = SecurityIdentitySchema.extend({
  kind: z.literal('client').default('client'),
  clientId: z.string().trim().min(1),
});
