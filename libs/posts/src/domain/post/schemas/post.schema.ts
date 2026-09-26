import { Attachment } from '@nestposts/asset/domain/asset/attachment';
import { z } from 'zod';

import { PostContent } from '../vo/post-content';
import { PostId } from '../vo/post-id';
import { PostTitle } from '../vo/post-title';

export const PostSchema = z
  .object({
    id: PostId.field(),
    title: PostTitle.field(),
    content: PostContent.field(),
    createdAt: z.date(),
    asset: z.instanceof(Attachment).nullish(),
    updatedAt: z.date(),
    version: z.number().int().min(1),
    publishedAt: z.date().nullable().default(null),
  })
  .refine((state) => state.updatedAt >= state.createdAt, {
    error: 'updatedAt cannot precede createdAt',
    path: ['updatedAt'],
  })
  .refine(
    (state) => !state.publishedAt || state.publishedAt >= state.createdAt,
    {
      error: 'publishedAt cannot precede createdAt',
      path: ['publishedAt'],
    },
  );

export type IPost = z.input<typeof PostSchema>;
