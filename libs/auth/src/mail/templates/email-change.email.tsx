import { defineEmailTemplate } from '@nestposts/mail/email-template';

import { APP_NAME } from '../../domain/auth/app-name';
import { ChangeEmailConfirmationEmail } from '../components/change-email-confirmation';

export interface EmailChangeTemplateProps {
  url: string;
  currentEmail: string;
  newEmail: string;
  expirationMinutes: number;
}

export const EmailChangeTemplate = defineEmailTemplate(
  'auth/email-change',
  ({
    url,
    currentEmail,
    newEmail,
    expirationMinutes,
  }: EmailChangeTemplateProps) => (
    <ChangeEmailConfirmationEmail
      url={url}
      currentEmail={currentEmail}
      newEmail={newEmail}
      expirationMinutes={expirationMinutes}
      appName={APP_NAME}
    />
  ),
);
