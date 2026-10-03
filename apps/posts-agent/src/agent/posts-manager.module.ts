import { ChatBedrockConverse } from '@langchain/aws';
import { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Module } from '@nestjs/common';
import { AgentMemories } from '@nestposts/ai/checkpoint/agent-memories';

import type { BedrockConfig } from '../config/bedrock.config';
import { bedrockConfig } from '../config/bedrock.config';
import type { MemoryConfig } from '../config/memory.config';
import { memoryConfig } from '../config/memory.config';
import { PostsMcpApps } from '../mcp/posts-mcp-apps';
import { PostsMcpTools } from '../mcp/posts-mcp-tools';
import { PostsManagerAgent } from './posts-manager.agent';

@Module({
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
    PostsMcpTools,
    PostsMcpApps,
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
    PostsManagerAgent,
  ],
  exports: [PostsManagerAgent],
})
export class PostsManagerModule {}
