import { defineEmailTemplate } from '@nestposts/mail/email-template';

import { APP_NAME } from '../../domain/auth/app-name';
import { MagicLinkEmail } from '../components/magic-link';

export interface MagicLinkTemplateProps {
  url: string;
  email: string;
  expirationMinutes: number;
}

export const MagicLinkTemplate = defineEmailTemplate(
  'auth/magic-link',
  ({ url, email, expirationMinutes }: MagicLinkTemplateProps) => (
    <MagicLinkEmail
      url={url}
      email={email}
      expirationMinutes={expirationMinutes}
      appName={APP_NAME}
    />
  ),
);
