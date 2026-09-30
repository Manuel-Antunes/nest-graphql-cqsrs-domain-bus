import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import aiConfig from '../../config/ai.config';
import type { AiConfig } from '../../config/schema';

export const AudioTranscribeModelFactory = {
  provide: 'AUDIO_TRANSCRIBE_MODEL',
  useFactory(aiConfig: AiConfig) {
    const ai = aiConfig;
    if (ai.AI_PROVIDER === 'openai') {
      return new ChatOpenAI({
        apiKey: ai.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo',
      });
    } else {
      return new ChatGoogleGenerativeAI({
        apiKey: ai.GEMINI_API_KEY,
        model: 'gemini-2.5-flash',
      });
    }
  },
  inject: [aiConfig.KEY],
} satisfies FactoryProvider;
AudioTranscribeModelFactory;
