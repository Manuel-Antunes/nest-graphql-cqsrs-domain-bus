import { defineEmailTemplate } from '@nestposts/mail/email-template';

import { APP_NAME } from '../../domain/auth/app-name';
import type { OneTimePasswordPurpose } from '../../domain/auth/schemas/one-time-password-purpose.schema';
import type { OtpEmailEmailLocalization } from '../components/otp-email';
import { OtpEmail } from '../components/otp-email';

export interface OneTimePasswordTemplateProps {
  code: string;
  email: string;
  purpose: OneTimePasswordPurpose;
  expirationMinutes: number;
}

type Wording = Pick<
  OtpEmailEmailLocalization,
  | 'YOUR_VERIFICATION_CODE_IS_CODE'
  | 'VERIFY_YOUR_EMAIL'
  | 'WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS'
>;

export const ONE_TIME_PASSWORD_WORDING: Record<
  OneTimePasswordPurpose,
  Wording
> = {
  'sign-in': {
    YOUR_VERIFICATION_CODE_IS_CODE: 'Your sign-in code is {verificationCode}',
    VERIFY_YOUR_EMAIL: 'Your sign-in code',
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      'Enter the code below to sign in to your {appName} account {email}.',
  },
  'email-verification': {
    YOUR_VERIFICATION_CODE_IS_CODE:
      'Your verification code is {verificationCode}',
    VERIFY_YOUR_EMAIL: 'Verify your email',
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      'We need to verify your email address {email} before you can access your {appName} account. Enter the code below in your open browser window.',
  },
  'forget-password': {
    YOUR_VERIFICATION_CODE_IS_CODE:
      'Your password reset code is {verificationCode}',
    VERIFY_YOUR_EMAIL: 'Reset your password',
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      'Enter the code below to choose a new password for your {appName} account {email}.',
  },
  'change-email': {
    YOUR_VERIFICATION_CODE_IS_CODE:
      'Your confirmation code is {verificationCode}',
    VERIFY_YOUR_EMAIL: 'Confirm your new email',
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      'Enter the code below to make {email} the email address of your {appName} account.',
  },
  'two-factor': {
    YOUR_VERIFICATION_CODE_IS_CODE:
      'Your two-factor code is {verificationCode}',
    VERIFY_YOUR_EMAIL: 'Your two-factor code',
    WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS:
      'Enter the code below to finish signing in to your {appName} account {email}.',
  },
};

export const OneTimePasswordTemplate = defineEmailTemplate(
  'auth/one-time-password',
  ({
    code,
    email,
    purpose,
    expirationMinutes,
  }: OneTimePasswordTemplateProps) => (
    <OtpEmail
      verificationCode={code}
      email={email}
      expirationMinutes={expirationMinutes}
      appName={APP_NAME}
      localization={ONE_TIME_PASSWORD_WORDING[purpose]}
    />
  ),
);
