import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { MailModuleOptions } from '@nestposts/mail/mail.module';

import type { MailTransportKind } from './mail-env.schema';
import { MailEnvSchema } from './mail-env.schema';

export interface MailSettings {
  transport: NonNullable<MailModuleOptions['transport']>;
  from: string;
}

const transportFor = (
  kind: MailTransportKind,
  smtpUrl: string,
  region?: string,
): MailSettings['transport'] => {
  switch (kind) {
    case 'ses':
      return {
        SES: {
          sesClient: new SESv2Client(region ? { region } : {}),
          SendEmailCommand,
        },
      };
    case 'json':
      return { jsonTransport: true };
    case 'smtp':
      return smtpUrl;
  }
};

export const mailSettingsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): MailSettings => {
  const parsed = MailEnvSchema.parse(env);
  return {
    transport: transportFor(
      parsed.MAIL_TRANSPORT,
      parsed.MAIL_SMTP_URL,
      parsed.MAIL_SES_REGION ?? parsed.AWS_REGION,
    ),
    from: parsed.MAIL_FROM,
  };
};
