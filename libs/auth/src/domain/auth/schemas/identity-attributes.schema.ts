import { z } from 'zod';

/**
 * Everything a credential says about its caller beyond what an identity models: an access token's
 * custom claims, keyed by claim name. A session of this system's own says nothing more.
 */
export const IdentityAttributesSchema = z
  .record(z.string(), z.unknown())
  .readonly()
  .default({});
