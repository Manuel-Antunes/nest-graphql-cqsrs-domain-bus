import type { Page } from '@playwright/test';

import type { RunEnvironment } from '../environment/run-environment';
import { OAuthProvider } from '../infrastructure/auth/oauth-provider';
import { SignedInAuthApi } from '../infrastructure/auth/signed-in-auth-api';
import { GraphqlClient } from '../infrastructure/graphql/graphql-client';
import type { Mailbox } from '../infrastructure/mail/mailbox';
import { WebApp } from '../pages/web-app';
import { AccountLifecycle } from './auth/account-lifecycle.workflow';
import { Authentication } from './auth/authentication.workflow';
import { PasswordRecovery } from './auth/password-recovery.workflow';
import { PasswordlessSignIn } from './auth/passwordless-sign-in.workflow';
import { TwoFactor } from './auth/two-factor.workflow';
import { Subscriptions } from './billing/subscriptions.workflow';
import { OAuthAuthorization } from './oauth/oauth-authorization.workflow';
import { Organizations } from './organizations/organizations.workflow';
import { Publishing } from './posts/publishing.workflow';

export interface VisitorServices {
  readonly environment: RunEnvironment;
  readonly mailbox: Mailbox;
}

export class Visitor {
  readonly app: WebApp;
  readonly graphql: GraphqlClient;

  readonly authentication: Authentication;
  readonly passwordRecovery: PasswordRecovery;
  readonly passwordless: PasswordlessSignIn;
  readonly twoFactor: TwoFactor;
  readonly accountLifecycle: AccountLifecycle;
  readonly publishing: Publishing;
  readonly organizations: Organizations;
  readonly subscriptions: Subscriptions;
  readonly oauth: OAuthAuthorization;

  constructor(
    readonly page: Page,
    { environment, mailbox }: VisitorServices,
  ) {
    const signedIn = new SignedInAuthApi(page.request, environment.webUrl);

    this.app = new WebApp(page);
    this.graphql = GraphqlClient.throughBrowser(page);

    this.authentication = new Authentication(this.app);
    this.passwordRecovery = new PasswordRecovery(this.app, mailbox);
    this.passwordless = new PasswordlessSignIn(this.app, mailbox);
    this.twoFactor = new TwoFactor(this.app, mailbox, signedIn);
    this.accountLifecycle = new AccountLifecycle(this.app, mailbox);
    this.publishing = new Publishing(this.app, this.graphql);
    this.organizations = new Organizations(this.app, signedIn);
    this.subscriptions = new Subscriptions(this.app, environment.webUrl);
    this.oauth = new OAuthAuthorization(
      this.app,
      signedIn,
      new OAuthProvider(environment.webUrl),
    );
  }

  async leave(): Promise<void> {
    await this.page.context().close();
  }
}
