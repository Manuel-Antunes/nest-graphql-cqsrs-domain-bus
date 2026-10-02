import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const McpEnvSchema = z.object({
  POSTS_MCP_URL: z.url().default('http://localhost:8000/mcp'),
  POSTS_MCP_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_000),
});

export const mcpConfig = registerAs('mcp', () => {
  const parsed = McpEnvSchema.parse(process.env);
  return {
    url: parsed.POSTS_MCP_URL,
    connectTimeoutMs: parsed.POSTS_MCP_CONNECT_TIMEOUT_MS,
  };
});

export type McpConfig = ConfigType<typeof mcpConfig>;
