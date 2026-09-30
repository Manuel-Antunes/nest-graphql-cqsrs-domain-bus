import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OllamaEmbeddings } from '@langchain/ollama';
import { OpenAIEmbeddings } from '@langchain/openai';
import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AiEnvConfig } from '../config/ai.config';

export const EmbeddingModelFactory = {
  provide: 'EMBEDDING_MODEL',
  useFactory(configService: ConfigService) {
    const ai = configService.get<AiEnvConfig>('ai')!;
    if (ai.AI_PROVIDER === 'openai') {
      return new OpenAIEmbeddings({
        apiKey: ai.OPENAI_API_KEY,
        model: 'text-embedding-3-small',
      });
    } else if (ai.AI_PROVIDER === 'ollama') {
      return new OllamaEmbeddings({
        model: 'qwen3-embedding',
        dimensions: 3072,
      });
    } else if (ai.AI_PROVIDER === 'openrouter') {
      return new OpenAIEmbeddings({
        apiKey: ai.OPENROUTER_API_KEY,
        model: 'google/gemini-embedding-001',
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
      });
    } else {
      return new GoogleGenerativeAIEmbeddings({
        apiKey: ai.GEMINI_API_KEY,
        model: 'gemini-embedding-001',
      });
    }
  },
  inject: [ConfigService],
} satisfies FactoryProvider;
