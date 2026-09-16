import { z } from 'zod';

export const PostIdSchema = z.uuid().brand<'PostId'>();
