import type { Credentials } from '../../model/account';
import { GraphqlClient } from '../graphql/graphql-client';
import type { DashboardToken } from './dashboard-token';

/**
 * Chatwoot reached directly, past the web and the gateway, for what the embedded dashboard cannot
 * show: which sign-in it refuses, where it sends someone without a session, and who it believes a
 * request comes from.
 */
export class ChatwootApi {
  static readonly SESSION_COOKIE = 'better-auth.session_token';

  constructor(readonly url: string) {}

  async passwordSignIn({ email, password }: Credentials): Promise<number> {
    const response = await fetch(`${this.url}/auth/sign_in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return response.status;
  }

  /** Where the dashboard sends whoever asks for it with this platform session, or with none. */
  async dashboardRedirect(sessionCookie?: string): Promise<string | null> {
    const response = await fetch(`${this.url}/app`, {
      redirect: 'manual',
      headers: sessionCookie
        ? { cookie: ChatwootApi.cookie(sessionCookie) }
        : {},
    });
    return response.headers.get('location');
  }

  async profileStatus(
    token: DashboardToken,
    sessionCookie?: string,
  ): Promise<number> {
    const response = await fetch(`${this.url}/api/v1/profile`, {
      headers: {
        ...token.headers(),
        ...(sessionCookie ? { cookie: ChatwootApi.cookie(sessionCookie) } : {}),
      },
    });
    return response.status;
  }

  /** Chatwoot's own subgraph, as the gateway calls it: the caller's cookie and the tenant it names. */
  graphql(sessionCookie: string, tenant?: string): GraphqlClient {
    return GraphqlClient.at(`${this.url}/graphql`, {
      cookie: ChatwootApi.cookie(sessionCookie),
      ...(tenant ? { 'x-tenant': tenant } : {}),
    });
  }

  private static cookie(value: string): string {
    return `${ChatwootApi.SESSION_COOKIE}=${value}`;
  }
}
