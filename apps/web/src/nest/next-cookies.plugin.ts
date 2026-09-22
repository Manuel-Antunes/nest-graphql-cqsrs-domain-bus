import type { FactoryProvider } from '@nestjs/common';
import { nextCookies } from 'better-auth/next-js';

export const NEXT_COOKIES_BETTER_AUTH_PLUGIN = 'BETTER_AUTH_PLUGIN_NEXT_COOKIES';

/**
 * Writes Better Auth's `set-cookie` into Next's cookie store.
 *
 * It is what makes `authService.signInWithPassword(...)` work from a server action at all: there is
 * no HTTP response for Better Auth to write a header onto, so the plugin writes to the store Next
 * will flush instead. Better Auth requires cookie plugins LAST, which is why this is registered as a
 * trailing plugin rather than a contributed one.
 */
export const NextCookiesBetterAuthPluginProvider = {
  provide: NEXT_COOKIES_BETTER_AUTH_PLUGIN,
  useFactory: () => nextCookies(),
} satisfies FactoryProvider;
