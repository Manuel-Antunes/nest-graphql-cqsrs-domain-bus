import { z } from 'zod';

/**
 * What the caller presented: a session of this system's own (a cookie), or an OAuth access token —
 * which one, by its `jti`, and until when it holds.
 */
export const IdentityCredentialSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session') }),
  z.object({
    type: z.literal('access-token'),
    tokenId: z.string().min(1),
    expiresAt: z.date(),
  }),
]);
