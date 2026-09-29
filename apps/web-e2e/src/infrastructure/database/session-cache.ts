import { createClient } from '@redis/client';

type CachedSession = {
  session: Record<string, unknown>;
  user: Record<string, unknown>;
};

/**
 * **The copy of each session Better Auth keeps in Redis**, in front of the `session` table.
 *
 * A session there carries its user too, so a row this suite changes by hand — a role granted, a user
 * agent blanked — is not what the application reads until the copy says so as well: Better Auth
 * answers from Redis first, and lists a user's sessions from Redis only. The application itself never
 * has this problem, because it writes through Better Auth, which refreshes the copies; this suite goes
 * around it on purpose, so it refreshes them itself.
 *
 * Without a Redis there are no copies, and every method is a no-op.
 */
export class SessionCache {
  private static readonly PREFIX = 'better-auth:';

  constructor(private readonly url: string | undefined) {}

  rewriteUserOf(
    userId: string,
    change: (user: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    return this.rewrite(userId, (cached) => ({
      ...cached,
      user: change(cached.user),
    }));
  }

  rewriteSessionsOf(
    userId: string,
    change: (session: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    return this.rewrite(userId, (cached) => ({
      ...cached,
      session: change(cached.session),
    }));
  }

  private async rewrite(
    userId: string,
    change: (cached: CachedSession) => CachedSession,
  ): Promise<void> {
    if (!this.url) return;
    const client = createClient({ url: this.url });
    await client.connect();
    try {
      const list = await client.get(
        `${SessionCache.PREFIX}active-sessions-${userId}`,
      );
      const references = list
        ? (JSON.parse(list) as Array<{ token: string }>)
        : [];
      for (const { token } of references) {
        const key = `${SessionCache.PREFIX}${token}`;
        const cached = await client.get(key);
        if (cached) {
          await client.set(
            key,
            JSON.stringify(change(JSON.parse(cached) as CachedSession)),
            { KEEPTTL: true },
          );
        }
      }
    } finally {
      await client.close();
    }
  }
}
