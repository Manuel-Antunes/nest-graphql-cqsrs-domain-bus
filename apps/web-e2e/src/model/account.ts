export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface Account extends Credentials {
  readonly name: string;
  readonly credentialId: string;
}

export interface Accounts {
  readonly author: Account;
  readonly reader: Account;
  readonly admin: Account;
}
