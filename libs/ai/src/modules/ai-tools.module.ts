import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ExistingProvider, FactoryProvider, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChannelResponseProcessor } from '../channel/channel-response-processor';
import { ChatwootChannelResponseProcessor } from '../channel/chatwoot/chatwoot.channel-response-processor';
import aiConfig from '../config/ai.config';
import type { AiConfig } from '../config/schema';
import aiToolsConfig from '../config/tools.config';
import { AudioTranscribeModelFactory } from '../factories/transcribes/audio-transcribe-model.factory';
import { ImageTranscribeModelFactory } from '../factories/transcribes/image-transcribe-model.factory';
import { GeminiTTsService } from '../services/gemini-tts.service';
import { HuggingFaceTTSService } from '../services/hugging-face-tts.service';
import { AiModule } from './ai.module';

const TTSServiceFactory = {
  provide: 'TTS_SERVICE',
  useFactory(aiConfig: AiConfig, ssmlOptimizerLlm: BaseChatModel) {
    if (aiConfig.NODE_ENV === 'production' && aiConfig.GEMINI_API_KEY) {
      return new GeminiTTsService(aiConfig.GEMINI_API_KEY, ssmlOptimizerLlm);
    }
    return new HuggingFaceTTSService(aiConfig.TTS_HUGGING_FACE_API_URL);
  },
  inject: [aiConfig.KEY, 'CRIATIVE_CHAT_MODEL'],
} satisfies FactoryProvider;

const ChannelResponseProcessorProvider = {
  provide: ChannelResponseProcessor,
  useExisting: ChatwootChannelResponseProcessor,
} satisfies ExistingProvider;

@Module({
  imports: [
    ConfigModule.forFeature(aiConfig),
    ConfigModule.forFeature(aiToolsConfig),
    AiModule,
  ],
  providers: [
    TTSServiceFactory,
    AudioTranscribeModelFactory,
    ImageTranscribeModelFactory,
    ChatwootChannelResponseProcessor,
    ChannelResponseProcessorProvider,
  ],
  exports: [
    TTSServiceFactory.provide,
    AudioTranscribeModelFactory.provide,
    ImageTranscribeModelFactory.provide,
    ChannelResponseProcessorProvider.provide,
  ],
})
export class AiToolsModule {}
