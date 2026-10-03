import type { APIResponse, Page } from '@playwright/test';

import { AppHeader } from '../components/app-header.component';
import { NotificationBell } from '../components/notification-bell.component';
import { UsersPage } from './admin/users.page';
import { AcceptInvitationPage } from './auth/accept-invitation.page';
import { EmailOtpPage } from './auth/email-otp.page';
import { ForgotPasswordPage } from './auth/forgot-password.page';
import { MagicLinkPage } from './auth/magic-link.page';
import { OAuthConsentPage } from './auth/oauth-consent.page';
import { ResetPasswordPage } from './auth/reset-password.page';
import { SignInPage } from './auth/sign-in.page';
import { SignUpPage } from './auth/sign-up.page';
import { TwoFactorPage } from './auth/two-factor.page';
import { ClientsPage } from './clients.page';
import { FederationPage } from './federation.page';
import { FeedPage } from './feed.page';
import { MePage } from './me.page';
import { PeoplePage } from './organization/people.page';
import { PolarCheckout } from './polar/polar-checkout.page';
import { PolarPortal } from './polar/polar-portal.page';
import { NewPostPage } from './posts/new-post.page';
import { PostPage } from './posts/post.page';
import { AccountSettingsPage } from './settings/account-settings.page';
import { BillingSettingsPage } from './settings/billing-settings.page';
import { OrganizationSettingsPage } from './settings/organization-settings.page';
import { SecuritySettingsPage } from './settings/security-settings.page';
import { SupportPage } from './support.page';
import { TheoPage } from './theo.page';

export class WebApp {
  readonly header: AppHeader;
  readonly notificationBell: NotificationBell;

  readonly signIn: SignInPage;
  readonly signUp: SignUpPage;
  readonly forgotPassword: ForgotPasswordPage;
  readonly resetPassword: ResetPasswordPage;
  readonly magicLink: MagicLinkPage;
  readonly emailOtp: EmailOtpPage;
  readonly twoFactor: TwoFactorPage;
  readonly acceptInvitation: AcceptInvitationPage;
  readonly oauthConsent: OAuthConsentPage;

  readonly feed: FeedPage;
  readonly newPost: NewPostPage;
  readonly me: MePage;
  readonly federation: FederationPage;
  readonly clients: ClientsPage;
  readonly support: SupportPage;
  readonly theo: TheoPage;

  readonly accountSettings: AccountSettingsPage;
  readonly securitySettings: SecuritySettingsPage;
  readonly organizationSettings: OrganizationSettingsPage;
  readonly billingSettings: BillingSettingsPage;
  readonly people: PeoplePage;
  readonly users: UsersPage;

  readonly polarPortal: PolarPortal;

  constructor(readonly page: Page) {
    this.header = new AppHeader(page);
    this.notificationBell = new NotificationBell(page);

    this.signIn = new SignInPage(page);
    this.signUp = new SignUpPage(page);
    this.forgotPassword = new ForgotPasswordPage(page);
    this.resetPassword = new ResetPasswordPage(page);
    this.magicLink = new MagicLinkPage(page);
    this.emailOtp = new EmailOtpPage(page);
    this.twoFactor = new TwoFactorPage(page);
    this.acceptInvitation = new AcceptInvitationPage(page);
    this.oauthConsent = new OAuthConsentPage(page);

    this.feed = new FeedPage(page);
    this.newPost = new NewPostPage(page);
    this.me = new MePage(page);
    this.federation = new FederationPage(page);
    this.clients = new ClientsPage(page);
    this.support = new SupportPage(page);
    this.theo = new TheoPage(page);

    this.accountSettings = new AccountSettingsPage(page);
    this.securitySettings = new SecuritySettingsPage(page);
    this.organizationSettings = new OrganizationSettingsPage(page);
    this.billingSettings = new BillingSettingsPage(page);
    this.people = new PeoplePage(page);
    this.users = new UsersPage(page);

    this.polarPortal = new PolarPortal(page);
  }

  post(id: string): PostPage {
    return new PostPage(this.page, id);
  }

  polarCheckout(returnsTo: string): PolarCheckout {
    return new PolarCheckout(this.page, returnsTo);
  }

  async visit(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  /** A cookie this browser holds, by name — what it would send to any localhost port. */
  async cookie(name: string): Promise<string | undefined> {
    const cookies = await this.page.context().cookies();
    return cookies.find((cookie) => cookie.name === name)?.value;
  }

  fetch(url: string): Promise<APIResponse> {
    return this.page.request.get(url);
  }

  originsRequesting(pathPart: string): string[] {
    const origins: string[] = [];
    this.page.on('request', (request) => {
      if (request.url().includes(pathPart)) {
        origins.push(new URL(request.url()).origin);
      }
    });
    return origins;
  }
}
