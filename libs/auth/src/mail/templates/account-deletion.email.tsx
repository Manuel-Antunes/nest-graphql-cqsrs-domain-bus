import { defineEmailTemplate } from '@nestposts/mail/email-template';

import { APP_NAME } from '../../domain/auth/app-name';
import { DeleteAccountVerificationEmail } from '../components/delete-account-verification';

export interface AccountDeletionTemplateProps {
  url: string;
  email: string;
  expirationHours: number;
}

export const AccountDeletionTemplate = defineEmailTemplate(
  'auth/account-deletion',
  ({ url, email, expirationHours }: AccountDeletionTemplateProps) => (
    <DeleteAccountVerificationEmail
      url={url}
      email={email}
      expirationHours={expirationHours}
      appName={APP_NAME}
    />
  ),
);
