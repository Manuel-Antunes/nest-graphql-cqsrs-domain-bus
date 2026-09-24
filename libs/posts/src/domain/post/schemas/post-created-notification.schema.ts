import { z } from 'zod';

import { PostIdSchema } from './post-id.schema';

export const PostCreatedNotificationSchema = z.object({
  postId: PostIdSchema,
  title: z.string().min(1),
  url: z.url(),
});

export type PostCreatedNotificationData = z.infer<
  typeof PostCreatedNotificationSchema
>;
