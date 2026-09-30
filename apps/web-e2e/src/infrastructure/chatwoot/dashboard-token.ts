/**
 * The DeviseTokenAuth credentials Chatwoot's dashboard keeps in its `cw_d_session_info` cookie and
 * sends as headers on every API call — the token Chatwoot minted for a platform session, which it
 * must honour only beside that session.
 */
export class DashboardToken {
  static readonly COOKIE = 'cw_d_session_info';

  private constructor(private readonly credentials: Record<string, string>) {}

  static fromCookie(value: string): DashboardToken {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<
      string,
      string
    >;
    return new DashboardToken({
      'access-token': parsed['access-token'] ?? '',
      client: parsed.client ?? '',
      uid: parsed.uid ?? '',
      'token-type': parsed['token-type'] ?? 'Bearer',
      expiry: parsed.expiry ?? '',
    });
  }

  get uid(): string {
    return this.credentials.uid ?? '';
  }

  headers(): Record<string, string> {
    return { ...this.credentials };
  }
}
