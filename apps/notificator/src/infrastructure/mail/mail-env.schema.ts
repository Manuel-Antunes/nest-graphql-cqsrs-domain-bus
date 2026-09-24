import { z } from 'zod';

export const MailTransportKindSchema = z.enum(['smtp', 'ses', 'json']);

export const MailEnvSchema = z.object({
  MAIL_TRANSPORT: MailTransportKindSchema.default('smtp'),
  MAIL_SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('Nest Posts <no-reply@nestposts.local>'),
  MAIL_SES_REGION: z.string().optional(),
  AWS_REGION: z.string().optional(),
});

export type MailTransportKind = z.infer<typeof MailTransportKindSchema>;
export type MailEnv = z.input<typeof MailEnvSchema>;
