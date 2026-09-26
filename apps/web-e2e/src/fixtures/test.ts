import { AuthApi } from '../infrastructure/auth/auth-api';
import type { GraphqlClient } from '../infrastructure/graphql/graphql-client';
import type { WebApp } from '../pages/web-app';
import type { AccountLifecycle } from '../workflows/auth/account-lifecycle.workflow';
import type { Authentication } from '../workflows/auth/authentication.workflow';
import type { PasswordRecovery } from '../workflows/auth/password-recovery.workflow';
import type { PasswordlessSignIn } from '../workflows/auth/passwordless-sign-in.workflow';
import { Registration } from '../workflows/auth/registration.workflow';
import type { TwoFactor } from '../workflows/auth/two-factor.workflow';
import type { Subscriptions } from '../workflows/billing/subscriptions.workflow';
import type { OAuthAuthorization } from '../workflows/oauth/oauth-authorization.workflow';
import type { Organizations } from '../workflows/organizations/organizations.workflow';
import type { Publishing } from '../workflows/posts/publishing.workflow';
import { Visitor } from '../workflows/visitor';
import { Visitors } from '../workflows/visitors';
import { test as infrastructure } from './infrastructure.fixtures';

export interface WorkflowFixtures {
  visitor: Visitor;
  visitors: Visitors;
  app: WebApp;
  graphql: GraphqlClient;
  registration: Registration;
  authentication: Authentication;
  passwordRecovery: PasswordRecovery;
  passwordless: PasswordlessSignIn;
  twoFactor: TwoFactor;
  accountLifecycle: AccountLifecycle;
  publishing: Publishing;
  organizations: Organizations;
  subscriptions: Subscriptions;
  oauth: OAuthAuthorization;
}

export const test = infrastructure.extend<WorkflowFixtures>({
  visitor: async ({ page, environment, mailbox }, use) => {
    await use(new Visitor(page, { environment, mailbox }));
  },

  visitors: async ({ browser, environment, mailbox }, use) => {
    const visitors = new Visitors(browser, { environment, mailbox });
    await use(visitors);
    await visitors.leave();
  },

  registration: async ({ environment, mailbox, credentialRecords }, use) => {
    await use(
      new Registration(
        new AuthApi(environment.webUrl),
        mailbox,
        credentialRecords,
      ),
    );
  },

  app: async ({ visitor }, use) => use(visitor.app),
  graphql: async ({ visitor }, use) => use(visitor.graphql),
  authentication: async ({ visitor }, use) => use(visitor.authentication),
  passwordRecovery: async ({ visitor }, use) => use(visitor.passwordRecovery),
  passwordless: async ({ visitor }, use) => use(visitor.passwordless),
  twoFactor: async ({ visitor }, use) => use(visitor.twoFactor),
  accountLifecycle: async ({ visitor }, use) => use(visitor.accountLifecycle),
  publishing: async ({ visitor }, use) => use(visitor.publishing),
  organizations: async ({ visitor }, use) => use(visitor.organizations),
  subscriptions: async ({ visitor }, use) => use(visitor.subscriptions),
  oauth: async ({ visitor }, use) => use(visitor.oauth),
});

export { expect } from '@playwright/test';
