import type { FactoryProvider } from '@nestjs/common';
import { emailOTP } from 'better-auth/plugins';

import { AuthExpirations } from '../emails/auth-expirations';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { EMAIL_OTP_BETTER_AUTH_PLUGIN } from './tokens';

export const EmailOtpBetterAuthPluginProvider = {
  provide: EMAIL_OTP_BETTER_AUTH_PLUGIN,
  useFactory: (emails: BetterAuthEmails) =>
    emailOTP({
      expiresIn: AuthExpirations.emailOtpSeconds,
      storeOTP: 'hashed',
      sendVerificationOTP: ({ email, otp, type }) =>
        emails.oneTimePassword({ email, otp, type }),
    }),
  inject: [BetterAuthEmails],
} satisfies FactoryProvider;
