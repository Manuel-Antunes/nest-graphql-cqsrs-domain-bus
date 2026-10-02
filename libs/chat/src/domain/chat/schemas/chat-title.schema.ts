import { z } from 'zod';

export const CHAT_TITLE_MAX_LENGTH = 80;

export const ChatTitleSchema = z
  .string({ error: 'title must not be empty' })
  .trim()
  .min(1, 'title must not be empty')
  .max(
    CHAT_TITLE_MAX_LENGTH,
    `title exceeds ${CHAT_TITLE_MAX_LENGTH} characters`,
  )
  .brand<'ChatTitle'>();
