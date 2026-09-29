import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { IdentitySchema } from '../schemas/identity.schema';

/**
 * **Who is calling** — the one answer every way in gives: `@CurrentIdentity()`, `AuthService`, the
 * tenant guard and the gateway all read the caller as an `Identity`, whatever carried the credential
 * (a cookie, an OAuth access token) and whichever process asked.
 *
 * `activeOrganizationId` is a plain string, not an `OrganizationId`: the column is Better Auth's
 * `session`, while the value object belongs to `@nestposts/organizations`, which is built on this
 * package. Whoever knows what an organization is parses it.
 *
 * `scopes` are what the credential may be used for: an OAuth access token's are what the user
 * allowed its client on the consent screen, and a cookie of this system's own holds every one of
 * `OAUTH_SCOPES`, so only its roles restrict it.
 *
 * Built with `Identity.parse({...})`, which validates every field into its value object.
 */
export class Identity extends ValidatedDto(IdentitySchema) {
  /** Whether the caller holds at least one of `roles`. */
  hasAnyRole(roles: readonly string[]): boolean {
    return roles.some((role) => this.roles.includes(role));
  }

  /** Whether the caller's credential was granted every one of `scopes`. */
  hasScopes(scopes: readonly string[]): boolean {
    return scopes.every((scope) => this.scopes.includes(scope));
  }
}
