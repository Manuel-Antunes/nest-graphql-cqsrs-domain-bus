import { ChatBedrockConverse } from '@langchain/aws';
import { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Module } from '@nestjs/common';
import { ChatApi } from '@nestposts/ai/chats/chat-api';
import { AgentMemories } from '@nestposts/ai/checkpoint/agent-memories';
import { WebSearchClient } from 'bedrock-agentcore/web-search';

import type { BedrockConfig } from '../config/bedrock.config';
import { bedrockConfig } from '../config/bedrock.config';
import type { ChatsConfig } from '../config/chats.config';
import { chatsConfig } from '../config/chats.config';
import type { MemoryConfig } from '../config/memory.config';
import { memoryConfig } from '../config/memory.config';
import type { WebSearchConfig } from '../config/web-search.config';
import { webSearchConfig } from '../config/web-search.config';
import { TheoAgent } from './theo.agent';

@Module({
  imports: [],
  providers: [
    {
      provide: ChatBedrockConverse,
      inject: [bedrockConfig.KEY],
      useFactory: ({ region, model, temperature }: BedrockConfig) =>
        new ChatBedrockConverse({
          region,
          model,
          ...(temperature === undefined ? {} : { temperature }),
        }),
    },
    { provide: 'BASE_MODEL', useExisting: ChatBedrockConverse },
    {
      provide: WebSearchClient,
      inject: [webSearchConfig.KEY, bedrockConfig.KEY],
      useFactory: ({ url }: WebSearchConfig, { region }: BedrockConfig) =>
        url ? new WebSearchClient({ region, gatewayEndpoint: url }) : null,
    },
    {
      provide: BaseCheckpointSaver,
      inject: [memoryConfig.KEY],
      useFactory: (memory: MemoryConfig) =>
        AgentMemories.checkpointerOf(memory),
    },
    {
      provide: BaseStore,
      inject: [memoryConfig.KEY],
      useFactory: (memory: MemoryConfig) => AgentMemories.storeOf(memory),
    },
    {
      provide: ChatApi,
      inject: [chatsConfig.KEY],
      useFactory: ({ url }: ChatsConfig) => (url ? new ChatApi(url) : null),
    },
    TheoAgent,
  ],
  exports: [TheoAgent],
})
export class TheoModule {}
