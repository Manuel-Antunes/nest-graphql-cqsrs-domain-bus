import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOpenRouter } from '@langchain/openrouter';
import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AiEnvConfig } from '../config/ai.config';

export const ChatModelFactory = {
  provide: 'CHAT_MODEL',
  useFactory(configService: ConfigService): BaseChatModel {
    const ai = configService.get<AiEnvConfig>('ai')!;
    if (ai.AI_PROVIDER === 'openai') {
      return new ChatOpenAI({
        apiKey: ai.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo',
      });
    } else if (ai.AI_PROVIDER === 'ollama') {
      return new ChatOllama({ model: 'qwen3.5' });
    } else if (ai.AI_PROVIDER === 'openrouter') {
      return new ChatOpenRouter({
        apiKey: ai.OPENROUTER_API_KEY,
        model: 'google/gemini-2.5-flash',
      });
    } else {
      return new ChatGoogleGenerativeAI({
        apiKey: ai.GEMINI_API_KEY,
        model: 'gemini-2.5-flash',
      });
    }
  },
  inject: [ConfigService],
} satisfies FactoryProvider;
