import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import type { MailModuleOptions } from '@nestposts/mail/mail.module';
import { z } from 'zod';

const MailEnvSchema = z.object({
  MAIL_TRANSPORT: z.enum(['smtp', 'ses', 'json']).default('smtp'),
  MAIL_SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('Nest Posts <no-reply@nestposts.local>'),
  MAIL_SES_REGION: z.string().optional(),
  AWS_REGION: z.string().optional(),
});

export const mailConfig = registerAs('mail', () => {
  const parsed = MailEnvSchema.parse(process.env);
  const region = parsed.MAIL_SES_REGION ?? parsed.AWS_REGION;
  const transports: Record<
    typeof parsed.MAIL_TRANSPORT,
    () => NonNullable<MailModuleOptions['transport']>
  > = {
    smtp: () => parsed.MAIL_SMTP_URL,
    json: () => ({ jsonTransport: true }),
    ses: () => ({
      SES: {
        sesClient: new SESv2Client(region ? { region } : {}),
        SendEmailCommand,
      },
    }),
  };
  return {
    transport: transports[parsed.MAIL_TRANSPORT](),
    from: parsed.MAIL_FROM,
  };
});

export type MailConfig = ConfigType<typeof mailConfig>;
