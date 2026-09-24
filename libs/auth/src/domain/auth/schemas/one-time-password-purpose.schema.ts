import { z } from 'zod';

export const OneTimePasswordPurposeSchema = z.enum([
  'sign-in',
  'email-verification',
  'forget-password',
  'change-email',
  'two-factor',
]);

export type OneTimePasswordPurpose = z.infer<
  typeof OneTimePasswordPurposeSchema
>;
