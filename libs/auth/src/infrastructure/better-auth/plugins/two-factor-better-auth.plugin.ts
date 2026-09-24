import type { FactoryProvider } from '@nestjs/common';
import { twoFactor } from 'better-auth/plugins';

import { APP_NAME } from '../../../domain/auth/app-name';
import { AuthExpirations } from '../emails/auth-expirations';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { TWO_FACTOR_BETTER_AUTH_PLUGIN } from './tokens';

export const TwoFactorBetterAuthPluginProvider = {
  provide: TWO_FACTOR_BETTER_AUTH_PLUGIN,
  useFactory: (emails: BetterAuthEmails) =>
    twoFactor({
      issuer: APP_NAME,
      otpOptions: {
        period: AuthExpirations.twoFactorOtpMinutes,
        storeOTP: 'hashed',
        sendOTP: ({ user, otp }) => emails.twoFactor({ user, otp }),
      },
    }),
  inject: [BetterAuthEmails],
} satisfies FactoryProvider;
