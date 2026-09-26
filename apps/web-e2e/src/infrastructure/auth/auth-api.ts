export interface SignUp {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly callbackPath?: string;
}

export class AuthApi {
  constructor(private readonly webUrl: string) {}

  async signUp({
    email,
    name,
    password,
    callbackPath,
  }: SignUp): Promise<{ user: { id: string } }> {
    const response = await fetch(`${this.webUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': this.webUrl },
      body: JSON.stringify({
        email,
        name,
        password,
        ...(callbackPath
          ? { callbackURL: `${this.webUrl}${callbackPath}` }
          : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(
        `sign-up of ${email} failed (${response.status}): ${await response.text()}`,
      );
    }
    return (await response.json()) as { user: { id: string } };
  }

  async follow(link: string): Promise<void> {
    const response = await fetch(link, { redirect: 'manual' });
    if (response.status >= 400) {
      throw new Error(
        `following ${link} failed (${response.status}): ${await response.text()}`,
      );
    }
  }
}
