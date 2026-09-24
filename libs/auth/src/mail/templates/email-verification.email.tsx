import { defineEmailTemplate } from '@nestposts/mail/email-template';

import { APP_NAME } from '../../domain/auth/app-name';
import { EmailVerificationEmail } from '../components/email-verification';

export interface EmailVerificationTemplateProps {
  url: string;
  email: string;
  expirationMinutes: number;
}

export const EmailVerificationTemplate = defineEmailTemplate(
  'auth/email-verification',
  ({ url, email, expirationMinutes }: EmailVerificationTemplateProps) => (
    <EmailVerificationEmail
      url={url}
      email={email}
      expirationMinutes={expirationMinutes}
      appName={APP_NAME}
    />
  ),
);
