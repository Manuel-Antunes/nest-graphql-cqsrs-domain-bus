import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { IdentityIsNotAUserException } from '../exception/identity-is-not-a-user.exception';
import { SessionNotAuthenticatedException } from '../exception/session-not-authenticated.exception';
import { UserIdentitySchema } from '../schemas/user-identity.schema';
import type { Identity } from './identity';
import { SecurityIdentity } from './security-identity';

/**
 * **A person calling** — through a session of this system's own (a cookie), or through an OAuth access
 * token a client was granted on their behalf.
 *
 * `activeOrganizationId` is a plain string, not an `OrganizationId`: the column is Better Auth's
 * `session`, while the value object belongs to `@nestposts/organizations`, which is built on this
 * package. Whoever knows what an organization is parses it.
 *
 * `scopes` are what the credential may be used for: an OAuth access token's are what the user
 * allowed its client on the consent screen, and a cookie of this system's own holds every one of
 * `OAUTH_SCOPES`, so only its roles restrict it.
 */
export class UserIdentity extends SecurityIdentity(
  ValidatedDto(UserIdentitySchema),
) {
  get principal(): string {
    return this.userId.value;
  }

  /**
   * The caller as a user, or the refusal that says why it is not one: nobody is
   * `SessionNotAuthenticatedException`, an OAuth client is `IdentityIsNotAUserException`.
   */
  static required(identity: Identity | null): UserIdentity {
    if (!identity) {
      throw new SessionNotAuthenticatedException();
    }
    if (identity.kind !== 'user') {
      throw new IdentityIsNotAUserException();
    }
    return identity;
  }
}
