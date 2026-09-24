import { defineEmailTemplate } from '@nestposts/mail/email-template';

import { APP_NAME } from '../../domain/auth/app-name';
import { ResetPasswordEmail } from '../components/reset-password';

export interface PasswordResetTemplateProps {
  url: string;
  email: string;
  expirationMinutes: number;
}

export const PasswordResetTemplate = defineEmailTemplate(
  'auth/password-reset',
  ({ url, email, expirationMinutes }: PasswordResetTemplateProps) => (
    <ResetPasswordEmail
      url={url}
      email={email}
      expirationMinutes={expirationMinutes}
      appName={APP_NAME}
    />
  ),
);
