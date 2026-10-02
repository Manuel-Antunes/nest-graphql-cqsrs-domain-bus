import type { User } from '@a2a-js/sdk/server';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';

export class PlatformCaller implements User {
  constructor(
    readonly identity: Identity,
    readonly accessToken: string,
  ) {}

  get isAuthenticated(): boolean {
    return true;
  }

  get userName(): string {
    return this.identity.principal;
  }
}
