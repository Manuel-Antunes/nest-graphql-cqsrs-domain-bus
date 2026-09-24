import { z } from 'zod';

export const PushMessageSchema = z.object({
  notification: z.object({
    title: z.string(),
    body: z.string(),
    imageUrl: z.string().optional(),
  }),
  data: z.record(z.string(), z.string()).optional(),
  android: z
    .object({
      notification: z.object({ imageUrl: z.string().optional() }).optional(),
    })
    .optional(),
  apns: z
    .object({
      payload: z
        .object({
          aps: z
            .object({
              alert: z
                .union([
                  z.string(),
                  z.object({
                    title: z.string().optional(),
                    body: z.string().optional(),
                  }),
                ])
                .optional(),
              sound: z.string().optional(),
              badge: z.number().optional(),
              'mutable-content': z.number().optional(),
            })
            .optional(),
          fcmOptions: z.object({ imageUrl: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
  webpush: z
    .object({
      headers: z.record(z.string(), z.string()).optional(),
      data: z.record(z.string(), z.string()).optional(),
      notification: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export type PushMessage = z.infer<typeof PushMessageSchema>;
