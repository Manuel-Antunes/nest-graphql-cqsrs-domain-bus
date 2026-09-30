import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import aiConfig, { type AiConfig } from '../config/ai.config';
import { GeminiSTTService } from '../services/gemini-stt.service';
import { OpenAIWhisperSTTService } from '../services/openai-stt.service';

export const STTServiceFactory = {
  provide: 'STT_SERVICE',
  useFactory(aiConfig: AiConfig) {
    const ai = aiConfig;
    if (ai.AI_PROVIDER === 'openai' && ai.OPENAI_API_KEY) {
      return new OpenAIWhisperSTTService(ai.OPENAI_API_KEY);
    }
    if (!ai.GEMINI_API_KEY) {
      throw new Error(
        'STT_SERVICE: missing GEMINI_API_KEY (or set AI_PROVIDER=openai with OPENAI_API_KEY)',
      );
    }
    return new GeminiSTTService(ai.GEMINI_API_KEY);
  },
  inject: [ConfigService, aiConfig.KEY],
} satisfies FactoryProvider;
