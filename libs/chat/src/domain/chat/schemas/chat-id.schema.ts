import { z } from 'zod';

export const ChatIdSchema = z.uuid().brand<'ChatId'>();
