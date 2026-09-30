import { expect } from '@playwright/test';

import type { SignedInAuthApi } from '../../infrastructure/auth/signed-in-auth-api';
import type { ReceivedMail } from '../../infrastructure/mail/received-mail';
import type { Credentials } from '../../model/account';
import type { AcceptInvitationPage } from '../../pages/auth/accept-invitation.page';
import type { WebApp } from '../../pages/web-app';

export class Organizations {
  constructor(
    private readonly app: WebApp,
    private readonly api: SignedInAuthApi,
  ) {}

  async create(name: string): Promise<void> {
    await this.app.organizationSettings.open();
    await this.app.organizationSettings.create(name);
  }

  async createThroughTheApi(name: string, slug: string): Promise<void> {
    await this.api.createOrganization(name, slug);
  }

  /** A team of the active organization; answers its id. */
  createTeam(name: string): Promise<string> {
    return this.api.createTeam(name);
  }

  async invite(email: string): Promise<void> {
    await this.app.organizationSettings.open();
    await this.app.organizationSettings.manage();
    await this.app.people.open();
    await this.app.people.invite(email);
  }

  async followInvitation(
    invitation: ReceivedMail,
    invitee: Credentials,
  ): Promise<AcceptInvitationPage> {
    await this.app.visit(invitation.link('/auth/accept-invitation'));
    await expect(this.app.page).toHaveURL(/\/auth\/sign-in\?redirectTo=/);
    await this.app.signIn.settle();
    await this.app.signIn.submit(invitee);
    await expect(this.app.page).toHaveURL(/\/auth\/accept-invitation/);
    return this.app.acceptInvitation;
  }

  async switchBetween(active: string, next: string): Promise<void> {
    await this.app.feed.open({ settle: true });
    await this.app.header.switchOrganization(active, next);
  }
}
