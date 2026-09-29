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
 * Built with `Identity.parse({...})`, which validates every field into its value object.
 */
export class Identity extends ValidatedDto(IdentitySchema) {
  /** Whether the caller holds at least one of `roles`. */
  hasAnyRole(roles: readonly string[]): boolean {
    return roles.some((role) => this.roles.includes(role));
  }
}
