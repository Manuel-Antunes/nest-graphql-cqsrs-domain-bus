import { z } from 'zod';

export const FirebaseCredentialsSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

export const FirebaseEnvSchema = z.object({
  FIREBASE_CREDENTIALS: z
    .string()
    .min(1)
    .optional()
    .transform((value, context) => {
      if (value === undefined) return undefined;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'FIREBASE_CREDENTIALS is not JSON',
        });
        return z.NEVER;
      }
    })
    .pipe(FirebaseCredentialsSchema.optional()),
});

export type FirebaseCredentials = z.infer<typeof FirebaseCredentialsSchema>;
