import {
  emailTemplateNamed,
  renderEmailTemplate,
} from '@nestposts/mail/email-template';
import type { Mail } from '@nestposts/mail/mail';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';
import { ON_DEMAND_NOTIFIABLE_TYPE } from '@nestposts/notifications/domain/notification/on-demand-notifiable';
import { RecordingOnDemandNotifications } from '@nestposts/notifications/testing/recording-on-demand-notifications';

import { ACCOUNT_DELETION_NOTIFICATION } from '../../../domain/auth/notification/account-deletion.notification';
import { EMAIL_CHANGE_NOTIFICATION } from '../../../domain/auth/notification/email-change.notification';
import { EMAIL_VERIFICATION_NOTIFICATION } from '../../../domain/auth/notification/email-verification.notification';
import { MAGIC_LINK_NOTIFICATION } from '../../../domain/auth/notification/magic-link.notification';
import { ONE_TIME_PASSWORD_NOTIFICATION } from '../../../domain/auth/notification/one-time-password.notification';
import { PASSWORD_RESET_NOTIFICATION } from '../../../domain/auth/notification/password-reset.notification';
import { BetterAuthEmails } from './better-auth-emails';

const ada = { email: 'ada@example.com', name: 'Ada' };

interface Delivered {
  subject: string;
  to: unknown;
  html: string;
}

const delivered = async (
  sent: RecordingOnDemandNotifications,
  type: string,
): Promise<Delivered> => {
  const entry = sent.last(type);
  if (!entry) throw new Error(`nothing of type ${type} was sent`);
  const recipient = NotificationRecipient.of(entry.notifiable, [EMAIL_CHANNEL]);
  const notification = entry.notification as Notification & MailNotification;
  const mail = (await notification.toMail(recipient)) as Mail;
  const { message, view } = (await mail.build()).toObject();
  if (!view) throw new Error(`${type} renders no view`);
  return {
    subject: String(message.subject),
    to: message.to,
    html: await renderEmailTemplate(
      emailTemplateNamed(view.template),
      view.context,
    ),
  };
};

describe('BetterAuthEmails', () => {
  let sent: RecordingOnDemandNotifications;
  let emails: BetterAuthEmails;

  beforeEach(() => {
    sent = new RecordingOnDemandNotifications();
    emails = new BetterAuthEmails(sent);
  });

  it('turns a verification request into an email-only notification addressed by the email alone', async () => {
    await emails.verifyEmail({
      user: ada,
      url: 'https://web.test/api/auth/verify-email?token=abc',
    });

    const [entry] = sent.sent;
    expect(entry.notification.type).toBe(EMAIL_VERIFICATION_NOTIFICATION);
    expect(entry.notification.channelsFor(entry.notifiable)).toEqual([
      EMAIL_CHANNEL,
    ]);
    expect(entry.notifiable).toMatchObject({
      notifiableType: ON_DEMAND_NOTIFIABLE_TYPE,
      notifiableId: 'ada@example.com',
      notifiableName: 'Ada',
    });

    const mail = await delivered(sent, EMAIL_VERIFICATION_NOTIFICATION);
    expect(mail.subject).toBe('Verify your email address');
    expect(mail.to).toEqual([{ address: 'ada@example.com', name: 'Ada' }]);
    expect(mail.html).toContain(
      'https://web.test/api/auth/verify-email?token=abc',
    );
    expect(mail.html).toContain('Nest Posts');
  });

  it('sends the reset link, the magic link and the deletion link to the address that asked', async () => {
    await emails.resetPassword({
      user: ada,
      url: 'https://web.test/api/auth/reset-password/tok',
    });
    await emails.magicLink({
      email: 'someone-new@example.com',
      url: 'https://web.test/api/auth/magic-link/verify?token=m',
    });
    await emails.deleteAccount({
      user: ada,
      url: 'https://web.test/api/auth/delete-user/callback?token=d',
    });

    const reset = await delivered(sent, PASSWORD_RESET_NOTIFICATION);
    expect(reset.subject).toBe('Reset your password');
    expect(reset.html).toContain(
      'https://web.test/api/auth/reset-password/tok',
    );

    const magic = await delivered(sent, MAGIC_LINK_NOTIFICATION);
    expect(magic.subject).toBe('Sign in to Nest Posts');
    expect(magic.to).toEqual(['someone-new@example.com']);
    expect(magic.html).toContain('token=m');

    const deletion = await delivered(sent, ACCOUNT_DELETION_NOTIFICATION);
    expect(deletion.subject).toBe('Confirm the deletion of your account');
    expect(deletion.html).toContain('token=d');
  });

  it('confirms an email change at the CURRENT address, naming the new one', async () => {
    await emails.changeEmail({
      user: ada,
      newEmail: 'ada@new.example.com',
      url: 'https://web.test/api/auth/verify-email?token=c',
    });

    const change = await delivered(sent, EMAIL_CHANGE_NOTIFICATION);
    expect(change.to).toEqual([{ address: 'ada@example.com', name: 'Ada' }]);
    expect(change.html).toContain('ada@new.example.com');
    expect(change.html).toContain('token=c');
  });

  it.each([
    ['sign-in', 'Your sign-in code'],
    ['email-verification', 'Verify your email'],
    ['forget-password', 'Reset your password'],
    ['change-email', 'Confirm your new email'],
  ] as const)('words a %s code for what it is for', async (type, subject) => {
    await emails.oneTimePassword({
      email: 'ada@example.com',
      otp: '482913',
      type,
    });

    const code = await delivered(sent, ONE_TIME_PASSWORD_NOTIFICATION);
    expect(code.subject).toBe(subject);
    expect(code.html).toContain('482913');
  });

  it('mails the two-factor code to the user signing in', async () => {
    await emails.twoFactor({ user: ada, otp: '771204' });

    const code = await delivered(sent, ONE_TIME_PASSWORD_NOTIFICATION);
    expect(code.subject).toBe('Your two-factor code');
    expect(code.to).toEqual([{ address: 'ada@example.com', name: 'Ada' }]);
    expect(code.html).toContain('771204');
  });

  it('keeps the secret in the notification data, which only the email channel reads', async () => {
    await emails.oneTimePassword({
      email: 'ada@example.com',
      otp: '000111',
      type: 'sign-in',
    });

    expect(sent.sent[0].notification.data).toMatchObject({
      code: '000111',
      purpose: 'sign-in',
      expiresInMinutes: 5,
    });
  });
});
