import { AccountDeletionNotification } from './account-deletion.notification';
import { EmailChangeNotification } from './email-change.notification';
import { EmailVerificationNotification } from './email-verification.notification';
import { MagicLinkNotification } from './magic-link.notification';
import { OneTimePasswordNotification } from './one-time-password.notification';
import { PasswordResetNotification } from './password-reset.notification';

export const authNotifications = [
  EmailVerificationNotification,
  PasswordResetNotification,
  MagicLinkNotification,
  OneTimePasswordNotification,
  EmailChangeNotification,
  AccountDeletionNotification,
] as const;
