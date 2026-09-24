import { Injectable } from '@nestjs/common';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { Notification } from '@nestposts/notifications/domain/notification/notification';
import { OnDemandNotifiable } from '@nestposts/notifications/domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { LoggingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/logging-on-demand-notifications';

import { AccountDeletionNotification } from '../../../domain/auth/notification/account-deletion.notification';
import { EmailChangeNotification } from '../../../domain/auth/notification/email-change.notification';
import { EmailVerificationNotification } from '../../../domain/auth/notification/email-verification.notification';
import { MagicLinkNotification } from '../../../domain/auth/notification/magic-link.notification';
import { OneTimePasswordNotification } from '../../../domain/auth/notification/one-time-password.notification';
import { PasswordResetNotification } from '../../../domain/auth/notification/password-reset.notification';
import type { OneTimePasswordPurpose } from '../../../domain/auth/schemas/one-time-password-purpose.schema';
import { AuthExpirations, inMinutes } from './auth-expirations';

export interface EmailedUser {
  readonly email: string;
  readonly name?: string | null;
}

export interface EmailedLink {
  readonly user: EmailedUser;
  readonly url: string;
}

/**
 * **Every email Better Auth asks for, as a notification.** Its methods are the callbacks the options
 * and the plugins are given — `sendResetPassword`, `sendMagicLink`, `sendVerificationOTP` — and each
 * one addresses the notification to the email it is about, by that address alone, and sends it
 * through {@link OnDemandNotifications}.
 *
 * By address alone because most of them are about somebody who is not a user yet, or whose profile
 * is not the point: a sign-up being verified, a magic link to an address nobody has used before.
 */
@Injectable()
export class BetterAuthEmails {
  constructor(private readonly notifications: OnDemandNotifications) {}

  /** Emails that go nowhere, for what builds the options without serving them — the schema. */
  static unsent(): BetterAuthEmails {
    return new BetterAuthEmails(new LoggingOnDemandNotifications());
  }

  verifyEmail({ user, url }: EmailedLink): Promise<void> {
    return this.send(
      user,
      new EmailVerificationNotification({
        url,
        expiresInMinutes: inMinutes(AuthExpirations.emailVerificationSeconds),
      }),
    );
  }

  resetPassword({ user, url }: EmailedLink): Promise<void> {
    return this.send(
      user,
      new PasswordResetNotification({
        url,
        expiresInMinutes: inMinutes(AuthExpirations.passwordResetSeconds),
      }),
    );
  }

  magicLink({ email, url }: { email: string; url: string }): Promise<void> {
    return this.send(
      { email },
      new MagicLinkNotification({
        url,
        expiresInMinutes: inMinutes(AuthExpirations.magicLinkSeconds),
      }),
    );
  }

  oneTimePassword({
    email,
    otp,
    type,
  }: {
    email: string;
    otp: string;
    type: Exclude<OneTimePasswordPurpose, 'two-factor'>;
  }): Promise<void> {
    return this.send(
      { email },
      new OneTimePasswordNotification({
        code: otp,
        purpose: type,
        expiresInMinutes: inMinutes(AuthExpirations.emailOtpSeconds),
      }),
    );
  }

  twoFactor({ user, otp }: { user: EmailedUser; otp: string }): Promise<void> {
    return this.send(
      user,
      new OneTimePasswordNotification({
        code: otp,
        purpose: 'two-factor',
        expiresInMinutes: AuthExpirations.twoFactorOtpMinutes,
      }),
    );
  }

  changeEmail({
    user,
    newEmail,
    url,
  }: EmailedLink & { newEmail: string }): Promise<void> {
    return this.send(
      user,
      new EmailChangeNotification({
        url,
        newEmail,
        expiresInMinutes: inMinutes(AuthExpirations.emailVerificationSeconds),
      }),
    );
  }

  deleteAccount({ user, url }: EmailedLink): Promise<void> {
    return this.send(
      user,
      new AccountDeletionNotification({
        url,
        expiresInMinutes: inMinutes(AuthExpirations.accountDeletionSeconds),
      }),
    );
  }

  private send(user: EmailedUser, notification: Notification): Promise<void> {
    return this.notifications.send(
      OnDemandNotifiable.route(EMAIL_CHANNEL, user.email, user.name ?? null),
      notification,
    );
  }
}
