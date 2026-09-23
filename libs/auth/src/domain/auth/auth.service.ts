import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import type { Session } from './session';

export type PermissionRequest = Readonly<Record<string, readonly string[]>>;

export interface PasswordCredentials {
  readonly email: string;
  readonly password: string;
}

export interface NewCredential extends PasswordCredentials {
  readonly name: string;
}

/** What signing in produced: the session that now exists, whoever is holding the cookie for it. */
export interface SignedIn {
  readonly token: string;
  readonly credentialId: CredentialId;
}

/**
 * **Who is making THIS request** — a request-scoped service, so nothing has to carry headers around
 * to ask.
 *
 * The request is the constructor's business and no method's: an instance belongs to one request, so
 * `session()` can only ever mean "this one's". A caller that wanted to ask about a different request
 * would have to get a different instance, which is exactly the constraint that makes passing the
 * wrong headers impossible.
 */
export abstract class AuthService {
  /** The request's headers, as Better Auth reads them. */
  abstract readonly headers: Headers;

  abstract session(): Promise<Session | null>;

  abstract requireSession(): Promise<Session>;

  /**
   * Signs in with a password, for a caller that IS the server.
   *
   * On the wire this is `/sign-in/email`, and a browser gets there by itself. A Next server action
   * cannot: it has no browser to redirect, and the cookie has to be written into ITS response. So it
   * calls this, and whichever cookie plugin the composition root registered does the writing.
   */
  abstract signInWithPassword(
    credentials: PasswordCredentials,
  ): Promise<SignedIn>;

  abstract signUpWithPassword(credential: NewCredential): Promise<SignedIn>;

  abstract signOut(): Promise<void>;

  abstract hasRole(roles: readonly string[]): Promise<boolean>;

  abstract hasPermission(permissions: PermissionRequest): Promise<boolean>;

  abstract openApiSchema(): Promise<unknown>;
}
