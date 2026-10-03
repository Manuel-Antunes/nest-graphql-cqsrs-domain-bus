import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const ChatsEnvSchema = z.object({
  CHAT_API_URL: z.url().optional(),
});

export const chatsConfig = registerAs('chats', () => {
  const parsed = ChatsEnvSchema.parse(process.env);
  return { url: parsed.CHAT_API_URL ?? null };
});

export type ChatsConfig = ConfigType<typeof chatsConfig>;
