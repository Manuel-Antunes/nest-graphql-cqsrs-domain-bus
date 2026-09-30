import type { ClientIdentity } from './client-identity';
import type { UserIdentity } from './user-identity';

/**
 * **Who is calling** — the one answer every way in gives: `@CurrentIdentity()`, `AuthService`, the
 * tenant guard and the gateway all read the caller as an `Identity`, whatever carried the credential
 * (a cookie, an OAuth access token) and whichever process asked.
 *
 * It is a union, told apart by `kind`: a {@link UserIdentity} is a person, a {@link ClientIdentity} an
 * OAuth client acting for itself. What both answer — `principal`, `roles`, `scopes`, `attributes`,
 * `credential`, `activeOrganizationId`, `hasAnyRole`, `hasScopes`, `attribute` — needs no narrowing;
 * what only a person has does, and the compiler says where.
 */
export type Identity = UserIdentity | ClientIdentity;
