import { z } from 'zod';

export const Neo4jConfigEnvSchema = z.object({
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().default('local_local'),
  NEO4J_DATABASE: z.string().default('neo4j'),
});

export const AiConfigEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  AI_PROVIDER: z
    .enum(['openai', 'google', 'ollama', 'openrouter'])
    .default('google'),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  TTS_HUGGING_FACE_API_URL: z.string().default('http://localhost:8083'),
  GATEWAY_URL: z.url().default('http://localhost:4000/graphql'),
});

export const AiToolsConfigEnvSchema = z.object({
  EVOLUTION_API_URL: z.url().default('http://localhost:8085'),
  EVOLUTION_API_KEY: z.string().default('429683C4-C091-450F-A9F7-7080EE35A9BE'),
  EVOLUTION_INSTANCE_NAME: z.string().default('NATASHA'),
});

export type AiConfig = z.infer<typeof AiConfigEnvSchema>;
export type AiToolsConfig = z.infer<typeof AiToolsConfigEnvSchema>;
