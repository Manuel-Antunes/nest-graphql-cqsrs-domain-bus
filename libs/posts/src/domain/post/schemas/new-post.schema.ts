import { z } from 'zod';

import { PostContent } from '../vo/post-content';
import { PostTitle } from '../vo/post-title';

export const NewPostSchema = z.object({
  title: PostTitle.field(),
  content: PostContent.field(),
});
export type NewPost = z.input<typeof NewPostSchema>;

export const PostChangesSchema = z.object({
  title: PostTitle.field().nullish(),
  content: PostContent.field().nullish(),
});
export type PostChanges = z.input<typeof PostChangesSchema>;
