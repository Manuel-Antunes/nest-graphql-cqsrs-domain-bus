import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const SeedEnvSchema = z.object({
  SEED_AUTHOR_EMAIL: z.string().min(1).default('manuel@example.com'),
  SEED_AUTHOR_NAME: z.string().min(1).default('Manuel'),
  SEED_AUTHOR_PASSWORD: z.string().min(1).default('segredo123'),
  SEED_PROMOTED_EMAIL: z.string().min(1).default('promovido@example.com'),
  SEED_PROMOTED_NAME: z.string().min(1).default('Promovido'),
  SEED_PROMOTED_PASSWORD: z.string().min(1).default('segredo123'),
  SEED_READER_EMAIL: z.string().min(1).default('leitor@example.com'),
  SEED_READER_NAME: z.string().min(1).default('Leitor'),
  SEED_READER_PASSWORD: z.string().min(1).default('segredo123'),
});

export const seedConfig = registerAs('seed', () => {
  const parsed = SeedEnvSchema.parse(process.env);
  return {
    users: [
      {
        email: parsed.SEED_AUTHOR_EMAIL,
        name: parsed.SEED_AUTHOR_NAME,
        password: parsed.SEED_AUTHOR_PASSWORD,
        author: true,
      },
      {
        email: parsed.SEED_PROMOTED_EMAIL,
        name: parsed.SEED_PROMOTED_NAME,
        password: parsed.SEED_PROMOTED_PASSWORD,
        author: true,
      },
      {
        email: parsed.SEED_READER_EMAIL,
        name: parsed.SEED_READER_NAME,
        password: parsed.SEED_READER_PASSWORD,
        author: false,
      },
    ],
  };
});

export type SeedConfig = ConfigType<typeof seedConfig>;
