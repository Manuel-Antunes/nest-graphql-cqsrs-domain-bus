import type { Cookie } from '@playwright/test';
import { expect } from '@playwright/test';

import type { Credentials } from '../../model/account';
import type { WebApp } from '../../pages/web-app';

export class Authentication {
  private static readonly SESSION_COOKIE = 'better-auth';

  constructor(private readonly app: WebApp) {}

  /**
   * Signs in **through the form**, which is the only way this suite ever authenticates: the session
   * cookie has to be one `apps/web`'s own Better Auth wrote, on the web's origin.
   */
  async signIn(credentials: Credentials): Promise<void> {
    await this.attemptSignIn(credentials);
    await expect(this.app.header.identity(credentials.email)).toBeVisible();
  }

  async attemptSignIn(credentials: Credentials): Promise<void> {
    await this.app.signIn.open();
    await this.app.signIn.submit(credentials);
  }

  async signOut(): Promise<void> {
    await this.app.header.signOut();
  }

  async forgetSession(): Promise<void> {
    await this.app.page.context().clearCookies();
  }

  async sessionCookie(): Promise<Cookie | undefined> {
    const [session] = await this.sessionCookies();
    return session;
  }

  async liveSessionCookies(): Promise<Cookie[]> {
    return (await this.sessionCookies()).filter(
      (cookie) => cookie.value !== '',
    );
  }

  async cookieHeader(): Promise<string> {
    return (await this.sessionCookies())
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  private async sessionCookies(): Promise<Cookie[]> {
    return (await this.app.page.context().cookies()).filter((cookie) =>
      cookie.name.includes(Authentication.SESSION_COOKIE),
    );
  }
}
